import { describe, expect, it, vi } from 'vitest';
import { HandlingQueue } from '../src/core/handling.ts';
import { type HandSide, Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { simSeconds } from '../src/core/time.ts';
import { openingTargetForHand } from '../src/game/canOpening.ts';
import { selectPrimaryAction } from '../src/game/primaryAction.ts';
import { Survival } from '../src/game/survival.ts';
import { Tutorial } from '../src/game/tutorial.ts';
import { Unpacking } from '../src/game/unpacking.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry, fixtureEconomy } from './economyFixtures.ts';
import { Simulation } from './simulationFixture.ts';

const fixture = (side: HandSide = 'right', quality = 2) => {
  const base = baseRegistry();
  const economy = { usage: [], tiers: [] };
  const common = { economy, category: 'food' as const, weight: 1, size: [1, 2] as [number, number] };
  const registry = {
    ...base,
    items: new Map(base.items)
      .set('test_sealed', {
        ...common,
        id: 'test_sealed',
        name: 'Sealed fixture',
        unpack: { item: 'test_opened', count: 1, simSeconds: simSeconds(8), qualities: { opening: 1 }, inPlace: true },
      })
      .set('test_opened', {
        ...common,
        id: 'test_opened',
        name: 'Opened fixture',
        serving: { food: 'test_food', empty: 'test_empty' },
      })
      .set('test_empty', { ...common, id: 'test_empty', name: 'Empty fixture' })
      .set('test_food', {
        ...common,
        id: 'test_food',
        name: 'Fixture food',
        food: { calories: 1, water: 1, consumeSimSeconds: simSeconds(1) },
      })
      .set('test_tool', { ...base.items.get('machete')!, id: 'test_tool', tool: { qualities: { opening: quality } } }),
  };
  const inventory = new Inventory(registry);
  const can = inventory.create('test_sealed');
  const tool = inventory.create('test_tool');
  const other: HandSide = side === 'right' ? 'left' : 'right';
  if (!(inventory.add(can, { kind: 'hand', side }) && inventory.add(tool, { kind: 'hand', side: other }))) {
    throw new Error('Can-opening fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const opened = vi.fn();
  const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0], opened);
  const sim = new Simulation({ seed: 1 });
  const survival = new Survival(sim, inventory, queue, {
    reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 1, clock: BASE_CLOCK }),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: vi.fn(),
    read: vi.fn(),
  });
  return { registry, inventory, can, tool, other, queue, opened, unpacking, survival };
};

