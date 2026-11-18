import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import type { InventoryState } from '@skelly/engine/internal/core/inventory.ts';
import { savedItemTree } from '@skelly/engine/internal/core/itemTree.ts';
import { type LootSpawnPoint, rollLoot } from '@skelly/engine/internal/core/loot.ts';
import { contentsLine, HandlingQueue, Inventory, type Item } from '@skelly/engine/inventory';
import { Rng } from '@skelly/engine/math';
import { bindReach, Survival } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry, fixtureItemEconomy, fixtureLootPoint } from './economyFixtures.ts';
import { Simulation } from './simulationFixture.ts';

const pile = { layout: 'pile', handlingSimSeconds: 0 };
const tablet = (id: string, form: string) => ({
  id,
  name: id,
  category: 'medical',
  weight: 1,
  volumeCm3: 1,
  size: [1, 1],
  stack: 50,
  form,
  analgesic: {
    takeSimSeconds: 1,
    reliefPerDose: 1,
    maxRelief: 1,
    onsetGameMinutes: 1,
    peakGameMinutes: 1,
    fadeGameMinutes: 1,
  },
});
const holder = (id: string, holds: object, container: object = { maxVolumeCm3: 10 }) => ({
  id,
  name: id,
  category: 'bag',
  weight: 5,
  size: [1, 1],
  container: { pockets: [pile], holds, ...container },
});
const source = {
  inventory: [...baseRegistry().inventory.values()],
  forms: [
    { id: 'fixture_tablet', name: 'Tablets', countLine: '{count} fixture tablets' },
    { id: 'fixture_capsule', name: 'Capsules', countLine: '{count} fixture capsules' },
  ],
  items: [
    tablet('fixture_aspirin', 'fixture_tablet'),
    tablet('fixture_codeine', 'fixture_tablet'),
    tablet('fixture_oil_capsule', 'fixture_capsule'),
    holder('fixture_bottle', { forms: ['fixture_tablet'], oneKind: true }),
    holder('fixture_organiser', { forms: ['fixture_tablet'] }),
    holder('fixture_card', { forms: ['fixture_tablet'], refill: false }, { maxCount: 10 }),
  ],
};
const storage = (id: string, rigid: boolean) => ({
  id,
  name: id,
  category: 'bag',
  weight: 100,
  size: [2, 2],
  container: { rigid, pockets: [{ grid: [2, 2], handlingSimSeconds: 0 }] },
});
const nesting = [
  holder('fixture_tin', { forms: ['fixture_tablet'] }, { maxVolumeCm3: 10, rigid: true }),
  storage('fixture_backpack', false),
  storage('fixture_case', true),
];
const fixture = (extra: object[] = []) => {
  const built = buildFixtureRegistry([
    { source: 'holder-fixture', data: { ...source, items: [...source.items, ...extra] } },
  ]);
  if (built.issues.length > 0) {
    throw new Error(JSON.stringify(built.issues));
  }
  const { registry } = built;
  const inv = new Inventory(registry);
  const floor = (type: string, count = 1) => {
    const item = inv.create(type, count);
    if (!inv.add(item, { kind: 'pile', pos: [inv.piles.size, 0, 0] })) {
      throw new Error('Cannot place holder fixture');
    }
    return item;
  };
  return { registry, inv, floor };
};
const into = (owner: Item) => ({ kind: 'pocket', owner, pocket: 0 }) as const;
const savedType = (state: InventoryState, type: string) =>
  [...savedItemTree(state)].find(({ item }) => item.type === type)!.item;

