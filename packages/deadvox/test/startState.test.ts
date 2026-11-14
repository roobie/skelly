import { buildRegistry } from '@skelly/engine/content';
import { SKILL_LEVEL_MAX } from '@skelly/engine/internal/core/character.ts';
import { magazineSpec } from '@skelly/engine/internal/core/magazine.ts';
import { type StartDef, StartSchema } from '@skelly/engine/internal/core/schema/starts.ts';
import { startIssues } from '@skelly/engine/internal/core/startIssues.ts';
import { claimed, Inventory } from '@skelly/engine/inventory';
import { applyStartState, Body, Character } from '@skelly/engine/sim';
import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { readAvailablePacks } from '../tools/readBundledPacks.ts';
import { baseRegistry, baseRegistryWith } from './baseRegistry.ts';
import { fixtureSources } from './economyFixtures.ts';
import { makeAttemptLayout } from './fixtures/attemptPolicy.ts';

const layout = makeAttemptLayout({ player: { position: [0, 0.5, 0], bearing: 0 } });
const FIXTURE_SKILL = 'fixture_start_skill';
const MISSING_SKILL = 'fixture_missing_skill';
const PLACEMENT_REFUSAL = /fixture-start.json.*kit entry "stock".*refused/;
const makeStart = (overrides: Partial<StartDef> = {}): StartDef => ({
  id: 'fixture_start',
  site: layout.id,
  kit: [
    { id: 'bag', item: 'fixture_start_bag', condition: 0.7, destination: { kind: 'worn' } },
    { id: 'stock', item: 'fixture_start_stock', count: 2, destination: { kind: 'pocket', parent: 'bag', pocket: 0 } },
    { id: 'held', item: 'fixture_start_stock', destination: { kind: 'hand', role: 'dominant' } },
    { id: 'off', item: 'fixture_start_stock', destination: { kind: 'hand', role: 'off' } },
  ],
  wounds: [],
  skills: {},
  recipes: [],
  ...overrides,
});
const sources = (start = makeStart()) =>
  fixtureSources([
    {
      source: 'fixture-start.json',
      data: {
        layouts: [layout],
        starts: [start],
        items: [
          {
            id: 'fixture_start_bag',
            name: 'Fixture bag',
            category: 'clothing',
            weight: 1,
            size: [1, 1],
            wearable: { slot: 'back', encumbrance: 0 },
            container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 0 }] },
          },
          { id: 'fixture_start_stock', name: 'Fixture stock', category: 'material', size: [1, 1], weight: 1, stack: 5 },
          { id: 'fixture_start_large', name: 'Fixture large item', category: 'material', size: [3, 3], weight: 1 },
        ],
        skills: [{ id: FIXTURE_SKILL, name: 'Fixture skill' }],
        recipeCategories: [{ id: 'fixture_category', label: 'Fixture category', order: 0 }],
        recipes: [
          {
            id: 'fixture_start_recipe',
            result: { item: 'fixture_start_stock', count: 1 },
            timeGameMinutes: 1,
            skills: {},
            qualities: {},
            components: [[{ item: 'fixture_start_stock', count: 1 }]],
          },
        ],
      },
    },
  ]);

it('admits authored starts without requiring starts in a lower-layer stack', () => {
  const result = buildRegistry(sources());
  expect(result.issues).toEqual([]);
  expect(result.registry.starts.get(makeStart().id)).toEqual(makeStart());
  const lower = buildRegistry([]);
  expect(lower.issues).toEqual([]);
  expect(lower.registry.starts.size).toBe(0);
});

it('attributes conflicting site defaults to both authored rows at admission', () => {
  const first = makeStart({ defaultForSite: true });
  const second = { ...first, id: 'fixture_other_start' };
  const result = buildRegistry([...sources(first), { source: 'fixture-other-start.json', data: { starts: [second] } }]);
  expect(result.issues).toEqual([
    expect.objectContaining({ source: 'fixture-start.json', path: 'starts[0].defaultForSite' }),
    expect.objectContaining({ source: 'fixture-other-start.json', path: 'starts[0].defaultForSite' }),
  ]);
});

