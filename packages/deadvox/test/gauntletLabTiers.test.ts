import { describe, expect, it } from 'vitest';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { economyEligible, type LootContext, withLootDepth } from '../src/core/loot.ts';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import { lootSourcesOf } from '../src/core/site.ts';
import { compileAssembly, placedGroundLoot, placedPieces } from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';

const { registry } = startupContent();
const scale = makeScale(BLOCK_SIZE);
const TIERS = ['Tier1', 'Tier2', 'Tier3'] as const;

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
        expect(rollableTiers(source.context), `inner ${channel} rolls the deeper range`).toEqual([...TIERS]);
      }
    }
    const outerSources = at(...outerSpan, 'container');
    expect(outerSources.length, 'outer container source exists').toBeGreaterThan(0);
    for (const source of outerSources) {
      expect(rollableTiers(source.context), 'the outer range stops at its own tier').toEqual([TIERS[0], TIERS[1]]);
    }
  });
});

describe('gauntlet lab loot tiers by depth', () => {
  it(
    'lets a deeper level roll the lowest tier and a higher one besides, while level one rolls the lowest alone',
    () => {
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
      for (const tier of top.tiers) {
        expect(bottom.tiers, 'a deeper level keeps the lower tiers').toContain(tier);
      }
    },
    GAUNTLET_SITE_MS,
  );
});