describe('holders', () => {
  it('takes contents of its form up to capacity and refuses another form, another kind and an overfill', () => {
    const { registry, inv, floor } = fixture();
    const bottle = floor('fixture_bottle');
    expect(inv.move(floor('fixture_aspirin', 4), into(bottle)).ok).toBe(true);
    expect(inv.move(floor('fixture_oil_capsule'), into(bottle))).toMatchObject({
      ok: false,
      reason: coreMessage(registry, 'containerAcceptsOnly', { items: 'tablets' }),
    });
    expect(inv.move(floor('fixture_codeine'), into(bottle))).toMatchObject({
      ok: false,
      reason: coreMessage(registry, 'holderHoldsOther', { item: 'fixture_aspirin' }),
    });
    expect(inv.move(floor('fixture_aspirin', 6), into(bottle)).ok).toBe(true);
    expect(inv.move(floor('fixture_aspirin'), into(bottle))).toMatchObject({
      ok: false,
      reason: coreMessage(registry, 'containerFull'),
    });
  });

  it('mixes kinds only when the holder is not one-kind', () => {
    const { inv, floor } = fixture();
    const organiser = floor('fixture_organiser');
    expect(inv.move(floor('fixture_aspirin'), into(organiser)).ok).toBe(true);
    expect(inv.move(floor('fixture_codeine'), into(organiser)).ok).toBe(true);
  });

  it('refuses a refill into a holder that takes none', () => {
    const { registry, inv, floor } = fixture();
    expect(inv.move(floor('fixture_aspirin'), into(floor('fixture_card')))).toMatchObject({
      ok: false,
      reason: coreMessage(registry, 'holderNoRefill'),
    });
  });

  it.each([
    ['soft', 'a backpack', 'fixture_bottle', 'fixture_backpack'],
    ['soft', 'a hard case', 'fixture_bottle', 'fixture_case'],
    ['rigid', 'a backpack', 'fixture_tin', 'fixture_backpack'],
    ['rigid', 'a hard case', 'fixture_tin', 'fixture_case'],
  ])('nests a loaded %s holder in %s like a loose item, packed or filled first', (_rigidity, _in, type, outer) => {
    const { inv, floor } = fixture(nesting);
    const container = floor(outer);
    const packed = floor(type);
    expect(inv.move(floor('fixture_aspirin'), into(packed)).ok).toBe(true);
    expect(inv.move(packed, into(container)).ok).toBe(true);
    const filled = floor(type);
    expect(inv.move(filled, into(container)).ok).toBe(true);
    expect(inv.move(floor('fixture_aspirin'), into(filled)).ok).toBe(true);
  });

  it('round-trips a filled holder through a save', () => {
    const { registry, inv, floor } = fixture();
    const bottle = floor('fixture_bottle');
    expect(inv.move(floor('fixture_aspirin', 7), into(bottle)).ok).toBe(true);
    const state = inv.snapshotState();
    const restored = Inventory.restoreState(registry, structuredClone(state) as InventoryState);
    expect(restored.snapshotState()).toEqual(state);
    expect(savedType(restored.snapshotState(), 'fixture_bottle').pockets).toEqual([
      [{ item: expect.objectContaining({ type: 'fixture_aspirin', count: 7 }) }],
    ]);
  });

  it.each([
    [
      'another form',
      'fixture_bottle',
      (state: InventoryState) => {
        savedType(state, 'fixture_aspirin').type = 'fixture_oil_capsule';
      },
    ],
    [
      'another kind',
      'fixture_organiser',
      (state: InventoryState) => {
        savedType(state, 'fixture_organiser').type = 'fixture_bottle';
      },
    ],
  ] as const)('refuses a save whose holder holds %s', (_rule, type, corrupt) => {
    const { registry, inv, floor } = fixture();
    const owner = floor(type);
    expect(inv.move(floor('fixture_aspirin'), into(owner)).ok).toBe(true);
    if (type === 'fixture_organiser') {
      expect(inv.move(floor('fixture_codeine'), into(owner)).ok).toBe(true);
    }
    const state = structuredClone(inv.snapshotState()) as InventoryState;
    corrupt(state);
    expect(() => Inventory.restoreState(registry, state)).toThrow('Saved holder holds what it does not admit');
  });
});