describe('held can opening', () => {
  it('rejects a serving with missing food or an incompatible empty vessel', () => {
    const { registry } = fixture();
    const items = ['test_opened', 'test_food', 'test_empty'].map((id) => ({
      ...registry.items.get(id)!,
      economy: fixtureEconomy(),
    }));
    expect(buildFixtureRegistry([{ source: 'vessels', data: { items } }]).issues).toEqual([]);
    const invalid = items.map((item) =>
      item.id === 'test_opened'
        ? { ...item, serving: { food: 'missing_food', empty: 'test_empty' } }
        : { ...item, size: [1, 1] },
    );
    const { issues } = buildFixtureRegistry([{ source: 'vessels', data: { items: invalid } }]);
    expect(issues.some((issue) => issue.path.endsWith('.serving.food'))).toBe(true);
    expect(issues.some((issue) => issue.path.endsWith('.serving.empty'))).toBe(true);
  });
  it.each(['right', 'left'] as const)('opens through either member of the pair with the can in %s', (side) => {
    const f = fixture(side);
    expect(selectPrimaryAction(f.inventory, side).kind).toBe('unpack');
    expect(openingTargetForHand(f.inventory, f.other)).toBe(f.can);
    expect(f.unpacking.activate(f.can)).toBeUndefined();
    expect(f.opened).not.toHaveBeenCalled();
    expect(f.queue.tick(f.queue.remaining).failed).toEqual([]);
    expect(f.inventory.hands[side]).toBe(f.can);
    expect(f.can.type).toBe('test_opened');
    expect(f.registry.items.get(f.can.type)?.serving?.food).toBe('test_food');
    expect(f.opened).toHaveBeenCalledExactlyOnceWith('test_sealed');
  });

  it('a lower opening quality takes longer and a changed tool cannot complete the admitted work', () => {
    const fast = fixture('right', 4);
    const slow = fixture('right', 1);
    expect(fast.unpacking.activate(fast.can)).toBeUndefined();
    expect(slow.unpacking.activate(slow.can)).toBeUndefined();
    expect(slow.queue.remaining).toBeGreaterThan(fast.queue.remaining);
    expect(slow.inventory.move(slow.tool, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(slow.queue.tick(slow.queue.remaining).failed).toHaveLength(1);
    expect(slow.can.type).toBe('test_sealed');
    expect(slow.opened).not.toHaveBeenCalled();
  });

  it.each(['hand', 'pocket'] as const)(
    'eating leaves the empty vessel in its %s and both states round-trip',
    (place) => {
      const f = fixture();
      expect(f.unpacking.activate(f.can)).toBeUndefined();
      expect(f.queue.tick(f.queue.remaining).failed).toEqual([]);
      const restored = Inventory.restoreState(f.registry, f.inventory.snapshotState());
      expect(restored.itemByUid(f.can.uid)?.type).toBe('test_opened');
      if (place === 'pocket') {
        const bag = f.inventory.create('hiking_backpack');
        expect(f.inventory.add(bag, { kind: 'worn' })).toBe(true);
        expect(f.inventory.move(f.can, { kind: 'pocket', owner: bag, pocket: 0 }).ok).toBe(true);
      }
      const before = f.inventory.locate(f.can);
      expect(place === 'pocket' ? f.survival.useFromQuickbar(f.can) : f.survival.use(f.can)).toBeUndefined();
      expect(f.queue.tick(f.queue.remaining).failed).toEqual([]);
      expect(f.can.type).toBe('test_empty');
      expect(f.inventory.locate(f.can)).toEqual(before);
      const empty = Inventory.restoreState(f.registry, f.inventory.snapshotState());
      expect(empty.itemByUid(f.can.uid)?.type).toBe('test_empty');
    },
  );

  it('the wheel selection chooses opening rather than the tool swing, without a lost-target attack', () => {
    const f = fixture('left');
    const selected = () => selectPrimaryAction(f.inventory, f.other, f.survival.selectedItemAction(f.tool)?.id);
    expect(selected().kind).toBe('melee');
    expect(f.survival.availableItemActions(f.tool).some((action) => action.opening)).toBe(true);
    expect(f.survival.wieldedItemActionHint()).toBeDefined();
    expect(f.survival.cycleItemAction(f.tool, 1)).toBe(true);
    expect(selected().kind).toBe('open-can');
    expect(f.inventory.move(f.can, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    expect(openingTargetForHand(f.inventory, f.other)).toBeUndefined();
    expect(selected().kind).toBe('open-can');
    expect(f.survival.wieldedItemActionHint()).toBeUndefined();
    expect(f.survival.cycleItemAction(f.tool, 1)).toBe(true);
    expect(selected().kind).toBe('melee');
  });

  it('a tutorial opening is earned by completion, not activation or cancellation', () => {
    const f = fixture();
    const tutorial = new Tutorial([0, 0, 0], 0, { x0: 20, x1: 21, z0: 20, z1: 21 }, vi.fn());
    f.opened.mockImplementation(() => tutorial.opened('canned_beans'));
    expect(f.unpacking.activate(f.can)).toBeUndefined();
    f.queue.cancel();
    tutorial.observe({
      position: [8, 0, 0],
      yaw: 1,
      crouching: false,
      doorOpen: true,
      searched: true,
      looted: true,
      wielded: true,
      lightOn: false,
      paused: false,
    });
    expect(tutorial.stage).toBe('open');
    expect(f.unpacking.activate(f.can)).toBeUndefined();
    expect(f.queue.tick(f.queue.remaining).failed).toEqual([]);
    expect(tutorial.stage).toBe('eat');
  });
});
