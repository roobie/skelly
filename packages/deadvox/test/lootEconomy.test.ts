import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { placementOf } from '../src/core/authoredPlacement.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import {
  economyEligible,
  ItemEconomySchema,
  LOOT_TIERS,
  type LootContext,
  LootContextSchema,
  type LootPointSource,
  lootPointStream,
  lootPointsByColumn,
  lootSpawnPoint,
  lootTypeIssue,
  militaryOnlyEconomy,
  rollLoot,
} from '../src/core/loot.ts';
import { lootSourcesOf } from '../src/core/site.ts';
import { compileTemplate, stackTemplate } from '../src/core/templates.ts';
import { baseRegistry } from './baseRegistry.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials } from './economyFixtures.ts';

const context: LootContext = { usage: ['Medical'], tier: 'Tier2' };
const TIERS = LOOT_TIERS;

/**
 * Every loot context a loaded source can roll under: each `lootContext`, and each `lootUsage` override paired with
 * every tier, so an override is checked whatever tier its owner sets.
 */
const loadedSourceContexts = (registry: Registry): LootContext[] => {
  const found = new Map<string, LootContext>();
  const add = (sourceContext: LootContext): void => {
    found.set(JSON.stringify(sourceContext), sourceContext);
  };
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      if (record.lootContext !== undefined) {
        add(record.lootContext as LootContext);
      }
      if (Array.isArray(record.lootUsage)) {
        for (const tier of TIERS) {
          add({ usage: record.lootUsage as LootContext['usage'], tier });
        }
      }
      Object.values(record).forEach(walk);
    }
  };
  for (const section of [
    registry.templates,
    registry.mapPieces,
    registry.mapAssemblies,
    registry.layouts,
    registry.scenarios,
  ]) {
    walk([...section.values()]);
  }
  return [...found.values()];
};
const source = (building: string, height: number): LootPointSource => ({
  site: 'fixture-site',
  building,
  anchor: [1, height, 2],
  channel: 'container',
  position: [1, height, 2],
  destination: [1, height, 2],
  context,
  supply: { kind: 'empty' },
  required: false,
});