describe('using and naming a holder', () => {
  const holding = (type: string, ...contents: [string, number][]) => {
    const { registry, inv, floor } = fixture();
    const owner = floor(type);
    const moved = [
      ...contents.map(([content, count]) => inv.move(floor(content, count), into(owner))),
      inv.move(owner, { kind: 'hand', side: 'right' }),
    ];
    if (moved.some(({ ok }) => !ok)) {
      throw new Error('Cannot hold the holder fixture');
    }
    return { registry, inv, owner };
  };

  it('takes one from a held bottle into the body, keeping the emptied bottle in the hand under its type name', () => {
    const { registry, inv, owner: bottle } = holding('fixture_bottle', ['fixture_aspirin', 2]);
    const sim = new Simulation({ seed: 1, analgesics: (type) => registry.items.get(type)?.analgesic });
    const queue = new HandlingQueue(inv);
    const player = { inventory: inv, position: [0, 0, 0] as [number, number, number], blockSize: 1, clock: BASE_CLOCK };
    const survival = new Survival(sim, inv, queue, {
      reach: bindReach(player),
      feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
      notice: () => undefined,
      readingLight: () => undefined,
      read: () => undefined,
    });
    const take = () => {
      expect(survival.use(bottle)).toBeUndefined();
      expect(queue.tick(queue.remaining).failed).toEqual([]);
    };
    take();
    expect(bottle.pockets).toEqual([[expect.objectContaining({ item: expect.objectContaining({ count: 1 }) })]]);
    take();
    expect(sim.body.snapshotState().pain.doses).toMatchObject([
      { item: 'fixture_aspirin' },
      { item: 'fixture_aspirin' },
    ]);
    expect(inv.hands.right).toBe(bottle);
    expect(bottle.pockets).toEqual([[]]);
    expect(inv.name(bottle)).toBe(registry.items.get('fixture_bottle')!.name);
  });

  it("names a holder of one kind after its contents and shows their count in the contents' form", () => {
    const { registry, inv, owner } = holding('fixture_bottle', ['fixture_aspirin', 3]);
    expect(inv.name(owner)).toContain(registry.items.get('fixture_aspirin')!.name.toLowerCase());
    expect(contentsLine(registry, owner)).toBe('3 fixture tablets');
  });

  it('names a holder of mixed kinds by its type alone', () => {
    const { registry, inv, owner } = holding('fixture_organiser', ['fixture_aspirin', 1], ['fixture_codeine', 1]);
    expect(inv.name(owner)).toBe(registry.items.get('fixture_organiser')!.name);
    expect(contentsLine(registry, owner)).toBeUndefined();
  });
});

describe('holder admission', () => {
  const issues = (candidate: object, extra: object[] = []) =>
    buildFixtureRegistry([
      {
        source: 'holder-admission',
        data: { ...source, items: [...source.items.filter(({ id }) => id !== 'fixture_bottle'), candidate, ...extra] },
      },
    ]).issues.map(({ path }) => path);
  const bottle = holder('fixture_bottle', { forms: ['fixture_tablet'] });

  it('admits the fixture holders', () => {
    expect(issues(bottle)).toEqual([]);
  });

  it.each([
    ['two pockets', { container: { ...bottle.container, pockets: [pile, pile] } }, '.container.pockets'],
    [
      'a grid pocket',
      { container: { ...bottle.container, pockets: [{ grid: [2, 2], handlingSimSeconds: 0 }] } },
      '.container.pockets',
    ],
    ['no capacity', { container: { pockets: [pile], holds: bottle.container.holds, maxMassGrams: 10 } }, '.container'],
    ['accepted items', { container: { ...bottle.container, accepts: ['fixture_aspirin'] } }, '.container.accepts'],
    ['a form of its own', { form: 'fixture_tablet' }, '.form'],
    [
      'an unknown form',
      { container: { ...bottle.container, holds: { forms: ['fixture_powder'] } } },
      '.container.holds.forms[0]',
    ],
  ])('reports a holder with %s', (_case, change, path) => {
    expect(issues({ ...bottle, ...change })).toContainEqual(expect.stringContaining(path));
  });

  it('reports admitted contents without a volume when the capacity is a volume', () => {
    const { volumeCm3: _volume, ...loose } = tablet('fixture_loose', 'fixture_tablet');
    expect(issues(bottle, [loose])).toContainEqual(expect.stringContaining('.container.maxVolumeCm3'));
  });
});

