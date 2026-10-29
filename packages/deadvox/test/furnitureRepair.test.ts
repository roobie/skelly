import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Inventory } from '../src/core/inventory.ts';
import { buildFixtureRegistry, FIXTURE_MATERIAL, fixtureMaterials } from './economyFixtures.ts';

const BREACH = { minimumStrength: 10, durability: 100 };
const piece = (id: string) => ({ id, name: id, size: [1, 1, 1], color: '#777777', breach: BREACH });
const { registry, issues } = buildFixtureRegistry([
  {
    source: 'repair-fixture',
    data: {
      furnitureMaterials: [
        { ...fixtureMaterials()[0], id: FIXTURE_MATERIAL, damaged: [{ from: 0.3, tint: '#555555', strength: 0.5 }] },
      ],
      furniture: [
        { ...piece('repair_box'), container: { pockets: [{ grid: [4, 4], handlingSimSeconds: 0.5 }] } },
        { ...piece('repair_leaf'), door: { handlingSimSeconds: 0.5, methods: {} } },
        { ...piece('repair_boarded'), door: { handlingSimSeconds: 0.5, methods: {}, barredFrom: 'front' } },
      ],
      items: [{ id: 'repair_stock', name: 'Fixture stock', category: 'material', size: [1, 1], weight: 1 }],
    },
  },
]);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

const fixture = (type = 'repair_box') => {
  const inventory = new Inventory(registry);
  const entity = inventory.furnish(
    {
      type,
      pos: [0, 1, 0],
      size: [1, 1, 1],
      facing: 'n',
      ...(type === 'repair_box' ? {} : { lock: { id: 'fixture_lock', locked: true } }),
    },
    type === 'repair_box' ? [{ type: 'repair_stock', count: 1, condition: 1 }] : [],
  )!;
  const { entities } = inventory;
  const outcome = entities.bash(entity, BREACH.durability / 2);
  return { entities, entity, outcome };
};

it('repairs bash damage without replacing a piece, its contents or its occupancy and clamps to intact', () => {
  const { entities, entity, outcome } = fixture();
  expect(outcome).toBe('damaged');
  expect(entity.pockets!.flat()).toHaveLength(1);
  const { pockets } = entity;
  const before = structuredClone(entity);
  const condition = entities.conditionOf(entity);
  const { version, standing } = entities;
  expect(entities.repair(entity, BREACH.durability / 4)).toBe(true);
  expect(entities.conditionOf(entity)).toBeGreaterThan(condition);
  expect(entity).toEqual({ ...before, damage: BREACH.durability / 4 });
  expect(entity.pockets).toBe(pockets);
  expect(entities.byUid(entity.uid)).toBe(entity);
  expect(entities.at(...entity.pos)).toBe(entity);
  expect(entities.isSolid(...entity.pos)).toBe(true);
  expect(entities.version).toBe(version + 1);
  expect(entities.standing).toBe(standing + 1);
  const afterLookChange = entities.standing;
  expect(entities.repair(entity, BREACH.durability)).toBe(true);
  expect(entities.conditionOf(entity)).toBe(1);
  expect(entity.damage).toBeUndefined();
  expect(entities.standing).toBe(afterLookChange);
});

it.each(['repair_leaf', 'repair_boarded'])('preserves a surviving %s lock, bar or boarding and occupancy', (type) => {
  const { entities, entity } = fixture(type);
  if (type === 'repair_leaf') {
    expect(entities.setBar(entity, [0.5, 1, 2], 'repair_stock')).toBeUndefined();
    expect(entity.bar).toBeDefined();
  }
  const before = structuredClone(entity);
  const boarding = entities.defOf(entity).door!.barredFrom;
  if (type === 'repair_boarded') {
    expect(boarding).toBeDefined();
  }
  expect(entities.repair(entity, BREACH.minimumStrength)).toBe(true);
  expect(entity).toEqual({ ...before, damage: before.damage! - BREACH.minimumStrength });
  expect(entities.defOf(entity).door!.barredFrom).toBe(boarding);
  expect(entities.at(...entity.pos)).toBe(entity);
  expect(entities.isSolid(...entity.pos)).toBe(true);
});

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MIN_VALUE])(
  'refuses invalid or unrepresentable repair amount %s without signalling a change',
  (amount) => {
    const { entities, entity } = fixture();
    const before = entities.snapshotState();
    const { version, standing } = entities;
    expect(entities.repair(entity, amount)).toBe(false);
    expect(entities.snapshotState()).toEqual(before);
    expect(entities.version).toBe(version);
    expect(entities.standing).toBe(standing);
  },
);

it.each(['removed', 'stale', 'carried', 'ruined', 'broken', 'intact'])(
  'refuses a %s target without mutation or a change signal',
  (kind) => {
    let { entities, entity } = fixture(kind === 'broken' ? 'repair_leaf' : 'repair_box');
    if (kind === 'removed') {
      entities.destroy(entity);
    }
    if (kind === 'stale') {
      entities = BlockEntities.restoreState(registry, entities.snapshotState());
    }
    if (kind === 'carried') {
      entities.lift(entity);
    }
    if (kind === 'ruined' || kind === 'broken') {
      entities.bash(entity, BREACH.durability);
    }
    if (kind === 'intact') {
      entities.repair(entity, BREACH.durability);
    }
    const before = entities.snapshotState();
    const target = structuredClone(entity);
    const { version, standing } = entities;
    expect(entities.repair(entity, BREACH.minimumStrength)).toBe(false);
    expect(entity).toEqual(target);
    expect(entities.snapshotState()).toEqual(before);
    expect(entities.version).toBe(version);
    expect(entities.standing).toBe(standing);
  },
);
