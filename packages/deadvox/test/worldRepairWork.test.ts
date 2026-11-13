import {
  BindingRegistry,
  decodeInputReplay,
  encodeInputReplay,
  InputReplayRecorder,
  type ReplayActionPayload,
} from '@skelly/engine/input';
import { craftActionHooks } from '@skelly/engine/internal/core/craftWork.ts';
import { type FurnitureMover, ruinFurniture } from '@skelly/engine/internal/core/furnitureMove.ts';
import { snapshotItem } from '@skelly/engine/internal/core/items.ts';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';
import { planRealFrame } from '@skelly/engine/internal/game/frameDriver.ts';
import { applyReplayActionPayload, isReplayActionPayload } from '@skelly/engine/internal/game/replayCommands.ts';
import { CraftCommands, HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { decodeSave } from '@skelly/engine/save';
import { bindReach, Character, realSeconds } from '@skelly/engine/sim';
import { runningCraftPresentation, workName } from '@skelly/presentation/internal/ui/craftReadout.ts';
import { handlingViewModel, timedActionHandlingPresentation } from '@skelly/presentation/internal/ui/hud.ts';
import { contentLookup } from '@skelly/presentation/ui';
import { expect, it } from 'vitest';
import { INPUT_BINDINGS } from '../src/product/controls.ts';
import { baseRegistryWith, baseScreenText } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { Simulation } from './simulationFixture.ts';
import { capture, createRuntime, encodeFixture, formatVersion, formatWorldOptions } from './snapshotTestSupport.ts';
import { AMOUNT, DURABILITY, PIECE, RECIPE, STOCK, worldRepairSources } from './worldRepairFixture.ts';

const ORIGIN: [number, number, number] = [0, 0, 0];
const registry = baseRegistryWith(worldRepairSources());

interface Saved {
  inventory: ReturnType<Inventory['snapshotState']>;
  simulation: ReturnType<Simulation['snapshotState']>;
  action: ReturnType<Simulation['actions']['snapshotState']>;
}
const make = (saved?: Saved) => {
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
  const commands = new CraftCommands({ inventory, character, sim, queue: new HandlingQueue(inventory), reach });
  return { inventory, sim, commands, hooks, position };
};
const prepare = () => {
  const r = make();
  const target = r.inventory.entities.add({ type: PIECE, pos: [1, 1, 0], size: [1, 1, 1], facing: 'n' })!;
  if (r.inventory.entities.bash(target, DURABILITY / 2) !== 'damaged') {
    throw new Error('Fixture piece was not damaged');
  }
  const inputs = [r.inventory.create(STOCK, 1, 0.7), r.inventory.create(STOCK, 1, 0.4)];
  for (const item of inputs) {
    if (!r.inventory.add(item, { kind: 'pile', pos: [...ORIGIN] })) {
      throw new Error('Fixture input did not fit');
    }
  }
  const exact = inputs.map((item) => snapshotItem(item));
  return { ...r, target, exact };
};
const start = () => {
  const r = prepare();
  const refusal = r.commands.repairEntity(RECIPE, r.target.uid);
  if (refusal) {
    throw new Error(refusal);
  }
  const work = r.target.work!;
  return { ...r, work };
};
const finish = (r: ReturnType<typeof make>, uid: number) => {
  const work = r.inventory.itemByUid(uid)!.work!;
  r.sim.scheduler.advance((work.duration - work.elapsed) / r.sim.clock.ratio + 1);
};
const returned = (r: ReturnType<typeof make>) =>
  [...r.inventory.items()]
    .filter(({ item }) => item.type === STOCK)
    .map(({ item }) => snapshotItem(item))
    .sort((a, b) => a.uid - b.uid);

it.each(['normal', 'compressed'] as const)(
  'advances the repair arc between %s owner ticks without changing owned work',
  (mode) => {
    const r = start();
    if (mode === 'compressed') {
      planRealFrame(r.sim.compression, realSeconds(1));
      expect(r.sim.compression.c).toBeGreaterThan(1);
    }
    const { handling } = baseScreenText();
    const arc = () => {
      const action = runningCraftPresentation(r.inventory, r.sim.actions.job, {
        simSeconds: r.sim.time,
        clockRatio: r.sim.clock.ratio,
        compressionActive: r.sim.compression.active,
      });
      expect(action).toBeDefined();
      return handlingViewModel(
        timedActionHandlingPresentation(action!, handling, new BindingRegistry(INPUT_BINDINGS)),
        handling,
      );
    };
    const owned = structuredClone(r.work.work);
    const slice =
      Math.min(r.work.work!.duration / r.sim.clock.ratio, r.sim.scheduler.stepOf('long-action', r.sim.compression.c)) /
      4;
    const initial = arc();
    r.sim.frame(simSeconds(slice));
    const first = arc();
    r.sim.frame(simSeconds(slice));
    const second = arc();
    expect(first.visible).toBe(true);
    expect(first.percent).toBeGreaterThan(initial.percent);
    expect(second.percent).toBeGreaterThan(first.percent);
    expect(second.percent).toBeLessThan(100);
    expect(r.work.work).toEqual(owned);
    finish(r, r.work.uid);
    expect(
      runningCraftPresentation(r.inventory, r.sim.actions.job, {
        simSeconds: r.sim.time,
        clockRatio: r.sim.clock.ratio,
        compressionActive: r.sim.compression.active,
      }),
    ).toBeUndefined();
  },
);

it('pauses, encodes, restores and resumes entity work without duplicate repair or spend', async () => {
  const r = start();
  expect(r.work.work?.repairTarget).toEqual({ kind: 'entity', uid: r.target.uid });
  r.sim.scheduler.advance(r.work.work!.duration / r.sim.clock.ratio / 3);
  r.sim.actions.stop();
  expect(r.work.work!.elapsed).toBeGreaterThan(0);
  expect(r.work.work!.elapsed).toBeLessThan(r.work.work!.duration);
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
    action: decoded.snapshot.character.longAction,
    simulation: r.sim.snapshotState(),
  });
  expect(loaded.inventory.itemByUid(r.work.uid)!.work).toEqual(r.work.work);
  expect(loaded.commands.act(r.work.uid, 'continue')).toBeUndefined();
  finish(loaded, r.work.uid);
  expect(loaded.inventory.entities.byUid(r.target.uid)!.damage).toBe(DURABILITY / 2 - AMOUNT);
  expect(loaded.inventory.itemByUid(r.work.uid)).toBeUndefined();
  expect(returned(loaded)).toEqual([]);
  loaded.hooks.finish(r.work.uid);
  loaded.sim.actions.resume();
  loaded.sim.scheduler.advance(1);
  expect(loaded.inventory.entities.byUid(r.target.uid)!.damage).toBe(DURABILITY / 2 - AMOUNT);
  expect(returned(loaded)).toEqual([]);
});