describe('packaging', () => {
  const packaged = (id: string, holderType: string, count: number, form = 'fixture_tablet') => ({
    ...tablet(id, form),
    packaging: { holder: holderType, count },
  });
  const contents = [
    packaged('fixture_ibuprofen', 'fixture_bottle', 8),
    packaged('fixture_antihistamine', 'fixture_card', 10),
  ];
  const build = (entries: object[] = [{ id: 'nothing', nothing: true, weight: 1 }], extra: object[] = []) =>
    buildFixtureRegistry([
      {
        source: 'holder-packaging',
        data: {
          ...source,
          items: [...source.items, ...contents, ...extra],
          itemEconomy: fixtureItemEconomy('fixture_aspirin', 'fixture_ibuprofen', 'fixture_antihistamine'),
          loot: [{ id: 'fixture_shelf', rolls: [1, 1], entries }],
        },
      },
    ]);
  const spawned = (supply: LootSpawnPoint['supply'], entries?: object[]) => {
    const { registry, issues } = build(entries);
    if (issues.length > 0) {
      throw new Error(JSON.stringify(issues));
    }
    const inv = new Inventory(registry);
    return rollLoot(registry, fixtureLootPoint(supply), new Rng([1, 2, 3, 4])).map((rolled) => {
      const item = inv.createRolled(rolled);
      return { type: item.type, count: item.count, held: item.pockets?.[0]?.map(({ item: unit }) => unit.count) };
    });
  };
  const shelf = (entry: object) => spawned({ kind: 'table', table: 'fixture_shelf' }, [entry]);
  const ibuprofen = { id: 'fixture_ibuprofen', item: 'fixture_ibuprofen', weight: 1 };

  it('rolls each count of a packaged item as its holder, full without a fill share', () => {
    expect(shelf({ ...ibuprofen, count: [2, 2] })).toEqual([
      { type: 'fixture_bottle', count: 1, held: [8] },
      { type: 'fixture_bottle', count: 1, held: [8] },
    ]);
  });

  it.each([
    [[0, 0], 1],
    [[0.5, 0.5], 4],
    [[1, 1], 8],
  ])('fills a holder by the fill share %j, at least one unit and at most its packaging count', (fill, units) => {
    expect(shelf({ ...ibuprofen, fill })).toEqual([{ type: 'fixture_bottle', count: 1, held: [units] }]);
  });

  it('rolls a loose entry as the bare stack', () => {
    expect(shelf({ ...ibuprofen, count: [3, 3], loose: true })).toEqual([
      { type: 'fixture_ibuprofen', count: 3, held: undefined },
    ]);
  });

  it.each<[{ fill?: number; loose?: true }, object]>([
    [{}, { type: 'fixture_card', count: 1, held: [10] }],
    [{ fill: 0.5 }, { type: 'fixture_card', count: 1, held: [5] }],
    [{ loose: true }, { type: 'fixture_antihistamine', count: 1, held: undefined }],
  ])('stocks fixed %j packaging in a holder that takes no refill', (row, item) => {
    expect(spawned({ kind: 'fixed', items: [{ item: 'fixture_antihistamine', ...row }] })).toEqual([item]);
  });

  const issuePaths = (entries: object[] | undefined, extra: object[] = []) =>
    build(entries, extra).issues.map(({ path }) => path);

  it.each([
    ['more than its holder holds', packaged('fixture_overfill', 'fixture_bottle', 11), '.packaging.count'],
    [
      'a holder that does not admit its form',
      packaged('fixture_capsules', 'fixture_bottle', 1, 'fixture_capsule'),
      '.packaging.holder',
    ],
    ['a holder that is no holder', packaged('fixture_boxed', 'fixture_aspirin', 1), '.packaging.holder'],
  ])('reports packaging into %s', (_case, item, path) => {
    expect(issuePaths(undefined, [item])).toContainEqual(expect.stringContaining(path));
  });

  it.each([
    ['a fill share', { fill: [0.5, 1] }],
    ['loose', { loose: true }],
  ])('reports %s on a loot entry whose item has no packaging', (_case, field) => {
    expect(issuePaths([{ id: 'fixture_aspirin', item: 'fixture_aspirin', weight: 1, ...field }])).not.toEqual([]);
  });
});
