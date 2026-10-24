import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { planLiquidTransfer } from '../src/core/liquids.ts';
import type { LiquidContents } from '../src/core/schema.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';

const filled = (volumeMicrolitres: number, liquid = 'fixture_oil'): LiquidContents => ({
  kind: 'filled',
  liquid,
  volumeMicrolitres,
});
const vessel = (
  id: string,
  capacityMicrolitres: number,
  initialContents: LiquidContents,
  accepts = ['fixture_oil'],
) => ({
  id,
  name: id,
  category: 'tool',
  size: [1, 1],
  weight: 10,
  vessel: { capacityMicrolitres, accepts, initialContents },
});
const fixture = () => {
  const { registry, issues } = buildFixtureRegistry([
    {
      source: 'fixture-transfer.json',
      data: {
        liquids: [
          { id: 'fixture_oil', name: 'Fixture oil', densityGramsPerMillilitre: 1 },
          { id: 'fixture_water', name: 'Fixture water', densityGramsPerMillilitre: 2 },
        ],
        items: [
          { id: 'fixture_shell', name: 'Fixture shell', category: 'tool', size: [1, 1], weight: 10 },
          vessel('fixture_source', 9, filled(9)),
          vessel('fixture_small_source', 9, filled(3)),
          vessel('fixture_receiver', 6, { kind: 'empty' }),
          vessel('fixture_partial', 6, filled(4)),
          vessel('fixture_full', 6, filled(6)),
          vessel('fixture_water_source', 9, filled(5, 'fixture_water'), ['fixture_water']),
          vessel('fixture_water_receiver', 6, { kind: 'empty' }, ['fixture_water']),
          vessel('fixture_mixed_acceptance', 6, filled(2, 'fixture_water'), ['fixture_oil', 'fixture_water']),
        ],
      },
    },
  ]);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  return new Inventory({ ...baseRegistry(), items: registry.items, liquids: registry.liquids });
};
const admit = (inventory: Inventory, type: string, side?: 'left' | 'right') => {
  const item = inventory.create(type);
  if (!inventory.add(item, side ? { kind: 'hand', side } : { kind: 'pile', pos: [0, 0, 0] })) {
    throw new Error(`Cannot admit fixture ${type}`);
  }
  return item;
};
const volume = (item: Item) => (item.liquidContents?.kind === 'filled' ? item.liquidContents.volumeMicrolitres : 0);
const balances = (source: Item, receiver: Item) => [source.liquidContents, receiver.liquidContents];