/** The pieces' state apart from the jobs they hold, which a refused completion ends. */
const piecesApartFromJobs = (r: ReturnType<typeof make>) => {
  const state = r.inventory.entities.snapshotState();
  return { ...state, entities: state.entities.map(({ work: _, ...piece }) => piece) };
};

// A piece holding a job can't be lifted, repaired by another job or removed, so only reach and blows change it.
it.each(['out of reach', 'ruined'] as const)(
  're-admits a target that became %s and returns exact escrow on refused completion',
  (change) => {
    const r = start();
    if (change === 'out of reach') {
      r.position[0] += 100;
    }
    if (change === 'ruined') {
      r.inventory.entities.bash(r.target, DURABILITY);
    }
    const before = piecesApartFromJobs(r);
    const reason = r.hooks.validate(r.work.uid);
    expect(reason).toBeDefined();
    expect(r.hooks.finish(r.work.uid)).toBe(reason);
    expect(piecesApartFromJobs(r)).toEqual(before);
    expect(r.target.work).toBeUndefined();
    expect(returned(r)).toEqual(r.exact);
    expect(r.inventory.itemByUid(r.work.uid)).toBeUndefined();
    r.hooks.finish(r.work.uid);
    expect(returned(r)).toEqual(r.exact);
  },
);