describe('loot economy descriptions', () => {
  it('requires intersecting usage and exact tier membership, including explicit empty pools', () => {
    for (const row of [
      { usage: ['Medical'], tiers: ['Tier2'], eligible: true },
      { usage: ['Military', 'Medical'], tiers: ['Tier1', 'Tier2'], eligible: true },
      { usage: ['Industrial'], tiers: ['Tier2'], eligible: false },
      { usage: ['Medical'], tiers: ['Tier1', 'Tier3'], eligible: false },
      { usage: [], tiers: ['Tier2'], eligible: false },
      { usage: ['Medical'], tiers: [], eligible: false },
    ]) {
      const economy = safeParse(ItemEconomySchema, { usage: row.usage, tiers: row.tiers });
      expect(economy.success).toBe(true);
      if (!economy.success) {
        throw new Error('invalid fixture');
      }
      expect(economyEligible(economy.output, context)).toBe(row.eligible);
    }
  });

  it('rejects unknown, duplicate and missing authored metadata', () => {
    for (const economy of [
      { usage: ['Unknown'], tiers: ['Tier1'] },
      { usage: ['Medical', 'Medical'], tiers: ['Tier1'] },
      { usage: ['Medical'], tiers: ['Tier1', 'Tier1'] },
      { usage: ['Medical'], tiers: ['Unknown'] },
      { usage: ['Medical'] },
      { tiers: ['Tier1'] },
    ]) {
      expect(safeParse(ItemEconomySchema, economy).success).toBe(false);
    }
    expect(safeParse(LootContextSchema, { usage: ['Medical'] }).success).toBe(false);
  });

  it('rolls only items of the context tier, so a tier no item carries rolls nothing and breaks no table', () => {
    const registry = baseRegistry();
    const tables = [...registry.loot.keys()];
    expect(tables.length).toBeGreaterThan(0);
    const usage: LootContext['usage'] = ['Residential', 'Industrial', 'Medical', 'Hunting', 'Police', 'Military'];
    let rolledInCarriedTier = 0;
    for (const tier of LOOT_TIERS) {
      const unused = ![...registry.items.values()].some((item) => item.economy?.tiers.includes(tier));
      for (const table of tables) {
        const point = lootSpawnPoint({
          site: 'tier',
          building: table,
          anchor: [0, 0, 0],
          channel: 'container',
          position: [0, 0, 0],
          destination: [0, 0, 0],
          context: { usage, tier },
          supply: { kind: 'table', table },
          required: false,
        });
        const rolled = rollLoot(registry, point, lootPointStream(1, point));
        if (unused) {
          expect(rolled, `${table} rolls nothing in the unused ${tier}`).toEqual([]);
        } else {
          rolledInCarriedTier += rolled.length;
        }
        for (const { type } of rolled) {
          expect(registry.items.get(type)?.economy?.tiers, `${type} rolled in ${tier}`).toContain(tier);
        }
      }
    }
    expect(rolledInCarriedTier, 'some table rolls something in a tier items carry').toBeGreaterThan(0);
  });

  it('admits no Military-only item under Police and no Police-only item under Hunting, in the loaded content', () => {
    const items = [...baseRegistry().items.values()].filter((item) => item.economy !== undefined);
    const admits = (usage: LootContext['usage'][number], tier: LootContext['tier']): string[] =>
      items.filter((item) => economyEligible(item.economy!, { usage: [usage], tier })).map(({ id }) => id);
    // Stock a usage admits that common places (and, for Military, hunting places) do not.
    const onlyIn = (usage: LootContext['usage'][number], tier: LootContext['tier'], common: string[]): string[] =>
      admits(usage, tier).filter((id) => !common.includes(id));
    const military = TIERS.flatMap((tier) =>
      onlyIn('Military', tier, [...admits('Residential', tier), ...admits('Hunting', tier)]).map((id) => ({
        id,
        tier,
      })),
    );
    const police = TIERS.flatMap((tier) =>
      onlyIn('Police', tier, admits('Residential', tier)).map((id) => ({ id, tier })),
    );
    expect(military.length).toBeGreaterThan(0);
    expect(police.length).toBeGreaterThan(0);
    expect(military.filter(({ id, tier }) => admits('Police', tier).includes(id))).toEqual([]);
    expect(police.filter(({ id, tier }) => admits('Hunting', tier).includes(id))).toEqual([]);
  });

  it('admits a vignette analgesic only in source contexts that include Medical, across every loaded source', () => {
    const registry = baseRegistry();
    const strong = [...registry.items.values()].filter((item) => item.analgesic?.vignette !== undefined);
    expect(strong.length).toBeGreaterThan(0);
    const contexts = loadedSourceContexts(registry);
    const admitted = strong.flatMap((item) =>
      contexts
        .filter((sourceContext) => economyEligible(item.economy!, sourceContext))
        .map((sourceContext) => ({
          item: item.id,
          usage: sourceContext.usage,
        })),
    );
    expect(admitted.length).toBeGreaterThan(0);
    expect(admitted.filter(({ usage }) => !usage.includes('Medical'))).toEqual([]);
  });

  it('does not classify multi-usage supplies as military-only', () => {
    expect(militaryOnlyEconomy({ usage: ['Military'], tiers: ['Tier2'] })).toBe(true);
    expect(militaryOnlyEconomy({ usage: ['Military', 'Medical'], tiers: ['Tier2'] })).toBe(false);
    expect(militaryOnlyEconomy({ usage: [], tiers: [] })).toBe(false);
  });

  it('keeps empty stacked points and their streams independent of enumeration order', () => {
    const layers = [['.'], ['C'], ['.']];
    const storeys = 2;
    const { registry, issues } = buildRegistry([
      {
        source: 'economy-fixture',
        data: {
          furnitureMaterials: fixtureMaterials(),
          items: [
            {
              id: 'fixture_stock',
              name: 'Fixture stock',
              category: 'misc',
              weight: 1,
              size: [1, 1],
              economy: { usage: ['Hunting'], tiers: ['Tier2'] },
            },
          ],
          furniture: [
            {
              id: 'fixture_container',
              name: 'Fixture',
              size: [1, 1, 1],
              color: '#123456',
              container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1 }] },
              breach: fixtureBreach(),
              material: FIXTURE_MATERIAL,
            },
          ],
          templates: [
            {
              id: 'fixture_template',
              lootContext: context,
              size: [1, 3, 1],
              palette: { '.': 'air', C: { furniture: 'fixture_container', lootUsage: ['Hunting'] } },
              layers,
            },
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    const template = stackTemplate(compileTemplate(registry, registry.templates.get('fixture_template')!), storeys);
    const first = { template, origin: [0, 0, 0] as [number, number, number], turn: 0 as const };
    const second = { ...first, origin: [32, 0, 0] as [number, number, number] };
    const sources = [
      ...lootSourcesOf(registry, 'fixture-site', first, [
        { at: [0, 1, 0], items: [{ item: 'fixture_stock', placement: 'surface' }] },
      ]),
      ...lootSourcesOf(registry, 'fixture-site', second),
    ];
    expect(
      sources.some((point) => point.channel === 'surface' && point.required && point.supply.kind === 'fixed'),
    ).toBe(true);
    const containerAnchors = Array.from({ length: storeys }, (_, floor) => [
      0,
      layers.findIndex((layer) => layer.includes('C')) + floor * (layers.length - 1),
      0,
    ]);
    for (const placement of [first, second]) {
      const building = JSON.stringify([placement.origin, placement.turn]);
      expect(
        sources
          .filter((point) => point.building === building && point.channel === 'container')
          .map((point) => point.anchor),
      ).toEqual(containerAnchors);
    }
    expect(sources.every((point) => point.context.tier === context.tier)).toBe(true);
    expect(sources.every((point) => point.usage?.includes('Hunting'))).toBe(true);
    const read = (input: readonly LootPointSource[]) =>
      [...lootPointsByColumn(input).values()]
        .flat()
        .map((point) => ({
          id: point.id,
          value: lootPointStream(43, point).next(),
          supply: point.supply,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const forward = read(sources);
    expect(forward).toHaveLength(sources.length);
    expect(new Set(forward.map((point) => point.id)).size).toBe(sources.length);
    expect(
      sources.filter((point) => point.channel === 'container').every((point) => point.supply.kind === 'empty'),
    ).toBe(true);
    expect(read([...sources].reverse())).toEqual(forward);
    expect(
      read(
        lootSourcesOf(registry, 'fixture-site', {
          ...first,
          template: { ...template, id: 'unrelated_generated_name' },
        }),
      ),
    ).toEqual(read(lootSourcesOf(registry, 'fixture-site', first)));
    expect(() => lootPointsByColumn([sources[0]!, sources[0]!])).toThrow('duplicate loot spawn point');
  });

  it('rejects fitted and automatically installed items outside the source context', () => {
    const item = (id: string, usage: string[]) => ({
      id,
      name: id,
      category: 'misc',
      weight: 1,
      size: [1, 1],
      economy: { usage, tiers: ['Tier2'] },
    });
    const { registry, issues } = buildRegistry([
      {
        source: 'child-fixture',
        data: {
          items: [
            {
              ...item('fixture_host', ['Medical']),
              light: {
                intensity: 1,
                radius: 1,
                seenFrom: 1,
                color: '#ffffff',
                power: { battery: 'fixture_battery', chargePerGameHour: 1, swapSimSeconds: 2 },
              },
            },
            { ...item('fixture_battery', ['Medical']), battery: { capacity: 1 } },
            item('fixture_child', ['Military']),
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    expect(lootTypeIssue(registry, 'fixture_host', context)).toBeUndefined();
    expect(lootTypeIssue(registry, 'fixture_host', context, { slot: 'fixture_child' })).toContain('outside');
    const battery = registry.items.get('fixture_battery')!;
    registry.items.set(battery.id, { ...battery, economy: { usage: ['Military'], tiers: ['Tier2'] } });
    expect(lootTypeIssue(registry, 'fixture_host', context)).toContain('outside');
  });

  it('requires authored economy metadata at the registry boundary', () => {
    const item = { id: 'fixture_item', name: 'Fixture', category: 'misc', weight: 1, size: [1, 1] };
    const accepted = buildRegistry([
      { source: 'fixture', data: { items: [{ ...item, economy: { usage: [], tiers: [] } }] } },
    ]);
    expect(accepted.issues).toEqual([]);
    expect(accepted.registry.items.has(item.id)).toBe(true);
    const rejected = buildRegistry([{ source: 'fixture', data: { items: [item] } }]);
    expect(rejected.issues).toContainEqual(expect.objectContaining({ path: 'items[0].economy' }));
    expect(rejected.registry.items.has(item.id)).toBe(false);
  });

  it('requires source contexts and resolves building overrides over site tiers', () => {
    const template = { id: 'fixture_template', size: [1, 1, 1], palette: { '.': 'air' }, layers: [['.']] };
    const layout = {
      id: 'fixture_site',
      bounds: { x0: 0, z0: 0, x1: 4, z1: 4 },
      ground: 0,
      terrain: [],
      buildings: [],
      player: { position: [2, 0.5, 2], bearing: 0 },
      shamblers: [],
      woodlands: [],
      tracks: [],
    };
    const accepted = buildRegistry([
      {
        source: 'fixture',
        data: {
          templates: [{ ...template, lootContext: context }],
          layouts: [{ ...layout, lootContext: context }],
        },
      },
    ]);
    expect(accepted.issues).toEqual([]);
    const building = { template: template.id, position: [0, 0, 0] as [number, number, number], rotation: 0 as const };
    const siteContext: LootContext = { usage: ['Residential'], tier: 'Tier3' };
    expect(placementOf(accepted.registry, building, siteContext).lootContext).toEqual({
      usage: context.usage,
      tier: siteContext.tier,
    });
    const override: LootContext = { usage: ['Industrial'], tier: 'Tier1' };
    expect(placementOf(accepted.registry, { ...building, lootContext: override }, siteContext).lootContext).toEqual(
      override,
    );
    const rejected = buildRegistry([{ source: 'fixture', data: { templates: [template], layouts: [layout] } }]);
    expect(rejected.issues).toContainEqual(expect.objectContaining({ path: 'templates[0].lootContext' }));
    expect(rejected.issues).toContainEqual(expect.objectContaining({ path: 'layouts[0].lootContext' }));
  });

  it('separates channels and preserves inherited tier under an explicit empty usage override', () => {
    const base = source('first', 1);
    const container = lootSpawnPoint(base);
    const surface = lootSpawnPoint({ ...base, channel: 'surface', usage: [] });
    expect(surface.id).not.toBe(container.id);
    expect(surface.context).toEqual({ usage: [], tier: base.context.tier });
  });
});