describe('liquid transfer', () => {
  it.each([
    ['source-limited', 'fixture_small_source', 'fixture_receiver', 3],
    ['receiver-limited', 'fixture_source', 'fixture_partial', 2],
    ['second kind', 'fixture_water_source', 'fixture_water_receiver', 5],
  ])(
    'conserves quantity and identities for %s transfers to a stationary receiver',
    (_label, sourceType, receiverType, amount) => {
      const inventory = fixture();
      const source = admit(inventory, sourceType, 'right');
      const receiver = admit(inventory, receiverType);
      const before = [volume(source), volume(receiver)];
      const total = before[0]! + before[1]!;
      const uids = [source.uid, receiver.uid];
      const locations = [inventory.locate(source), inventory.locate(receiver)];
      const { version } = inventory;
      const result = inventory.transferLiquid(source.uid, receiver.uid);
      expect(result).toMatchObject({ ok: true, volumeMicrolitres: amount });
      expect([volume(source), volume(receiver)]).toEqual([before[0]! - amount, before[1]! + amount]);
      expect(volume(source) + volume(receiver)).toBe(total);
      expect(volume(receiver)).toBeLessThanOrEqual(
        inventory.registry.items.get(receiver.type)!.vessel!.capacityMicrolitres,
      );
      expect([source.uid, receiver.uid]).toEqual(uids);
      expect(inventory.itemByUid(source.uid)).toBe(source);
      expect(inventory.itemByUid(receiver.uid)).toBe(receiver);
      expect([inventory.locate(source), inventory.locate(receiver)]).toEqual(locations);
      expect(inventory.version).toBe(version + 1);
      if (volume(source) === 0) {
        expect(source.liquidContents).toEqual({ kind: 'empty' });
      }
    },
  );

  it('queries without mutation, commits bounded increments against live balances, and reverses explicit endpoints', () => {
    const inventory = fixture();
    const source = admit(inventory, 'fixture_source', 'right');
    const receiver = admit(inventory, 'fixture_receiver', 'left');
    const original = structuredClone(balances(source, receiver));
    const { version } = inventory;
    expect(inventory.planLiquidTransfer(source.uid, receiver.uid, 4)).toMatchObject({ ok: true, volumeMicrolitres: 4 });
    expect(planLiquidTransfer(inventory.registry, source, receiver, 4)).toEqual(
      inventory.planLiquidTransfer(source.uid, receiver.uid, 4),
    );
    expect(balances(source, receiver)).toEqual(original);
    expect(inventory.version).toBe(version);
    expect(inventory.transferLiquid(source.uid, receiver.uid, 4)).toMatchObject({ ok: true, volumeMicrolitres: 4 });
    expect(inventory.transferLiquid(source.uid, receiver.uid, 4)).toMatchObject({ ok: true, volumeMicrolitres: 2 });
    expect([volume(source), volume(receiver)]).toEqual([3, 6]);
    expect(inventory.transferLiquid(receiver.uid, source.uid)).toMatchObject({ ok: true, volumeMicrolitres: 6 });
    expect(balances(source, receiver)).toEqual(original);
  });

  it.each([
    ['missing receiver', 'fixture_source', 'fixture_receiver', 'missing', 'missing-endpoint'],
    ['stale receiver', 'fixture_source', 'fixture_receiver', 'stale', 'missing-endpoint'],
    ['stale source', 'fixture_source', 'fixture_receiver', 'stale-source', 'missing-endpoint'],
    ['self', 'fixture_source', 'fixture_receiver', 'self', 'same-endpoint'],
    ['wrong acceptance', 'fixture_source', 'fixture_water_receiver', 'normal', 'incompatible-liquid'],
    ['different contents', 'fixture_source', 'fixture_mixed_acceptance', 'normal', 'incompatible-liquid'],
    ['full', 'fixture_source', 'fixture_full', 'normal', 'full-receiver'],
    ['empty', 'fixture_receiver', 'fixture_partial', 'normal', 'empty-source'],
    ['not a vessel', 'fixture_source', 'fixture_shell', 'normal', 'not-vessel'],
  ])(
    'refuses %s without changing contents, identities or ownership',
    (...[_label, sourceType, receiverType, mode, reason]) => {
      const inventory = fixture();
      const source = admit(inventory, sourceType, 'right');
      const receiver = admit(inventory, receiverType);
      const before = inventory.snapshotState();
      const { version } = inventory;
      const receiverUid = new Map<string, number | undefined>([
        ['missing', undefined],
        ['stale', -1],
        ['self', source.uid],
        ['normal', receiver.uid],
        ['stale-source', receiver.uid],
      ]).get(mode);
      expect(inventory.transferLiquid(mode === 'stale-source' ? -1 : source.uid, receiverUid)).toEqual({
        ok: false,
        reason,
      });
      expect(inventory.snapshotState()).toEqual(before);
      expect(inventory.version).toBe(version);
    },
  );

  it('rechecks reach at commit instead of spending an old plan', () => {
    const inventory = fixture();
    const source = admit(inventory, 'fixture_source', 'right');
    const receiver = admit(inventory, 'fixture_receiver');
    expect(inventory.planLiquidTransfer(source.uid, receiver.uid).ok).toBe(true);
    inventory.canReach = () => false;
    const before = inventory.snapshotState();
    expect(inventory.transferLiquid(source.uid, receiver.uid)).toEqual({ ok: false, reason: 'unreachable' });
    expect(inventory.snapshotState()).toEqual(before);
  });

  it('refuses service after an endpoint breaks without changing either balance', () => {
    const inventory = fixture();
    const source = admit(inventory, 'fixture_source', 'right');
    const receiver = admit(inventory, 'fixture_receiver');
    expect(inventory.planLiquidTransfer(source.uid, receiver.uid).ok).toBe(true);
    expect(inventory.changeCondition(receiver.uid, -1)).toBe(true);
    const before = inventory.snapshotState();
    expect(inventory.transferLiquid(source.uid, receiver.uid)).toEqual({ ok: false, reason: 'unserviceable' });
    expect(inventory.snapshotState()).toEqual(before);
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuses invalid increment %s',
    (limit) => {
      const inventory = fixture();
      const source = admit(inventory, 'fixture_source', 'right');
      const receiver = admit(inventory, 'fixture_receiver');
      const before = inventory.snapshotState();
      expect(inventory.transferLiquid(source.uid, receiver.uid, limit)).toEqual({ ok: false, reason: 'invalid-limit' });
      expect(inventory.snapshotState()).toEqual(before);
    },
  );
});
