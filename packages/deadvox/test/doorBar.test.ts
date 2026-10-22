import { expect, it } from 'vitest';
import type { BlockEntity } from '../src/core/blockEntities.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { doorPlan } from '../src/core/options.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { DOOR_ACTION, registerDoorAction } from '../src/game/doorAction.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistryWith } from './baseRegistry.ts';
import { fixtureSources } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const registry = baseRegistryWith(
  fixtureSources([
    {
      source: 'door-bar-fixture',
      data: {
        furniture: [
          {
            id: 'fixture_bar_door',
            name: 'Fixture door',
            size: [1, 1, 1],
            color: '#777777',
            door: { handlingSimSeconds: 0.5, methods: {} },
          },
        ],
        items: [
          {
            id: 'fixture_bar',
            name: 'Fixture bar',
            category: 'tool',
            size: [1, 2],
            weight: 1,
            twoHanded: true,
            doorBar: { setSimSeconds: 1, liftSimSeconds: 1, look: { color: '#555555', thickness: 0.1 } },
          },
        ],
      },
    },
  ]),
);
// The door faces north, so its front is the low-z side.
const FRONT: Vec3 = [0.5, 0, -1];
const BACK: Vec3 = [0.5, 0, 2];
const DOOR = { type: 'fixture_bar_door', pos: [0, 0, 0] as Vec3, size: [1, 1, 1] as Vec3, facing: 'n' as const };

const fixture = () => {
  const inventory = new Inventory(registry);
  const door = inventory.furnish(DOOR)!;
  const queue = new HandlingQueue(inventory);
  registerDoorAction({
    queue,
    inventory,
    player: () => ({ pos: [0, 0, -1], vel: [0, 0, 0], halfWidth: 0.2, height: 1.8, onGround: true }),
    others: () => [],
    playWorldSound: () => undefined,
    closeBlockedMessages: { player: 'fixture player blocks', other: 'fixture other blocks' },
  });
  let at = FRONT;
  inventory.actorPosition = () => at;
  const standAt = (point: Vec3) => {
    at = point;
  };
  /** Plans and runs one door operation to completion; returns its refusal. */
  const act = (operation: 'bar' | 'unbar' | 'open', params: Record<string, boolean>): string | undefined => {
    const plan = doorPlan(inventory, door, operation);
    if (!plan.ok) {
      return plan.reason;
    }
    queue.enqueueAction(DOOR_ACTION, operation, plan.time, { entityUid: door.uid, ...params });
    return queue.tick(plan.time).failed[0]?.reason;
  };
  return { inventory, door, standAt, act };
};

const opensFrom = (inventory: Inventory, door: BlockEntity, point: Vec3) => {
  inventory.actorPosition = () => point;
  return doorPlan(inventory, door, 'open').ok;
};

it('a bar set from one side opens the door only from that side, and only that side lifts it back into the hands', () => {
  const { inventory, door, standAt, act } = fixture();
  inventory.add(inventory.create('fixture_bar'), { kind: 'hand', side: 'right' });
  expect(act('bar', { barring: true })).toBeUndefined();
  expect(door.bar?.side).toBe('front');
  expect(inventory.hands.right).toBeUndefined();

  standAt(BACK);
  expect(act('open', { closing: false })).toBe("It's barred from the other side");
  expect(act('unbar', { barring: false })).toBe("It's barred from the other side");
  expect(door.bar).toBeDefined();

  standAt(FRONT);
  expect(act('open', { closing: false })).toBeUndefined();
  expect(door.open).toBe(true);
  expect(inventory.entities.setOpen(door, false)).toBeUndefined();
  expect(act('unbar', { barring: false })).toBeUndefined();
  expect(door.bar).toBeUndefined();
  expect(inventory.hands.right?.type).toBe('fixture_bar');
  expect(opensFrom(inventory, door, BACK)).toBe(true);
});

it('a save round-trip keeps the barred side of a door', async () => {
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn: [0, 1, 0] });
  const door = runtime.inventory.furnish(DOOR)!;
  expect(runtime.entities.setBar(door, BACK, 'fixture_bar')).toBeUndefined();
  const bytes = await encodeFixture(capture(runtime));
  const decoded = await decodeSave(bytes, {
    version: formatVersion,
    contentLookup: (kind, id) => contentLookup(registry, kind, id),
  });
  const loaded = createRuntime(decoded.snapshot, false, undefined, { registry });
  const restored = loaded.entities.byUid(door.uid)!;
  expect(restored.bar).toEqual({ side: 'back', item: 'fixture_bar' });
  expect(opensFrom(loaded.inventory, restored, FRONT)).toBe(false);
  expect(opensFrom(loaded.inventory, restored, BACK)).toBe(true);
});

it('a save round-trip restores a discounted door-bar craft in progress', async () => {
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn: [0, 1, 0] });
  const recipe = registry.recipes.get('door_bar')!;
  const [component] = recipe.components[0]!;
  const pos = runtime.player.body.pos.map(Math.floor) as Vec3;
  for (const side of ['right', 'left'] as const) {
    const held = runtime.inventory.hands[side];
    if (held) {
      expect(runtime.inventory.move(held, { kind: 'pile', pos }).ok).toBe(true);
    }
  }
  runtime.inventory.entities.add({
    type: 'workbench',
    pos,
    size: registry.furniture.get('workbench')!.size,
    facing: 'n',
  });
  expect(
    runtime.inventory.add(runtime.inventory.create(component!.item, component!.count), { kind: 'pile', pos }),
  ).toBe(true);
  expect(runtime.session.crafting.start(recipe.id)).toBeUndefined();
  const work = runtime.inventory.hands.right!.work!;
  expect(work.duration).toBeLessThan(recipe.timeGameMinutes);

  const bytes = await encodeFixture(capture(runtime));
  const decoded = await decodeSave(bytes, {
    version: formatVersion,
    contentLookup: (kind, id) => contentLookup(registry, kind, id),
  });
  const loaded = createRuntime(decoded.snapshot, false, undefined, { registry });
  const restored = loaded.inventory.itemByUid(runtime.inventory.hands.right!.uid)!;
  expect(restored.work).toMatchObject({ kind: 'craft', recipe: recipe.id });
  expect(loaded.session.crafting.currentUid).toBe(restored.uid);
});
