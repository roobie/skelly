import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import type { InventoryState } from '@skelly/engine/internal/core/inventory.ts';
import { savedItemTree } from '@skelly/engine/internal/core/itemTree.ts';
import { Inventory, type Item } from '@skelly/engine/inventory';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';

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
});
const holder = (id: string, holds: object, capacity: object = { maxVolumeCm3: 10 }) => ({
  id,
  name: id,
  category: 'bag',
  weight: 5,
  size: [1, 1],
  container: { pockets: [pile], holds, ...capacity },
});
const source = {
  inventory: [...baseRegistry().inventory.values()],
  forms: [
    { id: 'fixture_tablet', name: 'Tablets' },
    { id: 'fixture_capsule', name: 'Capsules' },
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
const fixture = () => {
  const built = buildFixtureRegistry([{ source: 'holder-fixture', data: source }]);
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