it('ruining a piece mid-repair drops the escrowed inputs once, so ruin conserves them', () => {
  const r = start();
  r.sim.actions.stop();
  const mover: FurnitureMover = {
    inventory: r.inventory,
    terrainSolid: (_x, y) => y < 1,
    blockSize: 0.5,
    player: { pos: [30, 1, 30], vel: [0, 0, 0], halfWidth: 0.4, height: 3.6, onGround: true },
    others: [],
    stamina: 100,
  };
  expect(ruinFurniture(mover, r.target)).toEqual([r.target]);
  expect(r.inventory.entities.byUid(r.target.uid)).toBeUndefined();
  expect(returned(r)).toEqual(r.exact);
  expect(r.hooks.validate(r.work.uid)).toBeDefined();
  r.hooks.finish(r.work.uid);
  expect(returned(r)).toEqual(r.exact);
});

it.each(['left', 'right'] as const)(
  'refuses entity repair with the %s hand occupied without moving anything',
  (side) => {
    const r = prepare();
    const held = r.inventory.create(STOCK);
    expect(r.inventory.add(held, { kind: 'hand', side })).toBe(true);
    const before = r.inventory.snapshotState();
    expect(dispatch(r, intent(r.target.uid))).toBeDefined();
    expect(r.inventory.snapshotState()).toEqual(before);
    expect(r.inventory.hands[side]).toBe(held);
    expect(r.sim.actions.job).toBeUndefined();
  },
);

it('live reach refusal keeps escrow and both item-work Continue routes resume the named piece work', () => {
  const r = start();
  r.sim.actions.stop();
  const target = r.inventory.entities.add({ type: PIECE, pos: [1, 1, 1], size: [1, 1, 1], facing: 'n' })!;
  expect(r.inventory.entities.bash(target, DURABILITY / 2)).toBe('damaged');
  expect(r.inventory.add(r.inventory.create(STOCK, 2), { kind: 'pile', pos: [...ORIGIN] })).toBe(true);
  expect(r.commands.repairEntity(RECIPE, target.uid)).toBeUndefined();
  const held = target.work!;
  const inputs = held.work!.components.map((item) => snapshotItem(item));
  r.sim.scheduler.advance(held.work!.duration / r.sim.clock.ratio / 3);
  const { elapsed } = held.work!;
  expect(elapsed).toBeGreaterThan(0);
  r.position[0] += 100;
  r.sim.scheduler.advance(1);
  expect(r.sim.actions.job).toMatchObject({ stopped: true, workUid: held.uid });
  expect(target.work).toBe(held);
  expect(held.work!.components.map((item) => snapshotItem(item))).toEqual(inputs);
  expect(r.commands.act(held.uid, 'continue')).toBeDefined();
  r.position[0] = ORIGIN[0];
  expect(dispatch(r, { kind: 'inventory.work', itemUid: held.uid, operation: 'continue' })).toBeUndefined();
  expect(r.sim.actions.job).toMatchObject({ stopped: false, workUid: held.uid });
  expect(held.work!.elapsed).toBe(elapsed);
  r.sim.actions.stop();
  expect(r.commands.act(held.uid, 'continue')).toBeUndefined();
  expect(held.work!.elapsed).toBe(elapsed);
  expect(held.work!.components.map((item) => snapshotItem(item))).toEqual(inputs);
});