it.each(['city', 'forest', 'weatheringTest'])('admits a start for the existing %s generator', (site) => {
  expect(buildRegistry(sources(makeStart({ site }))).issues).toEqual([]);
});

it.each(['pocket', 'slot'] as const)('rejects a nonexistent parent %s at admission', (kind) => {
  const start = makeStart();
  start.kit[1]!.destination =
    kind === 'pocket'
      ? { kind: 'pocket', parent: 'bag', pocket: 1 }
      : { kind: 'slot', parent: 'bag', slot: 'fixture_missing_slot' };
  expect(buildRegistry(sources(start)).issues).toEqual([
    expect.objectContaining({ source: 'fixture-start.json', path: `starts[0].kit[1].destination.${kind}` }),
  ]);
});

it.each([
  ['site', { site: 'fixture_missing_site' }, '.site'],
  ['skill', { skills: { [MISSING_SKILL]: 1 } }, '.skills.fixture_missing_skill'],
  ['recipe', { recipes: ['fixture_missing_recipe'] }, '.recipes[0]'],
  ['wound', { wounds: [{ region: 'leftLeg', bleeding: 'fixture_missing_tier' }] }, '.wounds[0].bleeding'],
] as const)('attributes an unresolved %s to its start row', (_kind, overrides, suffix) => {
  const result = buildRegistry(sources(makeStart(overrides as Partial<StartDef>)));
  expect(result.issues).toEqual([
    expect.objectContaining({ source: 'fixture-start.json', path: `starts[0]${suffix}` }),
  ]);
});

it.each(['duplicate', 'forward-parent', 'duplicate-hand', 'missing-item', 'not-a-magazine'] as const)(
  'rejects malformed kit ownership or references: %s',
  (kind) => {
    const start = makeStart();
    if (kind === 'duplicate') {
      start.kit[1]!.id = start.kit[0]!.id;
    } else if (kind === 'forward-parent') {
      start.kit = [start.kit[1]!, start.kit[0]!];
    } else if (kind === 'duplicate-hand') {
      start.kit[3]!.destination = { kind: 'hand', role: 'dominant' };
    } else if (kind === 'missing-item') {
      start.kit[0]!.item = 'fixture_missing_item';
    } else {
      start.kit[2]!.cartridges = [];
    }
    const result = buildRegistry(sources(start));
    expect(result.issues.length).toBeGreaterThan(0);
    expect(
      result.issues.every(({ source, path }) => source === 'fixture-start.json' && path.startsWith('starts[0].kit')),
    ).toBe(true);
  },
);

it('bounds authored skill levels and rejects side-named hands', () => {
  expect(() => parse(StartSchema, makeStart({ skills: { [FIXTURE_SKILL]: Number.POSITIVE_INFINITY } }))).toThrow();
  const start = makeStart();
  expect(() =>
    parse(StartSchema, { ...start, kit: [{ ...start.kit[2], destination: { kind: 'hand', role: 'left' } }] }),
  ).toThrow();
});

describe('debug and fixture starts', () => {
  it('start the player with every content skill at its top level unless the start opts out', () => {
    const registry = baseRegistry();
    const fixtures = readAvailablePacks('.')
      .flatMap(({ files }) => files.flatMap(({ data }) => (data as { starts?: StartDef[] }).starts ?? []))
      .filter((start) => start.debugOnly && start.allSkills !== null);
    expect(fixtures.length).toBeGreaterThan(0);
    expect(registry.skills.size).toBeGreaterThan(0);
    for (const start of fixtures) {
      const character = new Character(registry, { handedness: 'right' });
      const inventory = new Inventory(registry, undefined, undefined, character);
      const body = new Body(claimed(registry.body, 'player')!);
      applyStartState(
        inventory,
        { ...start, kit: [], wounds: [], blockDamage: [] },
        {
          fresh: true,
          character,
          body,
          damageCell: () => {
            throw new Error('Unexpected start cell damage');
          },
        },
      );
      for (const skill of registry.skills.keys()) {
        expect([start.id, skill, character.skills[skill]]).toEqual([start.id, skill, SKILL_LEVEL_MAX]);
      }
    }
  });
});

