import { describe, expect, it } from 'vitest';
import { GauntletSite } from '../src/core/gauntlet.ts';
import {
  economyEligible,
  LOOT_TIERS,
  type LootContext,
  lootPointStream,
  lootSpawnPoint,
  militaryOnlyEconomy,
  rollLoot,
  withLootDepth,
} from '../src/core/loot.ts';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import { lootSourcesOf } from '../src/core/site.ts';
import { compileAssembly, placedGroundLoot, placedPieces } from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';
import { sweepGroup } from './sweeps.ts';

const { registry } = startupContent();
const scale = makeScale(BLOCK_SIZE);
const TIERS = LOOT_TIERS;

/** The tiers a source in this context can roll, found by asking whether an item of each tier alone would be admitted. */
const rollableTiers = (context: LootContext): string[] =>
  TIERS.filter((tier) => economyEligible({ usage: context.usage, tiers: [tier] }, context));

describe('nested tier ranges reach the loot sources', () => {
  // An inner range inside an outer one: the inner assembly's pieces and ground loot take the inner range.
  const crate = [...registry.furniture.values()].find((def) => def.container && def.size.every((n) => n >= 1))!;
  const [w, h, d] = crate.size;
  const style = [...registry.mapStyles.keys()][0]!;
  const row = (end: string) => `${'F'.repeat(w)}${end}`;
  const piece = {
    id: 'fixture_tier_piece',
    lootContext: { usage: ['Industrial' as const], tier: 'Tier1' as const },
    size: [w + 1, h, d] as [number, number, number],
    style,
    palette: {
      F: { furniture: crate.id, facing: 'n' as const },
      G: { groundLoot: { kind: 'empty' as const } },
      '.': { role: 'opening' as const, material: 'air' },
    },
    layers: Array.from({ length: h }, (_, y) => Array.from({ length: d }, () => row(y === 0 ? 'G' : '.'))),
    ownership: {
      layers: Array.from({ length: h }, (_, y) =>
        Array.from({ length: d }, () => `${'S'.repeat(w)}${y === 0 ? 'A' : '.'}`),
      ),
    },
    anchors: {},
    ports: [],
  };
  const range = (tier: 'Tier2' | 'Tier3') => ({ usage: ['Industrial' as const], tier, lowerTiers: true as const });
  const slot = (id: string, kind: 'piece' | 'assembly', ref: string, at: [number, number, number]) => ({
    id,
    at,
    size: kind === 'piece' ? piece.size : ([w + 1, h, d] as [number, number, number]),
    turn: 0 as const,
    choices: [{ ref: { kind, id: ref }, weight: 1 }],
  });
  const assembly = (
    id: string,
    lootContext: ReturnType<typeof range>,
    slots: ReturnType<typeof slot>[],
    x: number,
  ) => ({
    id,
    size: [x, h, d] as [number, number, number],
    lootContext,
    slots,
    joins: [],
    ports: [],
    anchors: {},
  });
  const inner = assembly('fixture_tier_inner', range('Tier3'), [slot('p', 'piece', piece.id, [0, 0, 0])], w + 1);
  const outer = assembly(
    'fixture_tier_outer',
    range('Tier2'),
    [slot('in', 'assembly', inner.id, [0, 0, 0]), slot('own', 'piece', piece.id, [w + 1, 0, 0])],
    2 * (w + 1),
  );
  const fixture = {
    ...registry,
    mapPieces: new Map([...registry.mapPieces, [piece.id, piece]]),
    mapAssemblies: new Map([...registry.mapAssemblies, [inner.id, inner], [outer.id, outer]]),
  } as unknown as typeof registry;

  it('gives the innermost range to its own furniture and ground loot and the outer range to the rest', () => {
    const template = compileAssembly(fixture, outer as never, { seed: 1, siteId: 'fixture' });
    const sources = lootSourcesOf(fixture, 'fixture', { template, origin: [0, 0, 0], turn: 0 });
    const at = (x0: number, x1: number, channel: string) =>
      sources.filter((source) => source.channel === channel && source.position[0] >= x0 && source.position[0] < x1);
    const innerSpan: [number, number] = [0, w + 1];
    const outerSpan: [number, number] = [w + 1, 2 * (w + 1)];
    for (const channel of ['container', 'ground']) {
      const innerSources = at(...innerSpan, channel);
      expect(innerSources.length, `inner ${channel} source exists`).toBeGreaterThan(0);
      for (const source of innerSources) {
        expect(rollableTiers(source.context), `inner ${channel} rolls the deeper range`).toEqual(
          TIERS.slice(0, TIERS.indexOf('Tier3') + 1),
        );
      }
    }
    const outerSources = at(...outerSpan, 'container');
    expect(outerSources.length, 'outer container source exists').toBeGreaterThan(0);
    for (const source of outerSources) {
      expect(rollableTiers(source.context), 'the outer range stops at its own tier').toEqual([TIERS[0], TIERS[1]]);
    }
  });
});