it('posts the craft completion owner refusal once', () => {
  const r = start();
  const reason = 'fixture completion refusal';
  const notices: string[] = [];
  r.sim.actions.notice = (text) => notices.push(text);
  // The defensive end-check cannot fail between synchronous live validation and finish in ordinary play.
  r.sim.actions.craft = {
    ...r.hooks,
    finish: (uid) => {
      r.hooks.cancel(uid);
      return reason;
    },
  };
  finish(r, r.work.uid);
  expect(notices).toEqual([reason]);
});

it.each(['active', 'paused'] as const)(
  'cancels %s entity repair mid-action without consuming inputs or repairing the piece',
  (state) => {
    const r = start();
    r.sim.scheduler.advance(r.work.work!.duration / r.sim.clock.ratio / 3);
    expect(r.work.work!.elapsed).toBeGreaterThan(0);
    expect(r.work.work!.elapsed).toBeLessThan(r.work.work!.duration);
    expect(r.work.work!.components.map((item) => snapshotItem(item)).sort((a, b) => a.uid - b.uid)).toEqual(r.exact);
    expect(r.target.damage).toBe(DURABILITY / 2);
    if (state === 'paused') {
      r.sim.actions.stop();
    }
    expect(r.sim.actions.job).toMatchObject({ workUid: r.work.uid, stopped: state === 'paused' });
    const { duration } = r.work.work!;
    expect(r.commands.act(r.work.uid, 'apart')).toBeUndefined();
    expect(returned(r)).toEqual(r.exact);
    expect(r.target.damage).toBe(DURABILITY / 2);
    expect(r.inventory.itemByUid(r.work.uid)).toBeUndefined();
    expect(r.sim.actions.job).toBeUndefined();
    r.sim.scheduler.advance(duration / r.sim.clock.ratio + 1);
    expect(returned(r)).toEqual(r.exact);
    expect(r.target.damage).toBe(DURABILITY / 2);
  },
);

