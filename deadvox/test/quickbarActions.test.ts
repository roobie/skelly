import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Character, dominantSide, offSide } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bestPocket } from '../src/core/options.ts';
import { bindReach } from '../src/core/reach.ts';
import type { ItemDef } from '../src/core/schema.ts';
import { QuickbarActions } from '../src/game/quickbarActions.ts';
import { Survival } from '../src/game/survival.ts';
import { Simulation } from './simulationFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry([
  ...readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
  {
    source: 'test/quickbarActions.test.ts',
    data: {
      items: [
        {
          id: 'fixture_two_handed_tool',
          name: 'Fixture two-handed tool',
          category: 'tool',
          weight: 100,
          size: [1, 2],
          twoHanded: true,
        },
        {
          id: 'fixture_tool',
          name: 'Fixture tool',
          category: 'tool',
          weight: 100,
          size: [1, 1],
          tool: { qualities: { opening: 1 } },
        },
        {
          id: 'fixture_light',
          name: 'Fixture light',
          category: 'light',
          weight: 100,
          size: [1, 1],
          light: { radius: 1, seenFrom: 1, color: '#ffffff', intensity: 1 },
        },
        {
          id: 'fixture_quickbar_bag',
          name: 'Fixture quickbar bag',
          category: 'bag',
          weight: 100,
          size: [2, 1],
          wearable: { slot: 'back', encumbrance: 0 },
          container: {
            pockets: [
              { grid: [1, 1], handling: 0 },
              { grid: [1, 1], handling: 0 },
            ],
          },
        },
        {
          id: 'fixture_small_quickbar_bag',
          name: 'Fixture small quickbar bag',
          category: 'bag',
          weight: 100,
          size: [1, 1],
          wearable: { slot: 'back', encumbrance: 0 },
          container: { pockets: [{ grid: [1, 1], handling: 0 }] },
        },
      ],
    },
  },
]);
const definition = (predicate: (def: ItemDef) => boolean) => {
  for (const def of registry.items.values()) {
    if (predicate(def)) {
      return def;
    }
  }
  throw new Error('Missing fixture item definition');
};
const settle = (queue: HandlingQueue) => {
  while (queue.busy) {
    queue.tick(queue.remaining);
  }
};
const runtime = (handedness?: Character['handedness']) => {
  const character = new Character(registry, { handedness });
  const inventory = new Inventory(registry, undefined, undefined, character);
  const queue = new HandlingQueue(inventory);
  const notices: string[] = [];
  const simulation = new Simulation({ seed: 1 });
  const survival = new Survival(simulation, inventory, queue, {
    reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 1 }),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: (text) => notices.push(text),
    read: () => {
      throw new Error('Unexpected reading in quickbar fixture');
    },
  });
  const actions = new QuickbarActions({
    inventory,
    queue,
    feet: () => [0, 0, 0],
    survival,
    notice: (text) => notices.push(text),
  });
  return { inventory, queue, simulation, survival, actions, notices };
};
const fitsCopies = (size: ItemDef['size'], grid: ItemDef['size'], copies: number): boolean => {
  const orientations: ItemDef['size'][] = [size, [size[1], size[0]]];
  return orientations.some(([width, height]) => grid[0] >= copies * width && grid[1] >= height);
};
const carryInBag = (inventory: Inventory, item: ReturnType<Inventory['create']>, copies = 1) => {
  const { size } = registry.items.get(item.type)!;
  const bagDef = definition(
    (def) =>
      Boolean(def.wearable) && Boolean(def.container?.pockets.some(({ grid }) => fitsCopies(size, grid, copies))),
  );
  const bag = inventory.create(bagDef.id);
  if (!inventory.add(bag, { kind: 'worn' })) {
    throw new Error('Fixture bag could not be worn');
  }
  const pocket = bagDef.container!.pockets.find(({ grid }) => fitsCopies(size, grid, copies))!;
  return { bag, pocket: bagDef.container!.pockets.indexOf(pocket) };
};