sweepGroup('gauntlet lab loot tiers by depth', () => {
  it('lets a deeper level roll the lowest tier and a higher one besides, while level one rolls the lowest alone', () => {
    const scenario = [...registry.scenarios.values()].find((candidate) => candidate.kind === 'gauntlet')!;
    const site = new GauntletSite({ seed: 1, registry, scale, scenario });
    const sources = site.placements
      .flatMap((placement) =>
        [...placedPieces(placement), ...placedGroundLoot(placement)]
          .filter((source) => source.lootDepth !== undefined)
          .map((source) => ({
            y: source.pos[1],
            tiers: rollableTiers(
              withLootDepth(placement.lootContext ?? placement.template.lootContext, source.lootDepth),
            ),
          })),
      )
      .sort((a, b) => b.y - a.y);
    expect(sources.length, 'lab sources carry a tier range').toBeGreaterThan(0);
    const top = sources[0]!;
    const bottom = sources.at(-1)!;
    expect(top.tiers, 'the top level rolls the lowest tier alone').toEqual([TIERS[0]]);
    expect(bottom.tiers.length, 'a deeper level rolls a higher tier').toBeGreaterThan(top.tiers.length);
    expect(bottom.tiers, 'the deepest level rolls the highest tier').toContain(TIERS.at(-1));
    for (const tier of top.tiers) {
      expect(bottom.tiers, 'a deeper level keeps the lower tiers').toContain(tier);
    }
  });

  it('rolls rifle supplies only from containers that carry a Military usage on a level below the first', () => {
    const scenario = [...registry.scenarios.values()].find((candidate) => candidate.kind === 'gauntlet')!;
    const site = new GauntletSite({ seed: 1, registry, scale, scenario });
    const sources = site.placements.flatMap((placement) =>
      lootSourcesOf(
        registry,
        'city',
        placement,
        site.plan.composition?.lootSources.find((source) => source.placement === placement)?.fixedLoot,
      ),
    );
    // A Military-only item of the second tier stands for rifle supplies without naming one.
    const rifle = { usage: ['Military' as const], tiers: ['Tier2' as const] };
    const lab = sources.filter((source) => source.context.lowerTiers === true);
    expect(lab.length, 'the lab declares tier ranges').toBeGreaterThan(0);
    const reaching = lab.filter((source) =>
      economyEligible(rifle, { ...source.context, usage: [...(source.usage ?? source.context.usage)] }),
    );
    expect(reaching.length, 'a lab container admits rifle supplies').toBeGreaterThan(0);
    for (const source of reaching) {
      expect(source.usage, 'only an explicit Military usage reaches them').toContain('Military');
      expect(source.context.tier, 'they sit below level one').not.toBe(TIERS[0]);
    }
    const container = reaching.find((source) => source.supply.kind === 'table')!;
    expect(container, 'a reaching container rolls a table').toBeDefined();
    let rolledMilitaryOnly = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const point = lootSpawnPoint(container);
      for (const { type } of rollLoot(registry, point, lootPointStream(seed, point))) {
        const economy = registry.items.get(type)?.economy;
        rolledMilitaryOnly += economy !== undefined && militaryOnlyEconomy(economy) ? 1 : 0;
      }
    }
    expect(rolledMilitaryOnly, 'the container can roll a rifle row at its level tier').toBeGreaterThan(0);
  });
});