const dispatch = (r: ReturnType<typeof make>, payload: ReplayActionPayload) => {
  const unused = (): never => {
    throw new Error('Unexpected replay owner');
  };
  return applyReplayActionPayload(payload, {
    inventory: r.inventory,
    queue: new HandlingQueue(r.inventory),
    quickbar: { assign: unused },
    craftRepairEntity: (recipe, uid, preference, sources) => r.commands.repairEntity(recipe, uid, preference, sources),
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
const intent = (uid: number): ReplayActionPayload => ({
  kind: 'craft.repair-entity',
  recipeId: RECIPE,
  entityUid: uid,
  preference: { 0: { kind: 'item', item: STOCK } },
});

it('projects the entity name, damage and requirements without owning inputs', () => {
  const r = prepare();
  const before = r.inventory.snapshotState();
  const projection = r.commands.previewEntityRepair(RECIPE, r.target.uid, { 0: { kind: 'item', item: STOCK } });
  expect(projection.targetName).toBe(registry.furniture.get(PIECE)!.name);
  expect(projection.targetName).not.toBe(registry.items.get(STOCK)!.name);
  expect(projection.damage).toBeDefined();
  expect(projection.requirements?.components[0]?.alternatives[0]?.available).toBeGreaterThanOrEqual(2);
  expect(projection.refusal).toBeUndefined();
  expect(r.inventory.snapshotState()).toEqual(before);
  expect(dispatch(r, intent(r.target.uid))).toBeUndefined();
  expect(workName(registry, r.target.work!)).toContain(projection.targetName);
});

it.each(['gone', 'reserved', 'out of reach'] as const)(
  'revalidates a selected target that became %s without spending or retargeting',
  (change) => {
    const r = prepare();
    const payload = intent(r.target.uid);
    expect(r.commands.previewEntityRepair(RECIPE, r.target.uid).refusal).toBeUndefined();
    if (change === 'gone') {
      r.inventory.entities.destroy(r.target);
    }
    if (change === 'reserved') {
      expect(r.commands.repairEntity(RECIPE, r.target.uid)).toBeUndefined();
      r.sim.actions.stop();
    }
    if (change === 'out of reach') {
      r.position[0] += 100;
    }
    const other = r.inventory.entities.add({
      type: PIECE,
      pos: [r.position[0] + 1, 1, 1],
      size: [1, 1, 1],
      facing: 'n',
    })!;
    r.inventory.entities.bash(other, DURABILITY / 2);
    const before = r.inventory.snapshotState();
    const projection = r.commands.previewEntityRepair(RECIPE, r.target.uid);
    expect(projection.refusal).toBeDefined();
    expect(dispatch(r, payload)).toBe(projection.refusal);
    expect(r.inventory.snapshotState()).toEqual(before);
  },
);

it('recorded repair intent keeps its selected UID and exact escrow instead of the first matching piece', async () => {
  const r = prepare();
  const selected = r.inventory.entities.add({ type: PIECE, pos: [1, 1, 1], size: [1, 1, 1], facing: 'n' })!;
  r.inventory.entities.bash(selected, DURABILITY / 2);
  const template = capture(createRuntime());
  const snapshot = { ...template, character: { ...template.character, inventory: r.inventory.snapshotState() } };
  const recorder = new InputReplayRecorder(snapshot);
  const command = intent(selected.uid);
  recorder.queueAction(command.kind, 'down', 'play', { payload: command });
  recorder.recordTick({
    active: true,
    inputLocked: false,
    intent: {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      walk: false,
      useDominant: false,
      useDominantHeld: false,
      useOff: false,
    },
    yaw: 0,
    pitch: 0,
    headYaw: 0,
    headPitch: 0,
    freeLooking: false,
    walking: false,
    descending: false,
    worldReady: true,
  });
  const decoded = await decodeInputReplay(
    await encodeInputReplay(snapshot, recorder.copyInputs(), formatWorldOptions, snapshot),
    { contentLookup: (kind, id) => contentLookup(registry, kind, id) },
  );
  const payload = decoded.inputs.actions[0]?.payload;
  if (!(payload && isReplayActionPayload(payload))) {
    throw new Error('Repair intent did not validate');
  }
  expect(payload).toEqual(command);
  const replay = make({
    inventory: decoded.snapshot.character.inventory,
    simulation: r.sim.snapshotState(),
    action: r.sim.actions.snapshotState(),
  });
  expect(dispatch(r, command)).toBeUndefined();
  expect(dispatch(replay, payload)).toBeUndefined();
  const work = replay.inventory.entities.byUid(selected.uid)!.work!;
  expect(work.work).toEqual(selected.work!.work);
  expect(work.work?.repairTarget).toEqual({ kind: 'entity', uid: selected.uid });
  expect(work.work?.components.map((item) => snapshotItem(item)).sort((a, b) => a.uid - b.uid)).toEqual(r.exact);
  finish(r, selected.work!.uid);
  finish(replay, work.uid);
  expect(replay.inventory.entities.conditionOf(replay.inventory.entities.byUid(selected.uid)!)).toBe(
    r.inventory.entities.conditionOf(selected),
  );
  expect(replay.inventory.entities.byUid(selected.uid)!.damage).toBe(DURABILITY / 2 - AMOUNT);
  expect(replay.inventory.entities.byUid(r.target.uid)!.damage).toBe(DURABILITY / 2);
});

it('rejects entity repair payloads without explicit preferences or a valid UID and with cached plans', () => {
  const payload = intent(1);
  expect(isReplayActionPayload(payload)).toBe(true);
  expect(isReplayActionPayload({ ...payload, entityUid: 0 })).toBe(false);
  expect(isReplayActionPayload({ ...payload, preference: undefined })).toBe(false);
  expect(isReplayActionPayload({ ...payload, preference: { 0: 7 } })).toBe(false);
  expect(isReplayActionPayload({ ...payload, plan: {} })).toBe(false);
});
