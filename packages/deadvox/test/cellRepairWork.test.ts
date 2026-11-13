import { worldCellRepair } from '@skelly/engine/internal/core/blockDamage.ts';
import type { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import { gameMinutes } from '@skelly/engine/internal/core/time.ts';
import { craftActionHooks } from '@skelly/engine/internal/core/craftWork.ts';
import { snapshotItem } from '@skelly/engine/internal/core/items.ts';
import {
  applyReplayActionPayload,
  type ReplayActionPayload,
} from '@skelly/engine/internal/game/replayCommands.ts';
import { CraftCommands, HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { decodeSave } from '@skelly/engine/save';
import type { LongJob } from '@skelly/engine/internal/core/longAction.ts';
import { bindReach, Character } from '@skelly/engine/sim';
import { contentLookup } from '@skelly/presentation/ui';
import { type Vec3, World } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { Simulation } from './simulationFixture.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const ORIGIN: [number, number, number] = [0, 0, 0];
const CELL: Vec3 = [1, 1, 0];
const MISSING_CELL: Vec3 = [1, 2, 0];
const STOCK = 'cell_repair_stock';
const BLOCK = 'cell_repair_block';
const RECIPE = 'cell_repair_recipe';
const AMOUNT = 5;
const registry = (() => {
  const registry = baseRegistry();
  const material = { ...fixtureBlockMaterial('cell_repair_rubble'), id: 'cell_repair_material' };
  registry.blockMaterials.set(material.id, material);
  registry.blockIds.set(BLOCK, registry.blocks.length);
  registry.blocks.push({ id: BLOCK, name: 'Fixture wall', material: material.id, solid: true, color: '#888888' });
  registry.items.set(STOCK, {
    id: STOCK,
    name: 'Stock',
    category: 'material',
    size: [1, 1],
    weight: 1,
    workInProgress: false,
  });
  registry.recipes.set(RECIPE, {
    id: RECIPE,
    kind: 'repair',
    result: { item: STOCK, count: 1 },
    repair: { block: BLOCK, skill: 'crafting', amount: AMOUNT, perSkill: 0 },
    category: 'repair_structures',
    tags: [],
    searchTerms: [],
    timeGameMinutes: gameMinutes(1),
    skills: {},
    qualities: {},
    components: [[{ item: STOCK, count: 2 }]],
  });
  return registry;
})();

/** Block damage records run through the world owner's own terrain view, as strikes do. */
const terrainOf = (world: World): CanonicalTerrain =>
  ({ world, getBlock: (x: number, y: number, z: number) => world.getBlock(x, y, z), ensureCell: () => undefined }) as unknown as CanonicalTerrain;

interface Saved {
  inventory: ReturnType<Inventory['snapshotState']>;
  simulation: ReturnType<Simulation['snapshotState']>;
  action: ReturnType<Simulation['actions']['snapshotState']>;
  damage: ReturnType<World['blockDamage']['snapshotState']>;
}
const make = (saved?: Saved) => {
  const world = new World();
  world.setBlock(CELL[0], CELL[1], CELL[2], registry.blockIds.get(BLOCK)!);
  if (saved) {
    const issues = world.blockDamage.restoreState(saved.damage, registry);
    if (issues.length > 0) {
      throw new Error(issues.join('; '));
    }
  }
  const character = new Character(registry);
  character.initializeProgression({}, [RECIPE]);
  const inventory = saved
    ? Inventory.restoreState(registry, saved.inventory)
    : new Inventory(registry, undefined, undefined, character);
  const sim = new Simulation({ seed: 1 });
  const position: [number, number, number] = [...ORIGIN];
  const reach = bindReach({ inventory, position, blockSize: 0.5, clock: BASE_CLOCK });
  const hooks = craftActionHooks(inventory, character, reach, { feet: () => position, calendar: () => sim.calendar });
  sim.actions.craft = hooks;
  if (saved) {
    sim.restoreState(saved.simulation);
    sim.actions.restoreState(saved.action);
    sim.paused = false;
  }
  inventory.cellRepair = worldCellRepair(world, registry);
  const commands = new CraftCommands({ inventory, character, sim, queue: new HandlingQueue(inventory), reach });
  return { world, inventory, sim, commands, hooks, position };
};
const prepare = (damage?: number) => {
  const r = make();
  if (damage !== undefined) {
    r.world.blockDamage.record(terrainOf(r.world), registry, CELL, damage);
  }
  const inputs = [r.inventory.create(STOCK, 1, 0.7), r.inventory.create(STOCK, 1, 0.4)];
  for (const item of inputs) {
    if (!r.inventory.add(item, { kind: 'pile', pos: [...ORIGIN] })) {
      throw new Error('Fixture input did not fit');
    }
  }
  return { ...r, exact: inputs.map((item) => snapshotItem(item)) };
};
const workUidOf = (job: Readonly<LongJob> | null | undefined): number => {
  if (job?.jobType !== 'craft') {
    throw new Error('Fixture cell repair did not start a craft job');
  }
  return job.workUid;
};
const start = (damage: number) => {
  const r = prepare(damage);
  const refusal = r.commands.repairCell(RECIPE, CELL);
  if (refusal) {
    throw new Error(refusal);
  }
  const uid = workUidOf(r.sim.actions.job);
  return { ...r, uid, work: r.inventory.itemByUid(uid)! };
};
const finish = (r: ReturnType<typeof make>, uid: number) => {
  const { work } = r.inventory.itemByUid(uid)!;
  r.sim.scheduler.advance((work!.duration - work!.elapsed) / r.sim.clock.ratio + 1);
};
const returned = (r: ReturnType<typeof make>) =>
  [...r.inventory.items()]
    .filter(({ item }) => item.type === STOCK)
    .map(({ item }) => snapshotItem(item))
    .sort((a, b) => a.uid - b.uid);
const dispatch = (r: ReturnType<typeof make>, payload: ReplayActionPayload) => {
  const unused = (): never => {
    throw new Error('Unexpected replay owner');
  };
  return applyReplayActionPayload(payload, {
    inventory: r.inventory,
    queue: new HandlingQueue(r.inventory),
    quickbar: { assign: unused },
    craftRepairEntity: unused,
    craftRepairCell: (recipe, cell, preference, sources) => r.commands.repairCell(recipe, cell, preference, sources),
    craftTakeApartEntity: unused,
    search: unused,
    work: (uid, operation) => r.commands.act(uid, operation),
    vehicleWork: unused,
    loadBattery: unused,
    unloadBattery: unused,
    toHands: unused,
    pickup: unused,
    interact: unused,
    lift: unused,
    useFurniture: unused,
    slide: unused,
    place: unused,
    turn: unused,
    tip: unused,
    clearDownedBody: unused,
    craftStart: unused,
    craftContinue: unused,
    craftStop: unused,
    wait: unused,
    setWakeGameHour: unused,
    cancelItemThrow: unused,
    throwItem: unused,
  });
};

it('reduces retained cell damage by the repair amount and keeps the damage identity', () => {
  const r = start(AMOUNT + 7);
  const before = r.world.blockDamage.get(CELL)!;
  finish(r, r.uid);
  const after = r.world.blockDamage.get(CELL)!;
  expect(after.damage).toBe(before.damage - AMOUNT);
  expect(after.epoch).toBe(before.epoch);
  expect(r.inventory.itemByUid(r.uid)).toBeUndefined();
});

it('clears fully mended cell damage through the replay command and consumes the inputs once', () => {
  const r = prepare(AMOUNT - 1);
  expect(dispatch(r, { kind: 'craft.repair-cell', recipeId: RECIPE, cell: [...CELL], preference: {} })).toBeUndefined();
  const uid = workUidOf(r.sim.actions.job);
  finish(r, uid);
  expect(r.world.blockDamage.get(CELL)).toBeUndefined();
  expect(returned(r)).toEqual([]);
  r.sim.scheduler.advance(1);
  expect(returned(r)).toEqual([]);
  expect(r.inventory.hands.right).toBeFalsy();
});

it('refuses cell repair of an undamaged cell, a missing block and an unreachable cell without taking inputs', () => {
  const r = prepare();
  const before = r.inventory.snapshotState();
  expect(r.commands.repairCell(RECIPE, CELL)).toBeDefined();
  expect(r.commands.repairCell(RECIPE, MISSING_CELL)).toBeDefined();
  expect(r.inventory.snapshotState()).toEqual(before);
  expect(r.sim.actions.job).toBeUndefined();
  r.world.blockDamage.record(terrainOf(r.world), registry, CELL, AMOUNT);
  r.position[0] += 100;
  expect(r.commands.repairCell(RECIPE, CELL)).toBeDefined();
  expect(r.inventory.snapshotState()).toEqual(before);
});

it('saves and loads a mid-job cell repair and completes it once without duplicate payout', async () => {
  const r = start(AMOUNT - 1);
  expect(r.work.work?.repairTarget).toEqual({ kind: 'cell', cell: [...CELL] });
  r.sim.scheduler.advance(r.work.work!.duration / r.sim.clock.ratio / 3);
  r.sim.actions.stop();
  expect(r.work.work!.elapsed).toBeGreaterThan(0);
  const template = capture(createRuntime());
  const saved = {
    ...template,
    character: {
      ...template.character,
      inventory: r.inventory.snapshotState(),
      longAction: r.sim.actions.snapshotState(),
      simulation: r.sim.snapshotState(),
    },
  };
  const decoded = await decodeSave(await encodeFixture(saved), {
    version: formatVersion,
    contentLookup: (kind, id) => contentLookup(registry, kind, id),
  });
  const loaded = make({
    inventory: decoded.snapshot.character.inventory,
    action: r.sim.actions.snapshotState(),
    simulation: r.sim.snapshotState(),
    damage: r.world.blockDamage.snapshotState(),
  });
  expect(loaded.inventory.itemByUid(r.uid)!.work).toEqual(r.work.work);
  expect(loaded.commands.act(r.uid, 'continue')).toBeUndefined();
  finish(loaded, r.uid);
  expect(loaded.world.blockDamage.get(CELL)).toBeUndefined();
  expect(returned(loaded)).toEqual([]);
  loaded.hooks.finish(r.uid);
  loaded.sim.actions.resume();
  loaded.sim.scheduler.advance(1);
  expect(loaded.world.blockDamage.get(CELL)).toBeUndefined();
  expect(returned(loaded)).toEqual([]);
});

it('refuses completing a cell repair whose block was destroyed, returning the escrow once', () => {
  const r = start(AMOUNT);
  r.sim.actions.stop();
  r.world.setBlock(CELL[0], CELL[1], CELL[2], 0);
  const reason = r.hooks.validate(r.uid);
  expect(reason).toBeDefined();
  expect(r.hooks.finish(r.uid)).toBe(reason);
  expect(r.world.blockDamage.get(CELL)).toBeUndefined();
  expect(returned(r)).toEqual(r.exact);
  expect(r.inventory.itemByUid(r.uid)).toBeUndefined();
  expect(r.inventory.hands.right).toBeFalsy();
  r.hooks.finish(r.uid);
  expect(returned(r)).toEqual(r.exact);
});
