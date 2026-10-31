import { expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { snapshotItem } from '../src/core/items.ts';
import { bindReach } from '../src/core/reach.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { furnitureActionsFor } from '../src/game/furnitureActions.ts';
import { decodeInputReplay, encodeInputReplay, InputReplayRecorder } from '../src/game/inputReplay.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayActionPayload,
} from '../src/game/replayCommands.ts';
import { workName } from '../src/ui/craftReadout.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistryWith } from './baseRegistry.ts';
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
  const work = r.inventory.hands.right!;
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

it.each(['gone', 'out of reach', 'reserved', 'intact', 'carried', 'ruined'] as const)(
  're-admits a target that became %s and returns exact escrow on refused completion',
  (change) => {
    const r = start();
    if (change === 'gone') {
      r.inventory.entities.destroy(r.target);
      const replacement = r.inventory.entities.add({
        type: PIECE,
        pos: [...r.target.pos],
        size: [1, 1, 1],
        facing: 'n',
      })!;
      r.inventory.entities.bash(replacement, DURABILITY / 2);
      expect(replacement.uid).not.toBe(r.target.uid);
    }
    if (change === 'out of reach') {
      r.position[0] += 100;
    }
    if (change === 'reserved') {
      r.inventory.entities.reserve(r.target);
    }
    if (change === 'intact') {
      r.inventory.entities.repair(r.target, DURABILITY);
    }
    if (change === 'carried') {
      r.inventory.entities.lift(r.target);
    }
    if (change === 'ruined') {
      r.inventory.entities.bash(r.target, DURABILITY);
    }
    const before = r.inventory.entities.snapshotState();
    const reason = r.hooks.validate(r.work.uid);
    expect(reason).toBeDefined();
    expect(r.hooks.finish(r.work.uid)).toBe(reason);
    expect(r.inventory.entities.snapshotState()).toEqual(before);
    expect(returned(r)).toEqual(r.exact);
    expect(r.inventory.itemByUid(r.work.uid)).toBeUndefined();
    r.hooks.finish(r.work.uid);
    expect(returned(r)).toEqual(r.exact);
  },
);

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

it('live reach refusal keeps escrow and both Continue routes resume the named held work', () => {
  const r = start();
  r.sim.actions.stop();
  expect(r.inventory.move(r.work, { kind: 'pile', pos: [...ORIGIN] }).ok).toBe(true);
  const target = r.inventory.entities.add({ type: PIECE, pos: [1, 1, 1], size: [1, 1, 1], facing: 'n' })!;
  expect(r.inventory.entities.bash(target, DURABILITY / 2)).toBe('damaged');
  expect(r.inventory.add(r.inventory.create(STOCK, 2), { kind: 'pile', pos: [...ORIGIN] })).toBe(true);
  expect(r.commands.repairEntity(RECIPE, target.uid)).toBeUndefined();
  const held = r.inventory.hands.right!;
  const inputs = held.work!.components.map((item) => snapshotItem(item));
  r.sim.scheduler.advance(held.work!.duration / r.sim.clock.ratio / 3);
  const { elapsed } = held.work!;
  expect(elapsed).toBeGreaterThan(0);
  r.position[0] += 100;
  r.sim.scheduler.advance(1);
  expect(r.sim.actions.job).toMatchObject({ stopped: true, workUid: held.uid });
  expect(r.inventory.hands.right).toBe(held);
  expect(held.work!.components.map((item) => snapshotItem(item))).toEqual(inputs);
  expect(r.commands.act(held.uid, 'continue')).toBeDefined();
  r.position[0] = ORIGIN[0];
  const choices = furnitureActionsFor(r.inventory, target, 0.5, [RECIPE]);
  const choice = choices.find(({ id }) => id === 'continue');
  expect(choice?.workUid).toBe(held.uid);
  expect(furnitureActionsFor(r.inventory, r.target, 0.5, [RECIPE]).some(({ id }) => id === 'continue')).toBe(false);
  expect(dispatch(r, { kind: 'inventory.work', itemUid: choice!.workUid!, operation: 'continue' })).toBeUndefined();
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

it('cancels paused entity work returning exact input identities and condition without repair', () => {
  const r = start();
  r.sim.scheduler.advance(r.work.work!.duration / r.sim.clock.ratio / 3);
  r.sim.actions.stop();
  expect(r.commands.act(r.work.uid, 'apart')).toBeUndefined();
  expect(returned(r)).toEqual(r.exact);
  expect(r.target.damage).toBe(DURABILITY / 2);
  expect(r.inventory.itemByUid(r.work.uid)).toBeUndefined();
});

const dispatch = (r: ReturnType<typeof make>, payload: ReplayActionPayload) => {
  const unused = (): never => {
    throw new Error('Unexpected replay owner');
  };
  return applyReplayActionPayload(payload, {
    inventory: r.inventory,
    queue: new HandlingQueue(r.inventory),
    quickbar: { assign: unused },
    craftRepairEntity: (recipe, uid, preference, sources) => r.commands.repairEntity(recipe, uid, preference, sources),
    search: unused,
    work: (uid, operation) => r.commands.act(uid, operation),
    vehicleWork: unused,
    loadBattery: unused,
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
  expect(workName(registry, r.inventory.hands.right!)).toContain(projection.targetName);
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
      r.inventory.entities.reserve(r.target);
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
  const work = replay.inventory.hands.right!;
  expect(work.work).toEqual(r.inventory.hands.right!.work);
  expect(work.work?.repairTarget).toEqual({ kind: 'entity', uid: selected.uid });
  expect(work.work?.components.map((item) => snapshotItem(item)).sort((a, b) => a.uid - b.uid)).toEqual(r.exact);
  finish(r, r.inventory.hands.right!.uid);
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