describe('new-game application', () => {
  const setup = (start: StartDef, handedness: 'left' | 'right' = 'right') => {
    const registry = baseRegistryWith(sources(start));
    const character = new Character(registry, { handedness });
    const inventory = new Inventory(registry, undefined, undefined, character);
    const body = new Body(claimed(registry.body, 'player')!);
    return {
      registry,
      inventory,
      character,
      body,
      fresh: true,
      damageCell: () => {
        throw new Error('Unexpected start cell damage');
      },
    };
  };

  it.each(['left', 'right'] as const)('uses ordinary inventory ownership and %s-handed roles', (handedness) => {
    const start = makeStart({ skills: { [FIXTURE_SKILL]: 3 } });
    const context = setup(start, handedness);
    applyStartState(context.inventory, start, context);
    const bag = context.inventory.worn.back!;
    expect(bag.condition).toBe(start.kit[0]!.condition);
    expect(bag.pockets![0]!.map(({ item }) => ({ type: item.type, count: item.count }))).toEqual([
      { type: start.kit[1]!.item, count: start.kit[1]!.count },
    ]);
    expect(context.inventory.hands[handedness]?.type).toBe(start.kit[2]!.item);
    expect(context.inventory.hands[handedness === 'left' ? 'right' : 'left']?.type).toBe(start.kit[3]!.item);
    expect(context.character.skills.fixture_start_skill).toBe(start.skills.fixture_start_skill);
    expect(context.character.practice.fixture_start_skill).toBe(0);
  });

  it('applies named wounds and explicit recipe knowledge through their owners', () => {
    const start = makeStart({ kit: [], recipes: ['fixture_start_recipe'] });
    const context = setup(start);
    const tier = context.body.tuning.bleeding.tiers.find(({ bloodLossPerSimSecond }) => bloodLossPerSimSecond > 0);
    expect(tier).toBeDefined();
    start.wounds = [{ region: 'leftLeg', bleeding: tier!.id }];
    expect(context.character.knownRecipes.has(start.recipes[0]!)).toBe(false);
    const { health } = context.body;
    applyStartState(context.inventory, start, context);
    expect(context.character.knownRecipes.has(start.recipes[0]!)).toBe(true);
    expect(context.body.bleedingTier(start.wounds[0]!.region)?.id).toBe(start.wounds[0]!.bleeding);
    expect(context.body.health).toBe(health);
  });

  it('fills a magazine from authored rounds without sharing the row array', () => {
    const start = makeStart({ kit: [] });
    const context = setup(start);
    const magazine = [...context.registry.items.values()].find(({ id }) => magazineSpec(context.registry, id));
    expect(magazine).toBeDefined();
    const spec = magazineSpec(context.registry, magazine!.id)!;
    const round = [...context.registry.items.values()].find(({ ammo }) => ammo?.calibre === spec.calibre);
    expect(round).toBeDefined();
    context.registry.items.set('fixture_start_magazine', { ...magazine!, id: 'fixture_start_magazine' });
    context.registry.items.set('fixture_start_round', { ...round!, id: 'fixture_start_round' });
    start.kit = [
      {
        id: 'loaded',
        item: 'fixture_start_magazine',
        cartridges: ['fixture_start_round'],
        destination: { kind: 'hand', role: 'dominant' },
      },
    ];
    applyStartState(context.inventory, start, context);
    expect(context.inventory.hands.right?.cartridges).toEqual(start.kit[0]!.cartridges);
    expect(context.inventory.hands.right?.cartridges).not.toBe(start.kit[0]!.cartridges);
  });

  const cylinderFixture = () => {
    const start = makeStart({ kit: [] });
    const context = setup(start);
    const gun = [...context.registry.items.values()].find(({ firearm }) => firearm?.revolver)!;
    const model = context.registry.models.get(gun.model!)!;
    const round = [...context.registry.items.values()].find(({ ammo }) => ammo?.calibre === model.gun!.calibre)!;
    context.registry.items.set('fixture_revolver', { ...gun, id: 'fixture_revolver' });
    context.registry.items.set('fixture_round', { ...round, id: 'fixture_round' });
    const cylinder = {
      chambers: Array.from({ length: model.gun!.revolver!.chambers }, (_, index) =>
        index === 0 ? { state: 'round' as const, roundType: 'fixture_round' } : { state: 'empty' as const },
      ),
      aligned: 0,
      open: true,
      cocked: false,
    };
    start.kit = [{ id: 'gun', item: 'fixture_revolver', cylinder, destination: { kind: 'hand', role: 'dominant' } }];
    context.registry.starts.set(start.id, start);
    return { start, context, cylinder };
  };

  it('applies an admitted cylinder through its item owner without aliasing authored state', () => {
    const { start, context, cylinder } = cylinderFixture();
    expect(startIssues(context.registry).filter(({ id }) => id === start.id)).toEqual([]);
    applyStartState(context.inventory, start, context);
    const applied = context.inventory.hands.right!.firearm!.cylinder!;
    expect(applied).toEqual(cylinder);
    applied.chambers[0] = { state: 'case' };
    expect(cylinder.chambers[0]!.state).toBe('round');
  });

  it.each(['count', 'calibre', 'alignment', 'cocked', 'not-revolver'] as const)(
    'attributes invalid authored cylinder %s at admission and application',
    (kind) => {
      const { start, context, cylinder } = cylinderFixture();
      if (kind === 'count') {
        cylinder.chambers.pop();
      }
      if (kind === 'calibre') {
        cylinder.chambers[0] = { state: 'round', roundType: 'fixture_start_stock' };
      }
      if (kind === 'alignment') {
        cylinder.aligned = cylinder.chambers.length;
      }
      if (kind === 'cocked') {
        cylinder.cocked = true;
      }
      if (kind === 'not-revolver') {
        start.kit[0]!.item = 'fixture_start_stock';
      }
      expect(startIssues(context.registry)).toContainEqual(
        expect.objectContaining({ id: start.id, path: '.kit[0].cylinder' }),
      );
      expect(() => applyStartState(context.inventory, start, context)).toThrow('kit entry "gun"');
    },
  );

  it('fits a named child through ordinary slot certification', () => {
    const start = makeStart({ kit: [] });
    const context = setup(start);
    const lamp = [...context.registry.items.values()].find(({ light }) => light?.power);
    expect(lamp).toBeDefined();
    const battery = context.registry.items.get(lamp!.light!.power!.battery)!;
    const fixtureLamp = {
      ...lamp!,
      id: 'fixture_start_lamp',
      light: { ...lamp!.light!, power: { ...lamp!.light!.power!, battery: 'fixture_start_battery' } },
    };
    context.registry.items.set(fixtureLamp.id, fixtureLamp);
    context.registry.items.set('fixture_start_battery', { ...battery, id: 'fixture_start_battery' });
    start.kit = [
      { id: 'lamp', item: 'fixture_start_lamp', destination: { kind: 'hand', role: 'dominant' } },
      { id: 'battery', item: 'fixture_start_battery', destination: { kind: 'slot', parent: 'lamp', slot: 'battery' } },
    ];
    applyStartState(context.inventory, start, context);
    expect(context.inventory.hands.right?.slots?.battery?.type).toBe(start.kit[1]!.item);
    const refused = setup(start);
    refused.registry.items.set(fixtureLamp.id, fixtureLamp);
    refused.registry.items.set('fixture_start_battery', context.registry.items.get('fixture_start_battery')!);
    start.kit[1]!.item = 'fixture_start_stock';
    expect(() => applyStartState(refused.inventory, start, refused)).toThrow('kit entry "battery"');
  });

  it('stops startup with source and entry attribution when ordinary pocket placement refuses', () => {
    const start = makeStart();
    start.kit[1]!.item = 'fixture_start_large';
    const context = setup(start);
    expect(() => applyStartState(context.inventory, start, context)).toThrow(PLACEMENT_REFUSAL);
  });

  it('ignores authored state during restoration, including the item allocator', () => {
    const start = makeStart();
    const context = setup(start);
    const before = {
      inventory: context.inventory.snapshotState(),
      character: context.character.snapshotState(),
      body: context.body.snapshotState(),
    };
    applyStartState(context.inventory, start, { ...context, fresh: false });
    expect({
      inventory: context.inventory.snapshotState(),
      character: context.character.snapshotState(),
      body: context.body.snapshotState(),
    }).toEqual(before);
  });
});
