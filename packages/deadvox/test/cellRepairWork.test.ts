import { worldCellRepair } from '@skelly/engine/internal/core/blockDamage.ts';
import { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import { claimed } from '@skelly/engine/internal/core/capabilities.ts';
import type { RecipeDef } from '@skelly/engine/internal/core/content.ts';
import { craftActionHooks } from '@skelly/engine/internal/core/craftWork.ts';
import { conditionWord, repairCeiling, snapshotItem } from '@skelly/engine/internal/core/items.ts';
import type { LongJob } from '@skelly/engine/internal/core/longAction.ts';
import type { ColumnSource } from '@skelly/engine/internal/core/site.ts';
import { gameMinutes, simSeconds } from '@skelly/engine/internal/core/time.ts';
import { applyReplayActionPayload, type ReplayActionPayload } from '@skelly/engine/internal/game/replayCommands.ts';
import { CraftCommands, HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { decodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { bindReach, Character } from '@skelly/engine/sim';
import { CHUNK, createTerrainEvaluator, type TerrainPlan, type Vec3, World } from '@skelly/engine/world';
import { contentLookup } from '@skelly/presentation/ui';
import { expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { blockMaterialFixture, fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { Simulation } from './simulationFixture.ts';
import { encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const ORIGIN: [number, number, number] = [0, 0, 0];
const CELL: Vec3 = [1, 1, 0];
const MISSING_CELL: Vec3 = [1, 2, 0];
const STOCK = 'cell_repair_stock';
const BLOCK = 'cell_repair_block';
const RECIPE = 'cell_repair_recipe';
const AMOUNT = 5;
/** The same repair under the content default ceiling; `RECIPE` names the top band, so it mends fully. */
const CEILED_RECIPE = 'cell_repair_ceiled_recipe';
const cellRecipe = (id: string, ceiling?: string): RecipeDef => ({
  id,
  kind: 'repair',
  result: { item: STOCK, count: 1 },
  repair: { block: BLOCK, skill: 'crafting', amount: AMOUNT, perSkill: 0, ...(ceiling ? { ceiling } : {}) },
  category: 'repair_structures',
  tags: [],
  searchTerms: [],
  timeGameMinutes: gameMinutes(1),
  skills: {},
  qualities: {},
  components: [[{ item: STOCK, count: 2 }]],
});
const registry = (() => {
  const base = baseRegistry();
  const top = claimed(base.inventory, 'player')!.conditionBands.at(-1)!.word;
  const material = { ...fixtureBlockMaterial('cell_repair_rubble'), id: 'cell_repair_material' };
  base.blockMaterials.set(material.id, material);
  base.blockIds.set(BLOCK, base.blocks.length);
  base.blocks.push({ id: BLOCK, name: 'Fixture wall', material: material.id, solid: true, color: '#888888' });
  base.items.set(STOCK, {
    id: STOCK,
    name: 'Stock',
    category: 'material',
    size: [1, 1],
    weight: 1,
    workInProgress: false,
  });
  base.recipes.set(RECIPE, cellRecipe(RECIPE, top));
  base.recipes.set(CEILED_RECIPE, cellRecipe(CEILED_RECIPE));
  return base;
})();

/** Block damage records run through the world owner's own terrain view, as strikes do. */
const terrainOf = (world: World): CanonicalTerrain =>
  ({
    world,
    getBlock: (x: number, y: number, z: number) => world.getBlock(x, y, z),
    ensureCell: () => undefined,
  }) as unknown as CanonicalTerrain;

// The save round-trip runs the same session the game runs: damage enters the save through the session's own
// strike owner and returns only through the decoded snapshot (`packages/deadvox/test/terrainStrike.test.ts`).
const SESSION_SEED = 7;
const SESSION_SCALE = { blockSize: 0.5, minCy: 0, maxCy: 0 };
const WALL: Vec3 = [CHUNK + 3, 1, 5];
const SPAWN: Vec3 = [WALL[0] - 1, 1, WALL[2]];
const sessionRegistry = (() => {
  const base = baseRegistry();
  for (const sound of blockMaterialFixture(BLOCK).sounds) {
    base.sounds.set(sound.id, {
      ...sound,
      minIntervalSimSeconds: simSeconds(0),
      category: 'world',
      pitchJitter: [1, 1],
      gainJitter: [1, 1],
    });
  }
  base.blockMaterials.set('cell_repair_material', {
    ...fixtureBlockMaterial(BLOCK),
    id: 'cell_repair_material',
    breakable: true,
    rubble: [{ item: STOCK, count: 1 }],
  });
  base.blockIds.set(BLOCK, base.blocks.length);
  base.blocks.push({
    id: BLOCK,
    name: 'Fixture wall',
    material: 'cell_repair_material',
    solid: true,
    color: '#888888',
  });
  base.items.set(STOCK, {
    id: STOCK,
    name: 'Stock',
    category: 'material',
    size: [1, 1],
    weight: 1,
    workInProgress: false,
  });
  base.recipes.set(RECIPE, cellRecipe(RECIPE, claimed(base.inventory, 'player')!.conditionBands.at(-1)!.word));
  return base;
})();
const sessionSource: ColumnSource = {
  furnitureIn: () => [],
  lootPointsIn: () => [],
  supplySourcesIn: () => [],
  actorsIn: () => [],
};
const sessionTerrain = (): TerrainPlan => ({
  seed: SESSION_SEED,
  scale: SESSION_SCALE,
  blocks: {
    grass: sessionRegistry.blockIds.get(BLOCK)!,
    dirt: sessionRegistry.blockIds.get(BLOCK)!,
    rock: sessionRegistry.blockIds.get(BLOCK)!,
    sand: sessionRegistry.blockIds.get(BLOCK)!,
    water: sessionRegistry.blockIds.get(BLOCK)!,
  },
  shape: {
    minHeightMetres: 0,
    maxHeightMetres: 0,
    beachBelowMetres: 0,
    dirtDepthMetres: 1,
    featureSizeMetres: 1,
    octaves: 1,
  },
  site: {
    kind: 'weathering-pad',
    data: {
      blockSize: SESSION_SCALE.blockSize,
      padTop: 0,
      heightPad: { x0: 0, x1: 0, z0: 0, z1: 0 },
      materialPad: { x0: 0, x1: 0, z0: 0, z1: 0 },
      concrete: sessionRegistry.blockIds.get(BLOCK)!,
      structures: [],
    },
  },
  structures: [
    { min: WALL, max: [WALL[0] + 1, WALL[1] + 2, WALL[2] + 1], block: sessionRegistry.blockIds.get(BLOCK)! },
  ],
});
const sessionFixture = (restored?: Readonly<SaveSnapshot>) => {
  const world = new World();
  const canonical = new CanonicalTerrain(world, createTerrainEvaluator(sessionTerrain()));
  const session = createSession({
    registry: sessionRegistry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale: SESSION_SCALE,
    seed: SESSION_SEED,
    start: 43_200,
    spawn: [...SPAWN],
    terrainDestruction: { terrain: canonical, source: sessionSource },
    isSolid: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    isOpaque: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restored ? { restore: restored } : {}),
  });
  return { registry: sessionRegistry, world, session, inventory: session.inventory };
};

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
  character.initializeProgression({}, [RECIPE, CEILED_RECIPE]);
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
    craftTakeApartCell: unused,
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

it('stops a cell repair at the content default ceiling and refuses a cell standing at it', () => {
  const damage = AMOUNT + 7;
  const s = prepare(damage);
  const { durability, epoch } = s.inventory.cellRepair!.state(CELL)!;
  const ceiling = repairCeiling(registry, registry.recipes.get(CEILED_RECIPE));
  expect(1 - damage / durability, 'the fixture cell starts below the ceiling').toBeLessThan(ceiling);
  expect(1 - (damage - AMOUNT) / durability, 'an uncapped repair would pass the ceiling').toBeGreaterThan(ceiling);
  expect(s.commands.repairCell(CEILED_RECIPE, CELL)).toBeUndefined();
  finish(s, workUidOf(s.sim.actions.job));
  const after = s.world.blockDamage.get(CELL)!.damage;
  expect(damage - after, 'the ceiling held back part of the amount').toBeLessThan(AMOUNT);
  expect(1 - after / durability).toBeGreaterThanOrEqual(ceiling);
  expect(conditionWord(registry, 1 - after / durability)).toBe(conditionWord(registry, ceiling));
  expect(s.inventory.cellRepair!.refusal(CELL, epoch, BLOCK, { amount: AMOUNT, ceiling })).toBeDefined();
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

const stockOf = (inventory: Inventory) =>
  [...inventory.items()]
    .filter(({ item }) => item.type === STOCK)
    .map(({ item }) => snapshotItem(item))
    .sort((a, b) => a.uid - b.uid);

it('saves and loads a mid-job cell repair and completes it once without duplicate payout', async () => {
  const f = sessionFixture();
  f.session.character.initializeProgression({}, [RECIPE]);
  const inputs = [f.session.inventory.create(STOCK, 1, 0.7), f.session.inventory.create(STOCK, 1, 0.4)];
  for (const item of inputs) {
    if (!f.session.inventory.add(item, { kind: 'pile', pos: [...SPAWN] })) {
      throw new Error('Fixture input did not fit');
    }
  }
  f.session.damageTerrainCell(WALL, 4);
  const damage = f.world.blockDamage.get(WALL)!;
  expect(damage.damage).toBe(4);
  expect(f.session.crafting.repairCell(RECIPE, WALL)).toBeUndefined();
  const uid = workUidOf(f.session.sim.actions.job);
  const work = f.session.inventory.itemByUid(uid)!.work!;
  expect(work.repairTarget).toEqual({ kind: 'cell', cell: [...WALL], epoch: damage.epoch });
  f.session.sim.scheduler.advance(work.duration / f.session.sim.clock.ratio / 3);
  f.session.sim.actions.stop();
  expect(work.elapsed).toBeGreaterThan(0);
  const saved = f.session.snapshot({ worldId: 'cell-repair-world', characterId: 'cell-repair-character' });
  const decoded = await decodeSave(await encodeFixture(saved), {
    version: formatVersion,
    contentLookup: (kind, id) => contentLookup(f.registry, kind, id),
  });
  const { session, world, inventory } = sessionFixture(decoded.snapshot);
  session.sim.paused = false;
  expect(world.blockDamage.get(WALL)).toEqual(damage);
  expect(inventory.itemByUid(uid)!.work).toEqual(work);
  expect(session.crafting.act(uid, 'continue')).toBeUndefined();
  const remaining = inventory.itemByUid(uid)!.work!;
  session.sim.scheduler.advance((remaining.duration - remaining.elapsed) / session.sim.clock.ratio + 1);
  expect(world.blockDamage.get(WALL)).toBeUndefined();
  expect(stockOf(inventory)).toEqual([]);
  session.sim.actions.craft?.finish(uid);
  session.sim.actions.resume();
  session.sim.scheduler.advance(1);
  expect(world.blockDamage.get(WALL)).toBeUndefined();
  expect(stockOf(inventory)).toEqual([]);
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

it('refuses a replaced block of the same type as a repair target, returning the escrow once', () => {
  const r = start(AMOUNT + 7);
  const pinned = r.world.blockDamage.get(CELL)!.epoch;
  r.sim.actions.stop();
  r.world.setBlock(CELL[0], CELL[1], CELL[2], 0);
  r.world.setBlock(CELL[0], CELL[1], CELL[2], registry.blockIds.get(BLOCK)!);
  expect(r.world.blockDamage.get(CELL)).toBeUndefined();
  r.world.blockDamage.record(terrainOf(r.world), registry, CELL, AMOUNT + 3);
  const replacement = r.world.blockDamage.get(CELL)!;
  expect(replacement.epoch).not.toBe(pinned);
  const reason = r.hooks.validate(r.uid);
  expect(reason).toBeDefined();
  expect(r.hooks.finish(r.uid)).toBe(reason);
  expect(r.world.blockDamage.get(CELL)).toEqual(replacement);
  expect(returned(r)).toEqual(r.exact);
  expect(r.inventory.itemByUid(r.uid)).toBeUndefined();
  expect(r.inventory.hands.right).toBeFalsy();
  r.hooks.finish(r.uid);
  expect(returned(r)).toEqual(r.exact);
});
