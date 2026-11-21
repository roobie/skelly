import { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import { claimed } from '@skelly/engine/internal/core/capabilities.ts';
import type { RecipeDef } from '@skelly/engine/internal/core/content.ts';
import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { craftActionHooks } from '@skelly/engine/internal/core/craftWork.ts';
import { snapshotItem } from '@skelly/engine/internal/core/items.ts';
import type { Body } from '@skelly/engine/internal/core/physics.ts';
import { gameMinutes } from '@skelly/engine/internal/core/time.ts';
import type { WorldDestination } from '@skelly/engine/internal/core/worldDestination.ts';
import { createWorldPlacement } from '@skelly/engine/internal/core/worldPlacement.ts';
import { isReplayActionPayload } from '@skelly/engine/internal/game/replayCommands.ts';
import { CraftCommands, doorPlan, HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { bindReach, Character } from '@skelly/engine/sim';
import { World } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { fixtureTerrain } from './fixtures/terrain.ts';
import { Simulation } from './simulationFixture.ts';

const STOCK = 'placement_stock';
const BLOCK = 'placement_block';
const PIECE = 'placement_piece';
const CELL_RECIPE = 'placement_cell_recipe';
const ENTITY_RECIPE = 'placement_entity_recipe';
const BOARD_RECIPE = 'placement_board_recipe';
const DOOR = 'improvised_wood_door';
/** On the fixture ground, whose top row is y = 0, so the placed cell stands on natural terrain. */
const CELL: WorldDestination = { kind: 'cell', pos: [1, 1, 0] };
const SPOT: WorldDestination = { kind: 'entity', pos: [1.25, 2, 0.25], facing: 'e' };
const registry = baseRegistry();
registry.items.set(STOCK, {
  id: STOCK,
  name: 'Fixture stock',
  category: 'material',
  size: [1, 1],
  weight: 1,
  workInProgress: false,
});
registry.blockIds.set(BLOCK, registry.blocks.length);
registry.blocks.push({ ...registry.blocks.find((block) => block.solid)!, id: BLOCK, name: 'Fixture block' });
registry.furniture.set(PIECE, {
  id: PIECE,
  name: 'Fixture piece',
  size: [1, 1, 1],
  color: '#888888',
  material: [...registry.furnitureMaterials.keys()][0]!,
  breach: { minimumStrength: 1, durability: 10 },
});
for (const [id, result] of [
  [CELL_RECIPE, { block: BLOCK, count: 1 }],
  [ENTITY_RECIPE, { entity: PIECE, count: 1 }],
  [BOARD_RECIPE, { doorBoarding: [...registry.boardings.keys()][0]!, count: 1 }],
] as const) {
  registry.recipes.set(id, {
    id,
    result,
    category: 'repair_structures',
    tags: [],
    searchTerms: [],
    timeGameMinutes: gameMinutes(1),
    skills: {},
    qualities: {},
    components: [[{ item: STOCK, count: 2 }]],
  } satisfies RecipeDef);
}
const scale = { blockSize: 0.5, minCy: 0, maxCy: 0 };
const evaluator = fixtureTerrain({
  scale,
  floor: 0,
  blocks: Object.fromEntries(
    ['grass', 'dirt', 'rock', 'sand', 'water'].map((key) => [key, registry.blockIds.get(BLOCK)!]),
  ) as never,
});
interface Saved {
  inventory: ReturnType<Inventory['snapshotState']>;
  columns: ReturnType<World['snapshotColumns']>;
  sim: ReturnType<Simulation['snapshotState']>;
  action: ReturnType<Simulation['actions']['snapshotState']>;
}
const make = (saved?: Saved) => {
  const world = new World();
  if (saved) {
    world.restoreColumns(saved.columns, (id) => registry.blockIds.get(id)!);
  }
  const terrain = new CanonicalTerrain(world, evaluator);
  const character = new Character(registry);
  character.initializeProgression({}, [CELL_RECIPE, ENTITY_RECIPE, BOARD_RECIPE]);
  const inventory = saved
    ? Inventory.restoreState(registry, saved.inventory, undefined, { character })
    : new Inventory(registry, undefined, undefined, character);
  const sim = new Simulation({ seed: 1 });
  const position: [number, number, number] = [0, 2, 0];
  const bodies: Body[] = [];
  const reach = bindReach({ inventory, position, blockSize: scale.blockSize, clock: BASE_CLOCK });
  inventory.worldPlacement = createWorldPlacement({ inventory, terrain, bodies: () => bodies });
  const hooks = craftActionHooks(inventory, character, reach, { feet: () => position, calendar: () => sim.calendar });
  sim.actions.craft = hooks;
  if (saved) {
    sim.restoreState(saved.sim);
    sim.actions.restoreState(saved.action);
    sim.paused = false;
  } else {
    for (const condition of [0.4, 0.7]) {
      if (!inventory.add(inventory.create(STOCK, 1, condition), { kind: 'pile', pos: position })) {
        throw new Error('Fixture stock did not fit');
      }
    }
  }
  const commands = new CraftCommands({ inventory, character, sim, queue: new HandlingQueue(inventory), reach });
  return { world, terrain, inventory, sim, commands, hooks, bodies, position };
};
const save = (r: ReturnType<typeof make>): Saved =>
  JSON.parse(
    JSON.stringify({
      inventory: r.inventory.snapshotState(),
      columns: r.world.snapshotColumns((id) => registry.blocks[id]!.id),
      sim: r.sim.snapshotState(),
      action: r.sim.actions.snapshotState(),
    }),
  );
const start = (r: ReturnType<typeof make>, entity = false) => {
  const refusal = r.commands.place(entity ? ENTITY_RECIPE : CELL_RECIPE, entity ? SPOT : CELL);
  if (refusal) {
    throw new Error(refusal);
  }
  const work = r.inventory.hands.right;
  if (!work?.work) {
    throw new Error('Expected placement work in hand');
  }
  return work;
};
const finish = (r: ReturnType<typeof make>, uid: number) => {
  const work = r.inventory.itemByUid(uid)?.work;
  if (!work) {
    throw new Error('Expected live work');
  }
  r.sim.scheduler.advance((work.duration - work.elapsed) / r.sim.clock.ratio + 1);
};

it.each(['terrain', 'piece', 'contents', 'body'] as const)(
  'refuses placement over %s without escrow or publishing scratch terrain',
  (obstacle) => {
    const r = make();
    if (obstacle === 'terrain') {
      r.terrain.ensureCell(...CELL.pos);
      r.world.setBlock(...CELL.pos, registry.blockIds.get(BLOCK)!);
    }
    if (obstacle === 'piece') {
      r.inventory.entities.add({ type: PIECE, pos: CELL.pos, size: [1, 1, 1], facing: 'n' });
    }
    if (obstacle === 'contents') {
      expect(r.inventory.add(r.inventory.create(STOCK), { kind: 'pile', pos: CELL.pos })).toBe(true);
    }
    if (obstacle === 'body') {
      r.bodies.push({ pos: [1.5, 1, 0.5], vel: [0, 0, 0], halfWidth: 0.25, height: 2, onGround: true });
    }
    const before = save(r);
    expect(r.commands.place(CELL_RECIPE, CELL)).toBeTruthy();
    expect(save(r)).toEqual(before);
  },
);

it('refuses a floating block before spending inputs, then admits it once a placed block holds it', () => {
  const r = make();
  const above: WorldDestination = { kind: 'cell', pos: [CELL.pos[0], CELL.pos[1] + 1, CELL.pos[2]] };
  const unsupported = coreMessage(registry, 'placementUnsupported');
  const before = save(r);
  expect(r.commands.previewPlacement(CELL_RECIPE, above).refusal).toBe(unsupported);
  expect(r.commands.place(CELL_RECIPE, above)).toBe(unsupported);
  expect(save(r)).toEqual(before);
  finish(r, start(r).uid);
  expect(r.world.support.isPlaced(CELL.pos)).toBe(true);
  expect(r.inventory.worldPlacement!.refusal(registry.recipes.get(CELL_RECIPE)!, above)).toBeUndefined();
});

it('requires an explicit destination and validates the result grain before spending inputs', () => {
  const r = make();
  const before = r.inventory.snapshotState();
  expect(r.commands.start(CELL_RECIPE)).toBeTruthy();
  expect(r.commands.place(CELL_RECIPE, { kind: 'cell', pos: [1.5, 2, 0] })).toBeTruthy();
  expect(r.commands.place(ENTITY_RECIPE, CELL)).toBeTruthy();
  expect(r.inventory.snapshotState()).toEqual(before);
});

it('reserves a stopped destination through save/load and releases it only on cancellation', () => {
  const r = make();
  const inputs = [...r.inventory.items()]
    .filter(({ item }) => item.type === STOCK)
    .map(({ item }) => snapshotItem(item));
  const work = start(r);
  r.sim.actions.stop();
  expect(r.inventory.move(work, { kind: 'pile', pos: r.position }).ok).toBe(true);
  for (const condition of [0.8, 0.9]) {
    const stock = r.inventory.create(STOCK, 1, condition);
    expect(r.inventory.add(stock, { kind: 'pile', pos: r.position })).toBe(true);
    inputs.push(snapshotItem(stock));
  }
  const restored = make(save(r));
  expect(restored.commands.previewPlacement(CELL_RECIPE, CELL).result).toHaveProperty('plan');
  expect(restored.commands.previewPlacement(CELL_RECIPE, CELL).refusal).toBeTruthy();
  expect(restored.commands.act(work.uid, 'apart')).toBeUndefined();
  expect(
    [...restored.inventory.items()]
      .filter(({ item }) => item.type === STOCK)
      .map(({ item }) => snapshotItem(item))
      .sort((a, b) => a.uid - b.uid),
  ).toEqual(inputs.sort((a, b) => a.uid - b.uid));
  expect(restored.commands.previewPlacement(CELL_RECIPE, CELL).refusal).toBeUndefined();
  start(restored);
});

it.each([false, true])('places one world result and consumes escrow once across save/load (entity=%s)', (entity) => {
  const r = make();
  const work = start(r, entity);
  r.sim.actions.stop();
  const restored = make(save(r));
  expect(restored.commands.act(work.uid, 'continue')).toBeUndefined();
  finish(restored, work.uid);
  const completed = make(save(restored));
  expect([...completed.inventory.items()].some(({ item }) => item.type === STOCK || item.work)).toBe(false);
  expect(completed.inventory.hands.right).toBeUndefined();
  if (entity) {
    const pieces = [...completed.inventory.entities.all].filter((piece) => piece.type === PIECE);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.pos).toEqual(SPOT.pos);
    for (const cell of [
      [1, 2, 0],
      [2, 2, 1],
    ] as const) {
      expect(completed.inventory.entities.at(cell[0], cell[1], cell[2])).toBe(pieces[0]);
      expect(completed.inventory.entities.isSolid(cell[0], cell[1], cell[2])).toBe(true);
    }
  } else {
    expect(completed.world.getBlock(...CELL.pos)).toBe(registry.blockIds.get(BLOCK));
    expect(completed.world.getBlock(0, 0, 0)).not.toBe(0);
  }
  completed.hooks.finish(work.uid);
  expect(save(completed)).toEqual(save(make(save(completed))));
});

it('revalidates contents at completion without losing inputs, then resumes the reserved job', () => {
  const r = make();
  const work = start(r);
  r.hooks.advance(work.uid, work.work!.duration);
  const obstruction = r.inventory.create(STOCK);
  expect(r.inventory.add(obstruction, { kind: 'pile', pos: CELL.pos })).toBe(true);
  expect(() => r.hooks.finish(work.uid)).toThrow();
  expect(r.world.getBlock(...CELL.pos)).toBe(0);
  expect(work.work!.components).toHaveLength(2);
  r.sim.actions.stop();
  expect(r.inventory.move(obstruction, { kind: 'pile', pos: r.position }).ok).toBe(true);
  expect(r.commands.act(work.uid, 'continue')).toBeUndefined();
  finish(r, work.uid);
  expect(r.world.getBlock(...CELL.pos)).toBe(registry.blockIds.get(BLOCK));
  expect(r.inventory.itemByUid(obstruction.uid)).toBe(obstruction);
});

/** A shut south-facing door beside the worker: its front faces +z, past z = 2, and its back is before z = 1. */
const withDoor = (r: ReturnType<typeof make>) => {
  const door = r.inventory.entities.add({ type: DOOR, pos: [1, 2, 1], size: [2, 4, 1], facing: 's' });
  if (!door) {
    throw new Error('Fixture door did not fit');
  }
  return door;
};
const SIDE_POINT = { front: [2, 2, 3], back: [2, 2, 0] } as const satisfies Record<string, Vec3>;
const openFrom = (r: ReturnType<typeof make>, uid: number, side: keyof typeof SIDE_POINT) => {
  r.inventory.actorPosition = () => [...SIDE_POINT[side]];
  return doorPlan(r.inventory, r.inventory.entities.byUid(uid)!, 'open');
};

it.each(['front', 'back'] as const)(
  'boards a door on the named %s side through saved work; it refuses opening from both faces',
  (side) => {
    const r = make();
    const door = withDoor(r);
    const refusal = r.commands.place(BOARD_RECIPE, { kind: 'door', uid: door.uid, side });
    expect(refusal).toBeUndefined();
    const work = r.inventory.hands.right!;
    r.sim.actions.stop();
    const restored = make(save(r));
    expect(restored.inventory.entities.byUid(door.uid)!.boarding).toBeUndefined();
    expect(restored.commands.act(work.uid, 'continue')).toBeUndefined();
    finish(restored, work.uid);
    const completed = make(save(restored));
    expect([...completed.inventory.items()].some(({ item }) => item.type === STOCK || item.work)).toBe(false);
    for (const face of ['front', 'back'] as const) {
      expect(openFrom(completed, door.uid, face)).toMatchObject({
        ok: false,
        reason: coreMessage(registry, 'boardedUp'),
      });
    }
  },
);

it('holds a door for one boarding job and refuses a second boarding before spending inputs', () => {
  const r = make();
  const door = withDoor(r);
  expect(r.commands.place(BOARD_RECIPE, { kind: 'door', uid: door.uid, side: 'front' })).toBeUndefined();
  const { right: boarding } = r.inventory.hands;
  const { reserved } = claimed(registry.ui, 'interface')!.furnitureMoveMessages;
  const recipe = registry.recipes.get(BOARD_RECIPE)!;
  expect(r.inventory.worldPlacement!.refusal(recipe, { kind: 'door', uid: door.uid, side: 'back' })).toBe(reserved);
  finish(r, boarding!.uid);
  const before = save(r);
  expect(r.commands.place(BOARD_RECIPE, { kind: 'door', uid: door.uid, side: 'back' })).toBe(
    coreMessage(registry, 'alreadyBoarded'),
  );
  expect(save(r)).toEqual(before);
});

it('records only finite explicit world destinations for replay', () => {
  const board = (destination: unknown) =>
    isReplayActionPayload({ kind: 'craft.place', recipeId: BOARD_RECIPE, destination });
  expect(board({ kind: 'door', uid: 3, side: 'back' })).toBe(true);
  expect(board({ kind: 'door', uid: 3, side: 'inside' })).toBe(false);
  expect(board({ kind: 'door', uid: 3, side: 'back', pos: [0, 0, 0] })).toBe(false);
  expect(isReplayActionPayload({ kind: 'craft.place', recipeId: ENTITY_RECIPE, destination: SPOT })).toBe(true);
  expect(isReplayActionPayload({ kind: 'craft.place', recipeId: CELL_RECIPE, destination: CELL })).toBe(true);
  expect(
    isReplayActionPayload({
      kind: 'craft.place',
      recipeId: CELL_RECIPE,
      destination: { kind: 'cell', pos: [0.5, 2, 0] },
    }),
  ).toBe(false);
  expect(
    isReplayActionPayload({
      kind: 'craft.place',
      recipeId: ENTITY_RECIPE,
      destination: { ...SPOT, pos: [Number.NaN, 2, 0] },
    }),
  ).toBe(false);
});