describe('quickbar tap and hold actions', () => {
  it('taps a firearm into and out of the hand without invoking its action', () => {
    const { inventory, queue, actions, notices } = runtime();
    const gun = inventory.create(definition((def) => Boolean(def.firearm)).id);
    const { bag, pocket } = carryInBag(inventory, gun);
    expect(inventory.add(gun, { kind: 'pocket', owner: bag, pocket })).toBe(true);
    const source = inventory.targetState(inventory.targetForLocation(inventory.locate(gun)!));
    const firearmBefore = structuredClone(gun.firearm);

    actions.tap(gun);
    settle(queue);
    expect(inventory.hands.right).toBe(gun);
    actions.tap(gun);
    settle(queue);

    expect(inventory.locate(gun)?.kind).toBe('pocket');
    const at = inventory.locate(gun)!;
    expect(inventory.targetState(inventory.targetForLocation(at))).toEqual(source);
    actions.hold(gun);
    expect(gun.firearm).toEqual(firearmBefore);
    expect(notices).toHaveLength(1);
  });

  it('quickbar hold activates a firestarter light with an igniter in the other hand', () => {
    const { inventory, actions } = runtime();
    const candle = inventory.create('candle');
    const matches = inventory.create('matches');
    expect(inventory.add(candle, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.add(matches, { kind: 'hand', side: 'left' })).toBe(true);
    const chargeBefore = matches.charges!;
    const { igniter } = registry.items.get(matches.type)!;
    const { perIgnition } = igniter!;

    actions.hold(candle);

    expect(candle.on).toBe(true);
    expect(matches.charges).toBe(chargeBefore - perIgnition);
  });

  it('quickbar-holds a treatment item on its selected wound without wielding it', () => {
    const { inventory, simulation, survival, actions } = runtime();
    simulation.body.impact(1, 'leftArm', { bleeding: true });
    const rag = inventory.create('rag');
    const { bag, pocket } = carryInBag(inventory, rag);
    expect(inventory.add(rag, { kind: 'pocket', owner: bag, pocket })).toBe(true);
    const selected = survival.selectedItemAction(rag);
    const beginTreatment = vi.spyOn(simulation.actions, 'beginTreatment').mockReturnValue(undefined);

    actions.hold(rag);

    expect(beginTreatment).toHaveBeenCalledWith(selected?.treatment?.region, rag.uid, 'rag', expect.any(Number));
    expect(inventory.hands.right).toBeUndefined();
  });

  it('uses pocket food in one queued job while the held weapon stays in place', () => {
    const { inventory, queue, actions } = runtime();
    const food = inventory.create(definition((def) => Boolean(def.food)).id);
    const { bag, pocket } = carryInBag(inventory, food);
    const weapon = inventory.create(definition((def) => Boolean(def.weapon || def.firearm)).id);
    expect(inventory.add(food, { kind: 'pocket', owner: bag, pocket })).toBe(true);
    expect(inventory.add(weapon, { kind: 'hand', side: 'right' })).toBe(true);

    actions.hold(food);

    expect(queue.jobs).toHaveLength(1);
    expect(food.count).toBeGreaterThan(0);
    expect(inventory.hands.right).toBe(weapon);
    settle(queue);
    expect(inventory.itemByUid(food.uid)).toBeUndefined();
    expect(inventory.hands.right).toBe(weapon);
  });

  it.each(['right', 'left'] as const)('routes quickbar capabilities through a %s-dominant actor', (handedness) => {
    const { inventory, queue, actions } = runtime(handedness);
    const dominant = dominantSide(inventory.character);
    const off = offSide(inventory.character);
    const bag = inventory.create('fixture_quickbar_bag');
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    const light = inventory.create('fixture_light');
    expect(inventory.add(light, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
    actions.tap(light);
    settle(queue);
    expect(inventory.hands[off]).toBe(light);

    const tool = inventory.create('fixture_tool');
    expect(inventory.add(tool, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    actions.tap(tool);
    settle(queue);
    expect(inventory.hands[dominant]).toBe(tool);
    expect(inventory.hands[off]).toBe(light);

    const twoHanded = inventory.create('fixture_two_handed_tool');
    expect(inventory.add(twoHanded, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    actions.tap(twoHanded);
    settle(queue);
    expect(inventory.hands[dominant]).toBe(twoHanded);
    expect(inventory.hands[off]).toBeUndefined();
    expect(inventory.locate(tool)?.kind).toBe('pocket');
    expect(inventory.locate(light)?.kind).toBe('pocket');
  });

  it('keeps an unstowed hand item and reports it instead of dropping or taking a two-handed item', () => {
    const { inventory, queue, actions, notices } = runtime();
    const bag = inventory.create('fixture_small_quickbar_bag');
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    const light = inventory.create('fixture_light');
    expect(inventory.add(light, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
    actions.tap(light);
    settle(queue);
    const tool = inventory.create('fixture_tool');
    expect(inventory.add(tool, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    actions.tap(tool);
    settle(queue);
    const twoHanded = inventory.create('fixture_two_handed_tool');
    expect(inventory.add(twoHanded, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);

    actions.tap(twoHanded);
    settle(queue);

    const toolStowed = inventory.locate(tool)?.kind === 'pocket';
    const lightStowed = inventory.locate(light)?.kind === 'pocket';
    expect(toolStowed).not.toBe(lightStowed);
    const stranded = toolStowed ? light : tool;
    const strandedSide = stranded === tool ? dominantSide(inventory.character) : offSide(inventory.character);
    expect(inventory.locate(stranded)).toMatchObject({ kind: 'hand', side: strandedSide });
    expect(notices.some((notice) => notice.includes(inventory.name(stranded)))).toBe(true);
    expect(inventory.locate(twoHanded)?.kind).toBe('pile');
  });

  it('uses the best pocket when the captured spot is occupied', () => {
    const { inventory, queue, actions } = runtime();
    const itemDef = definition(
      (def) =>
        Boolean(def.weapon) &&
        !def.stack &&
        !def.twoHanded &&
        [...registry.items.values()].some(
          (container) =>
            Boolean(container.wearable) &&
            container.container?.pockets.some(({ grid }) => fitsCopies(def.size, grid, 2)),
        ),
    );
    const item = inventory.create(itemDef.id);
    const { bag, pocket } = carryInBag(inventory, item, 2);
    expect(inventory.add(item, { kind: 'pocket', owner: bag, pocket })).toBe(true);
    const source = inventory.targetForLocation(inventory.locate(item)!);
    if (source.kind !== 'pocket' || !source.at) {
      throw new Error('Pocket fixture did not capture a precise source spot');
    }

    actions.tap(item);
    settle(queue);
    const blocker = inventory.create(item.type);
    expect(inventory.add(blocker, { kind: 'pocket', owner: bag, pocket, at: source.at })).toBe(true);
    const fallback = bestPocket(inventory, item);
    if (!fallback) {
      throw new Error('Pocket fixture has no best-pocket fallback');
    }

    actions.tap(item);
    settle(queue);

    const location = inventory.locate(item);
    if (location?.kind !== 'pocket' || fallback.target.kind !== 'pocket') {
      throw new Error('Quickbar item did not reach the best pocket');
    }
    expect(location.owner).toBe(fallback.target.owner);
    expect(location.pocket).toBe(fallback.target.pocket);
  });
});
