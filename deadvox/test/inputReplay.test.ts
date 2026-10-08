import { describe, expect, it } from 'vitest';
import { canonicalJsonBytes } from '../src/core/canonicalJson.ts';
import { dominantSide, practiceForNextLevel, SKILL_LEVEL_LEGENDARY } from '../src/core/character.ts';
import { defaultClock } from '../src/core/clock.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import type { Item } from '../src/core/items.ts';
import { pocketGroundItem, stowTarget, toHands } from '../src/core/options.ts';
import { encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import type { Site, ZombieSpawn } from '../src/core/site.ts';
import { gameTimeOfDay, realSeconds as realDuration } from '../src/core/time.ts';
import { BACKGROUND_ZOMBIE_SLICE_COUNT } from '../src/core/zombies.ts';
import { advanceLiveFrame } from '../src/game/frameDriver.ts';
import {
  DEFAULT_REPLAY_START_STATE,
  decodeInputReplay,
  encodeInputReplay,
  INPUT_REPLAY_MAX_BYTES,
  InputReplayRecorder,
  joinInputReplayWindows,
  type ReplayAction,
  type ReplayColumnUpdate,
  type ReplayControlSample,
  type ReplayGeneratedColumn,
  type ReplayInputData,
  type ReplayStartState,
  replayStateFingerprint,
  restoreReplayStartState,
  rolloverInputReplayRecorder,
  sampleFromReplayFrame,
  withReplayExportGuard,
} from '../src/game/inputReplay.ts';
import { openInventoryAtReplayStart, routeDominantUse, toggleWalking } from '../src/game/inputReplayActions.ts';
import { InputReplayDriver, nextReplayInputSample } from '../src/game/inputReplayDriver.ts';
import { InputReplayPlayer } from '../src/game/inputReplayPlayer.ts';
import { inputReplayStatus } from '../src/game/play.ts';
import { type ReloadBinding, ReloadInput, reloadTarget } from '../src/game/reloadInput.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayActionPayload,
} from '../src/game/replayCommands.ts';
import { PHYSICS_RATE } from '../src/game/session.ts';
import { rifleAmmunition } from './rifleFixture.ts';
import {
  addFixtureColumn,
  capture,
  contentLookup,
  createRuntime,
  fixtureColumns,
  fixtureHamlet,
  fixtureZombieColumn,
  formatVersion,
  formatWorldOptions,
  removeFixtureColumn,
} from './snapshotTestSupport.ts';

const INCOMPATIBLE_SAVE = /incompatible|version|identity/i;

const replaySample = {
  active: true,
  inputLocked: false,
  intent: {
    forward: 1,
    right: 0,
    jump: false,
    sprint: true,
    walk: false,
    useDominant: false,
    useDominantHeld: false,
    useOff: false,
  },
  yaw: 0.4,
  pitch: -0.2,
  walking: false,
  descending: false,
  worldReady: true,
} as const;

const encodeFixtureReplay = (startSave: Uint8Array, inputs: ReplayInputData): Uint8Array =>
  canonicalJsonBytes({
    magic: 'DEADVOX_REPLAY',
    schemaVersion: 14,
    startState: DEFAULT_REPLAY_START_STATE,
    endStateFingerprint: '0'.repeat(64),
    endSimTimestamp: 0,
    startSave: btoa(Array.from(startSave, (byte) => String.fromCharCode(byte)).join('')),
    frames: inputs.frames,
    actions: inputs.actions,
    generatedColumns: inputs.generatedColumns,
    columnChanges: inputs.columnChanges,
  });

const dispatchWalkToggle = (
  runtime: ReturnType<typeof createRuntime>,
  phase: 'down' | 'up',
  recorder?: InputReplayRecorder,
): void => {
  if (phase === 'down') {
    runtime.view.walk = toggleWalking(runtime.view.walk, recorder, 'play');
    runtime.view.intent.walk = runtime.view.walk;
  } else {
    recorder?.queueAction('movement.walk-toggle', phase, 'play');
  }
};

const applyCommand = (
  runtime: ReturnType<typeof createRuntime>,
  payload: ReplayActionPayload,
  throwItem?: (itemUid: number, hand: 'left' | 'right', distance: number) => void,
): string | undefined =>
  applyReplayActionPayload(payload, {
    inventory: runtime.inventory,
    queue: runtime.handling,
    quickbar: runtime.quickbar,
    search: (uid) => {
      const entity = runtime.entities.byUid(uid);
      return entity ? runtime.session.search(entity) : 'The container is no longer available';
    },
    work: (uid, operation) => runtime.session.crafting.act(uid, operation),
    toHands: (uid, feet) => {
      const item = runtime.inventory.itemByUid(uid);
      return item ? toHands(runtime.inventory, runtime.handling, item, feet) : 'The item is no longer available';
    },
    pickup: (uid, mode, feet) => {
      const item = runtime.inventory.itemByUid(uid);
      if (!item) {
        return 'The item is no longer available';
      }
      if (mode === 'wield') {
        return toHands(runtime.inventory, runtime.handling, item, feet);
      }
      return pocketGroundItem(runtime.inventory, runtime.handling, item);
    },
    interact: () => {
      throw new Error('Furniture interaction is not implemented in the replay test harness');
    },
    craftStart: (recipeId, preference) => runtime.session.crafting.start(recipeId, preference),
    craftContinue: () => {
      const uid = runtime.session.crafting.currentUid;
      return uid === undefined ? undefined : runtime.session.crafting.act(uid, 'continue');
    },
    craftStop: () => {
      runtime.sim.actions.stop();
    },
    cancelItemThrow: () => undefined,
    throwItem: (itemUid, hand, distance) => throwItem?.(itemUid, hand, distance),
  });

const applyColumnUpdates = (
  updates: readonly ReplayColumnUpdate[] | undefined,
  generatedColumns: Set<string>,
  recorder: InputReplayRecorder,
): void => {
  for (const [cx, cz, isGenerated] of updates ?? []) {
    const key = `${cx},${cz}`;
    if (isGenerated) {
      generatedColumns.add(key);
    } else {
      generatedColumns.delete(key);
    }
    recorder.queueColumnChange(cx, cz, isGenerated);
  }
};

const generatedColumnsReady = (generated: ReadonlySet<string>, x: number, z: number): boolean => {
  const cx = toChunk(Math.floor(x));
  const cz = toChunk(Math.floor(z));
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!generated.has(`${cx + dx},${cz + dz}`)) {
        return false;
      }
    }
  }
  return true;
};

const recordActiveSession = (
  start: Readonly<SaveSnapshot>,
  recorder: InputReplayRecorder,
  options: {
    ready?: (x: number, z: number) => boolean;
    columns?: {
      initial: readonly ReplayGeneratedColumn[];
      updatesAtTick: (tick: number) => readonly ReplayColumnUpdate[];
    };
    initialColumns?: readonly ReplayGeneratedColumn[];
    initialColumnSite?: Site;
    commands?: readonly { tick: number; context: 'inventory' | 'play'; payload: ReplayActionPayload }[];
    frameDts?: number[];
  } = {},
) => {
  const { ready, columns, commands = [], frameDts = [1 / 90, 1 / 60, 1 / 120] } = options;
  const pendingCommands: ReplayActionPayload[] = [];
  const generatedColumns = new Set(columns?.initial.map(([cx, cz]) => `${cx},${cz}`) ?? []);
  const source = createRuntime(
    start,
    false,
    options.initialColumns?.map(([cx, cz]) => [cx, cz] as [number, number]),
    {
      ...(ready ? { ready } : {}),
      ...(columns
        ? {
            zombieReady: (x, z) => generatedColumnsReady(generatedColumns, x, z),
          }
        : {}),
      sampleAtPlayerTick: (_tick, live, _time, compression) => {
        while (commands[nextCommand]?.tick === recorder.tickCount) {
          const { context, payload } = commands[nextCommand]!;
          nextCommand += 1;
          recorder.queueAction(payload.kind, 'down', context, { payload });
          pendingCommands.push(payload);
        }
        recorder.recordTick(live, compression);
        const updates = columns?.updatesAtTick(recorder.tickCount) ?? [];
        applyColumnUpdates(updates, generatedColumns, recorder);
        for (const [cx, cz, generated] of updates) {
          if (generated) {
            addFixtureColumn(source, cx, cz);
            source.session.onColumn(cx, cz, options.initialColumnSite ?? fixtureHamlet);
          } else {
            removeFixtureColumn(source, cx, cz);
            source.session.onColumnUnload(cx, cz);
          }
        }
        for (const payload of pendingCommands.splice(0)) {
          const reason = applyCommand(source, payload);
          if (reason) {
            throw new Error(`Source command ${payload.kind} refused: ${reason}`);
          }
        }
        return live;
      },
    },
  );
  for (const [cx, cz] of columns?.initial ?? []) {
    source.session.onColumn(cx, cz, options.initialColumnSite ?? fixtureHamlet);
  }
  source.sim.paused = false;
  source.view.intent.forward = 1;
  let sentDown = false;
  let sentUp = false;
  let nextCommand = 0;
  for (let frame = 0; recorder.tickCount < 96; frame += 1) {
    if (!sentDown && recorder.tickCount >= 12) {
      dispatchWalkToggle(source, 'down', recorder);
      sentDown = true;
    }
    if (!sentUp && recorder.tickCount >= 48) {
      dispatchWalkToggle(source, 'up', recorder);
      sentUp = true;
    }
    source.view.yaw += 0.007;
    source.view.pitch += 0.001;
    advanceLiveFrame(source.sim, realDuration(frameDts[frame % frameDts.length]!), undefined, (simDt, until) =>
      source.session.frame(simDt, until),
    );
    if (frame > 400) {
      throw new Error('Source session did not reach the recorded tick window');
    }
  }
  return source;
};

const dispatchReplayAction = (
  replay: ReturnType<typeof createRuntime>,
  action: ReplayAction,
  throwItem?: (
    runtime: ReturnType<typeof createRuntime>,
    itemUid: number,
    hand: 'left' | 'right',
    distance: number,
  ) => void,
): void => {
  if (action.payload) {
    const reason = applyCommand(replay, action.payload, (itemUid, hand, distance) =>
      throwItem?.(replay, itemUid, hand, distance),
    );
    if (reason) {
      throw new Error(`Replay command ${action.payload.kind} refused: ${reason}`);
    }
  } else if (action.action.startsWith('firearm.')) {
    reloadGesture(replay, action.action);
  } else {
    dispatchWalkToggle(replay, action.phase);
  }
};

const replayInputSample = (replay: ReturnType<typeof createRuntime>, player: InputReplayPlayer): ReplayControlSample =>
  nextReplayInputSample(player, replay.sim.compression, replay.view).input;

const playSession = (
  start: Readonly<SaveSnapshot>,
  inputs: ReplayInputData,
  options: {
    endSimTimestamp?: number;
    startState?: ReplayStartState;
    initialColumns?: readonly ReplayGeneratedColumn[];
    initialColumnSite?: Site;
    onCreated?: (runtime: ReturnType<typeof createRuntime>) => void;
    throwItem?: (
      runtime: ReturnType<typeof createRuntime>,
      itemUid: number,
      hand: 'left' | 'right',
      distance: number,
    ) => void;
  } = {},
) => {
  const startState = restoreReplayStartState(options.startState);
  let replay!: ReturnType<typeof createRuntime>;
  const player = new InputReplayPlayer(inputs, (action) => dispatchReplayAction(replay, action, options.throwItem));
  replay = createRuntime(
    start,
    false,
    options.initialColumns?.map(([cx, cz]) => [cx, cz] as [number, number]),
    {
      zombieReady:
        inputs.generatedColumns.length > 0 || inputs.columnChanges.length > 0
          ? (x, z) => player.isReady(x, z)
          : () => true,
      sampleAtPlayerTick: () => replayInputSample(replay, player),
      readyHeld: () => startState.readyHeld,
      useDominant: () => {
        routeDominantUse(
          startState.throwingStance,
          () => {
            const held = replay.inventory.hands[dominantSide(replay.session.character)];
            if (held) {
              replay.inventory.move(held, { kind: 'pile', pos: replay.player.body.pos });
            }
          },
          () => undefined,
        );
      },
    },
  );
  const generatedColumns = new Set(replay.columns.map(([cx, cz]) => `${cx},${cz}`));
  const driver = new InputReplayDriver({
    player,
    terrain: {
      hasGeneratedColumn: (cx, cz) => generatedColumns.has(`${cx},${cz}`),
      generateForReplay: (cx, cz) => {
        const key = `${cx},${cz}`;
        if (!generatedColumns.has(key)) {
          addFixtureColumn(replay, cx, cz);
          generatedColumns.add(key);
        }
        return true;
      },
      unloadForReplay: (cx, cz) => {
        removeFixtureColumn(replay, cx, cz);
        generatedColumns.delete(`${cx},${cz}`);
      },
      isReady: () => true,
    },
    onColumnLoad: (cx, cz) => replay.session.onColumn(cx, cz, options.initialColumnSite ?? fixtureHamlet),
    onColumnUnload: (cx, cz) => replay.session.onColumnUnload(cx, cz),
    simulation: {
      currentSimSeconds: () => replay.sim.time,
      nextPlayerTickEnd: () => {
        const playerCursor = replay.sim.scheduler.snapshotState().systems.find(({ id }) => id === 'player')!;
        return playerCursor.done + replay.sim.scheduler.stepOf('player', replay.sim.compression.c);
      },
      compression: replay.sim.compression,
    },
    frameReplay: (realSeconds) => replay.session.frameReplay(realSeconds),
    playerPosition: () => replay.player.body.pos,
  });
  if (!driver.initializeColumns()) {
    throw new Error('Replay fixture could not generate its initial columns');
  }
  options.onCreated?.(replay);
  replay.sim.paused = false;
  for (let frame = 0; !player.finished; frame += 1) {
    const result = driver.advanceFrame(1 / 60);
    if (result.kind === 'unavailable') {
      throw new Error('Replay fixture became unavailable');
    }
    if (frame > inputs.frames.length + 24) {
      throw new Error('Replay session did not consume its recorded inputs');
    }
  }
  if (options.endSimTimestamp !== undefined) {
    driver.advanceEndRemainder(options.endSimTimestamp);
  }
  return replay;
};

const createCraftReplayFixture = () => {
  const runtime = createRuntime();
  const backpack = runtime.inventory.hands.right!;
  const flashlight = runtime.inventory.hands.left!;
  const worn = runtime.inventory.move(backpack, { kind: 'worn' });
  const stowed = runtime.inventory.move(flashlight, { kind: 'pocket', owner: backpack, pocket: 0 });
  if (!(worn.ok && stowed.ok)) {
    throw new Error('Replay fixture could not clear both hands for crafting');
  }
  const recipe = [...runtime.inventory.registry.recipes.values()].find(
    (candidate) =>
      candidate.kind !== 'repair' &&
      candidate.components.every((group) => group.length > 0) &&
      Object.entries(candidate.qualities).every(([quality, required]) =>
        [...runtime.inventory.registry.items.values()].some(
          (definition) => (definition.tool?.qualities?.[quality] ?? 0) >= required,
        ),
      ),
  );
  if (!recipe) {
    throw new Error('Replay fixture has no craft recipe whose requirements fit the shipped item definitions');
  }
  runtime.session.character.learnRecipes([recipe.id]);
  for (const [skill, required] of Object.entries(recipe.skills)) {
    while ((runtime.session.character.skills[skill] ?? 0) < required) {
      const level = runtime.session.character.skills[skill] ?? 0;
      runtime.session.character.awardPractice(skill, practiceForNextLevel(level), SKILL_LEVEL_LEGENDARY);
    }
  }
  for (const group of recipe.components) {
    const component = group[0]!;
    const item = runtime.inventory.create(component.item, component.count);
    if (!runtime.inventory.add(item, { kind: 'pocket', owner: backpack, pocket: 0 })) {
      throw new Error(`Replay fixture could not add ${component.item}`);
    }
  }
  const toolTypes = new Set(
    Object.entries(recipe.qualities).map(([quality, required]) => {
      const definition = [...runtime.inventory.registry.items.values()].find(
        (candidate) => (candidate.tool?.qualities?.[quality] ?? 0) >= required,
      );
      if (!definition) {
        throw new Error(`Replay fixture has no tool for ${quality}`);
      }
      return definition.id;
    }),
  );
  for (const type of toolTypes) {
    const item = runtime.inventory.create(type);
    if (!runtime.inventory.add(item, { kind: 'pocket', owner: backpack, pocket: 0 })) {
      throw new Error(`Replay fixture could not add tool ${type}`);
    }
  }
  return { runtime, recipe };
};

/** An R gesture as play applies it: through `reloadTarget`, the same routing as the play loop's reload binding. */
const reloadGesture = (runtime: ReturnType<typeof createRuntime>, action: string): void => {
  const target = reloadTarget(runtime.session.firearms, runtime.session.magazines);
  const act =
    target && { 'firearm.load': target.load, 'firearm.rack': target.rack, 'firearm.remove': target.remove }[action];
  const reason = act ? act(runtime.sim.time) : 'Nothing takes R';
  if (reason) {
    throw new Error(`${action} refused: ${reason}`);
  }
};

type ReloadStep =
  | { readonly gesture: 'firearm.load' | 'firearm.rack' | 'firearm.remove' }
  | { readonly payload: ReplayActionPayload };

/** Records each step at the first player tick its handling is free, then runs until the last one finishes. */
const recordReloadSteps = (start: Readonly<SaveSnapshot>, recorder: InputReplayRecorder, steps: ReloadStep[]) => {
  let next = 0;
  const source = createRuntime(start, false, undefined, {
    sampleAtPlayerTick: (_tick, live, _time, compression) => {
      const step = next < steps.length && !source.handling.busy ? steps[next] : undefined;
      if (step) {
        next += 1;
        if ('gesture' in step) {
          recorder.queueAction(step.gesture, 'down', 'play');
        } else {
          recorder.queueAction(step.payload.kind, 'down', 'play', { payload: step.payload });
        }
      }
      recorder.recordTick(live, compression);
      if (step && 'gesture' in step) {
        reloadGesture(source, step.gesture);
      } else if (step) {
        const reason = applyCommand(source, step.payload);
        if (reason) {
          throw new Error(`Source command ${step.payload.kind} refused: ${reason}`);
        }
      }
      return live;
    },
  });
  source.sim.paused = false;
  for (let frame = 0; next < steps.length || source.handling.busy; frame += 1) {
    source.session.frame(1 / 60);
    if (frame > 3000) {
      throw new Error('Reload steps did not finish');
    }
  }
  return source;
};

/**
 * Records `steps` as `recordReloadSteps` does, then R tapped and pressed again and held, driven through
 * `ReloadInput` as the play loop drives it, until the held `gun` has nothing left to rack out.
 */
const recordHeldRack = (
  start: Readonly<SaveSnapshot>,
  recorder: InputReplayRecorder,
  gun: number,
  steps: Extract<ReloadStep, { gesture: unknown }>[],
) => {
  let next = 0;
  let racking = false;
  const input = new ReloadInput();
  const busy = () => source.handling.busy || source.session.firearms.busy;
  const binding = (): ReloadBinding | undefined => {
    const target = reloadTarget(source.session.firearms, source.session.magazines);
    return (
      target && {
        uid: target.uid,
        busy,
        load: () => false,
        // As play's binding does: an admitted rack is recorded, then applied once the tick is recorded.
        rack: () => {
          recorder.queueAction('firearm.rack', 'down', 'play');
          racking = true;
          return true;
        },
        remove: () => undefined,
        ...(target.stillLoaded ? { stillLoaded: target.stillLoaded } : {}),
        cancelLoad: target.cancelLoad,
      }
    );
  };
  // R down, up, then down and held: each once handling is free, then the hold advances every tick.
  const presses = [
    (now: number) => input.keyDown(now, binding()),
    (now: number) => input.keyUp(now),
    (now: number) => input.keyDown(now, binding()),
  ];
  let pressed = 0;
  const pressR = (now: number) => {
    if (pressed === presses.length) {
      input.advance(now, binding());
    } else if (!busy()) {
      presses[pressed]!(now);
      pressed += 1;
    }
  };
  const source = createRuntime(start, false, undefined, {
    sampleAtPlayerTick: (_tick, live, _time, compression) => {
      const step = next < steps.length && !busy() ? steps[next] : undefined;
      if (step) {
        next += 1;
        recorder.queueAction(step.gesture, 'down', 'play');
      } else if (next === steps.length) {
        pressR(source.sim.time * 1000);
      }
      recorder.recordTick(live, compression);
      if (step) {
        reloadGesture(source, step.gesture);
      }
      if (racking) {
        racking = false;
        reloadGesture(source, 'firearm.rack');
      }
      return live;
    },
  });
  source.sim.paused = false;
  for (let frame = 0; pressed < presses.length || source.session.firearms.stillLoaded(gun) || busy(); frame += 1) {
    source.session.frame(1 / 60);
    if (frame > 6000) {
      throw new Error('The held rack did not empty the gun');
    }
  }
  return source;
};

/** The pump held in both hands, with loose shells packed in the worn backpack. */
const createPumpReplayFixture = (shells: number) => {
  const runtime = createRuntime();
  const { inventory } = runtime;
  const { registry: content } = inventory;
  const { calibre } = content.models.get(content.items.get('pump_shotgun')!.model!)!;
  const shell = [...content.items.keys()].sort().find((id) => content.items.get(id)!.ammo?.calibre === calibre)!;
  const pump = inventory.create('pump_shotgun');
  const feet = runtime.player.body.pos;
  const loose = inventory.create(shell, shells);
  const target = stowTarget(inventory, loose, feet);
  if (
    !(
      inventory.move(inventory.hands.right!, { kind: 'worn' }).ok &&
      inventory.move(inventory.hands.left!, { kind: 'pile', pos: feet }).ok &&
      target?.kind === 'pocket' &&
      inventory.add(loose, target) &&
      inventory.add(pump, { kind: 'hand', side: dominantSide(runtime.session.character) })
    )
  ) {
    throw new Error('Replay fixture could not pack the shells and hold the pump');
  }
  return { runtime, pump, shell };
};

const createRifleReplayFixture = () => {
  const runtime = createRuntime();
  const { inventory } = runtime;
  const backpack = inventory.hands.right!;
  const flashlight = inventory.hands.left!;
  const { magazine: magazineType, cartridge } = rifleAmmunition(inventory.registry, 'rifle_assault');
  const magazine = inventory.create(magazineType);
  const rifle = inventory.create('rifle_assault');
  const feet = runtime.player.body.pos;
  const stow = (item: Item): boolean => {
    const target = stowTarget(inventory, item, feet);
    return target?.kind === 'pocket' && inventory.add(item, target);
  };
  if (
    !(
      inventory.move(backpack, { kind: 'worn' }).ok &&
      inventory.move(flashlight, { kind: 'pile', pos: feet }).ok &&
      stow(inventory.create(cartridge, 2)) &&
      stow(rifle) &&
      inventory.add(magazine, { kind: 'hand', side: dominantSide(runtime.session.character) })
    )
  ) {
    throw new Error('Replay fixture could not pack the rifle, its cartridges and a held magazine');
  }
  return { runtime, magazine, rifle };
};

const REPLAY_EXPORT_OVERRIDE_MESSAGE = /debug firearm-handling overrides differ from content/;

describe('input replay', () => {
  it('reports the supplied stop reason instead of an idle recording', () => {
    const options = {
      replayPlayer: undefined,
      inputRecorder: undefined,
      previousRecorder: undefined,
      total: 0,
      verification: undefined,
      verificationTick: undefined,
    };
    const stoppedReason = 'test-owned stop reason';
    const status = inputReplayStatus({ ...options, stoppedReason });
    const idleStatus = inputReplayStatus(options);

    expect.soft(status).toContain(stoppedReason);
    expect.soft(status).not.toBe(idleStatus);
  });

  it('rejects a replay from another schema version', async () => {
    const start = capture(createRuntime());
    const recorder = new InputReplayRecorder(start);
    recorder.recordTick(replaySample);
    const current = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, start);
    const differentSchema = JSON.parse(new TextDecoder().decode(current)) as Record<string, unknown>;
    differentSchema.schemaVersion = Number(differentSchema.schemaVersion) - 1;

    await expect(decodeInputReplay(canonicalJsonBytes(differentSchema), { contentLookup })).rejects.toThrow(
      'Unsupported replay format',
    );
  });

  it('round-trips held-ready and open-inventory state at a replay segment start', async () => {
    const start = capture(createRuntime());
    const startState: ReplayStartState = {
      throwingStance: false,
      readyHeld: true,
      inventoryOpen: true,
    };
    const recorder = new InputReplayRecorder(start, undefined, [], { startState });
    recorder.recordTick(replaySample);
    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, start);
    const decoded = await decodeInputReplay(bytes, { contentLookup });

    let inventoryOpen = false;
    openInventoryAtReplayStart(decoded.startState.inventoryOpen, () => {
      inventoryOpen = true;
    });

    expect(decoded.startState).toEqual(startState);
    expect(inventoryOpen).toBe(true);
  });

  it('replays a held-ready stance at a standalone segment start', async () => {
    const initial = createRuntime();
    const backpack = initial.inventory.hands.right;
    if (!(backpack && initial.inventory.move(backpack, { kind: 'pile', pos: initial.player.body.pos }).ok)) {
      throw new Error('Could not clear a hand for the replay firearm');
    }
    const rifle = initial.inventory.create('rifle_assault');
    if (!initial.inventory.add(rifle, { kind: 'hand', side: 'right' })) {
      throw new Error('Could not hold the replay firearm');
    }
    const start = capture(initial);
    const startState: ReplayStartState = {
      throwingStance: false,
      readyHeld: true,
      inventoryOpen: false,
    };
    const recorder = new InputReplayRecorder(start, 1, [], { startState });
    const source = createRuntime(start, false, undefined, {
      readyHeld: () => true,
      sampleAtPlayerTick: (_tick, live, _time, compression) => {
        recorder.recordTick(live, compression);
        return live;
      },
    });
    source.sim.paused = false;
    source.view.intent.forward = 1;
    source.session.frame(1 / 60);
    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    const standaloneReplay = playSession(decoded.snapshot, decoded.inputs, {
      endSimTimestamp: decoded.endSimTimestamp,
      startState: decoded.startState,
    });

    expect(sourceEnd.character.player.firearmReadyWalking).toBe(true);
    expect(await replayStateFingerprint(capture(standaloneReplay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('constructs the replay session at the decoded recording snapshot position', async () => {
    const start = capture(createRuntime());
    const recorder = new InputReplayRecorder(start);
    recorder.recordTick(replaySample);
    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, start);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    const replay = createRuntime(decoded.snapshot);

    expect(replay.player.body.pos).toEqual(decoded.snapshot.character.player.body.pos);
  });

  it('joins adjacent recording windows and offsets semantic actions from the earlier start save', () => {
    const frame = (yaw: number) => [yaw, 0, 0, 0, 1, 1] as const;
    const action = (tick: number) => ({
      tick,
      action: 'movement.walk-toggle',
      phase: 'down' as const,
      context: 'play' as const,
    });
    const joined = joinInputReplayWindows(
      { frames: [frame(0.1)], actions: [action(0)], generatedColumns: [[1, 2]], columnChanges: [] },
      { frames: [frame(0.2)], actions: [action(0)], generatedColumns: [[3, 4]], columnChanges: [] },
    );
    expect(joined.frames).toEqual([frame(0.1), frame(0.2)]);
    expect(joined.actions.map(({ tick }) => tick)).toEqual([0, 1]);
    expect(joined.generatedColumns).toEqual([[1, 2]]);
    expect(joined.columnChanges).toEqual([
      [1, 1, 2, false],
      [1, 3, 4, true],
    ]);
  });

  it('replays a same-tick column load and unload in order, preserving its marker and furniture', async () => {
    const [cx, cz] = fixtureColumns.find(
      ([columnX, columnZ]) => fixtureHamlet.furnitureIn(columnX, columnZ).length > 0,
    )!;
    const marker: ZombieSpawn = {
      type: 'shambler',
      pos: [cx * CHUNK + 7.25, 1, cz * CHUNK + 7.25],
    };
    const site: Site = {
      surface: fixtureHamlet.surface,
      spawn: fixtureHamlet.spawn,
      stamp: (chunk) => fixtureHamlet.stamp(chunk),
      furnitureIn: (columnX, columnZ) => fixtureHamlet.furnitureIn(columnX, columnZ),
      zombiesIn: (columnX, columnZ) =>
        columnX === cx && columnZ === cz ? [marker] : fixtureHamlet.zombiesIn(columnX, columnZ),
      hordesIn: (columnX, columnZ) => fixtureHamlet.hordesIn(columnX, columnZ),
    };
    const initialColumns: ReplayGeneratedColumn[] = [[cx + 10, cz + 10]];
    const start = capture(
      createRuntime(
        undefined,
        false,
        initialColumns.map(([columnX, columnZ]) => [columnX, columnZ]),
      ),
    );
    const recorder = new InputReplayRecorder(start, undefined, initialColumns);
    const source = recordActiveSession(start, recorder, {
      columns: {
        initial: initialColumns,
        updatesAtTick: (tick) =>
          tick === 1
            ? [
                [cx, cz, true],
                [cx, cz, false],
              ]
            : [],
      },
      initialColumns,
      initialColumnSite: site,
      frameDts: [1 / 60],
    });
    const markerKey = `shambler:${marker.pos.join(',')}`;
    expect(source.spawner.snapshotState()).toContain(markerKey);
    expect(
      [...source.entities.all].some(
        (entity) => toChunk(Math.floor(entity.pos[0])) === cx && toChunk(Math.floor(entity.pos[2])) === cz,
      ),
    ).toBe(true);

    const sourceEnd = capture(source);
    const inputs = recorder.copyInputs();
    const bytes = await encodeInputReplay(start, inputs, formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    const replay = playSession(start, decoded.inputs, {
      endSimTimestamp: sourceEnd.character.simulation.time,
      initialColumns,
      initialColumnSite: site,
    });

    expect(replay.spawner.snapshotState()).toContain(markerKey);
    expect(
      [...replay.entities.all].some(
        (entity) => toChunk(Math.floor(entity.pos[0])) === cx && toChunk(Math.floor(entity.pos[2])) === cz,
      ),
    ).toBe(true);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('preserves ordered tick-zero column effects when joining recording windows', () => {
    const frame = [0, 0, 0, 0, 1, 1] as const;
    const joined = joinInputReplayWindows(
      { frames: [frame], actions: [], generatedColumns: [], columnChanges: [] },
      {
        frames: [frame],
        actions: [],
        generatedColumns: [],
        columnChanges: [
          [0, 7, -4, true],
          [0, 7, -4, false],
        ],
      },
    );

    expect(joined.columnChanges).toEqual([
      [1, 7, -4, true],
      [1, 7, -4, false],
    ]);
  });

  it('does not duplicate an explicit tick-zero load with a reconstructed window seam', () => {
    const frame = [0, 0, 0, 0, 1, 1] as const;
    const joined = joinInputReplayWindows(
      { frames: [frame], actions: [], generatedColumns: [], columnChanges: [] },
      {
        frames: [frame],
        actions: [],
        generatedColumns: [[7, -4]],
        columnChanges: [[0, 7, -4, true]],
      },
    );

    expect(joined.columnChanges).toEqual([[1, 7, -4, true]]);
  });

  it('prepares tick-zero generated columns when playback is constructed', () => {
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    const column: ReplayColumnUpdate = [7, -4, true];
    recorder.queueColumnChange(...column);
    recorder.recordTick(replaySample);
    const player = new InputReplayPlayer(recorder.copyInputs(), () => undefined);

    expect(player.generatedColumns()).toContainEqual([column[0], column[1]]);
    expect(player.takePreparedColumnChanges()).toEqual([[0, column[0], column[1], true]]);
  });

  it('applies a prepared column load before the changed tick runs its systems', () => {
    const initialColumns: ReplayGeneratedColumn[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dz !== 0) {
          initialColumns.push([dx, dz]);
        }
      }
    }
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>, undefined, initialColumns);
    recorder.recordTick(replaySample);
    recorder.queueColumnChange(0, 0, true);
    recorder.recordTick(replaySample);
    const player = new InputReplayPlayer(recorder.copyInputs(), () => undefined);
    const generated = new Set(initialColumns.map(([cx, cz]) => `${cx},${cz}`));
    const loaded = new Set<string>();
    const sim = { time: 0, compression: { c: 1, limits: { maxSimPerFrame: 1 } } };
    const driver = new InputReplayDriver({
      player,
      terrain: {
        hasGeneratedColumn: (cx, cz) => generated.has(`${cx},${cz}`),
        generateForReplay: (cx, cz) => {
          generated.add(`${cx},${cz}`);
          return true;
        },
        unloadForReplay: (cx, cz) => {
          generated.delete(`${cx},${cz}`);
        },
        isReady: () => true,
      },
      onColumnLoad: (cx, cz) => loaded.add(`${cx},${cz}`),
      onColumnUnload: (cx, cz) => loaded.delete(`${cx},${cz}`),
      simulation: {
        currentSimSeconds: () => sim.time,
        nextPlayerTickEnd: () => sim.time + 1 / 60,
        compression: sim.compression,
      },
      frameReplay: () => {
        if (player.tickCount === 1) {
          expect(generated.has('0,0')).toBe(true);
          expect(loaded.has('0,0')).toBe(true);
        }
        const sample = player.next();
        if (sample) {
          sim.time += 1 / 60;
        }
      },
      playerPosition: () => [0, 0, 0],
    });

    expect(driver.advanceFrame(1 / 60).kind).toBe('advanced');
    expect(player.isReady(0.5, 0.5)).toBe(true);
    expect(driver.advanceFrame(1 / 60).kind).toBe('finished');
    expect(player.tickCount).toBe(2);
  });

  it('ends a replay on the live player-tick cursor when the start phase exceeds the end phase', () => {
    const startTime = 0.015;
    const endTime = 0.018;
    const playerStep = 1 / PHYSICS_RATE;
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    recorder.recordTick(replaySample);
    const player = new InputReplayPlayer(recorder.copyInputs(), () => undefined);
    let simTime = startTime;
    let playerDone = 0;
    const driver = new InputReplayDriver({
      player,
      terrain: {
        hasGeneratedColumn: () => true,
        generateForReplay: () => true,
        unloadForReplay: () => undefined,
        isReady: () => true,
      },
      onColumnLoad: () => undefined,
      onColumnUnload: () => undefined,
      simulation: {
        currentSimSeconds: () => simTime,
        nextPlayerTickEnd: () => playerDone + playerStep,
        compression: { c: 1, limits: { maxSimPerFrame: 1 } },
      },
      frameReplay: (realSeconds) => {
        simTime += realSeconds;
        if (player.next()) {
          playerDone += playerStep;
        }
      },
      playerPosition: () => [0, 0, 0],
    });

    expect(driver.advanceFrame(playerStep).kind).toBe('finished');
    driver.advanceEndRemainder(endTime);

    expect(simTime).toBe(endTime);
    expect(playerDone).toBe(playerStep);
  });

  it('consumes replay compression and look in the shared player-tick step', () => {
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    recorder.recordTick(replaySample, 7);
    const player = new InputReplayPlayer(recorder.copyInputs(), () => undefined);
    const compression = { c: 1 };
    const look = { yaw: 0, pitch: 0 };

    const consumed = nextReplayInputSample(player, compression, look);

    expect(consumed.input.compression).toBe(7);
    expect(consumed.recordedSample?.compression).toBe(7);
    expect(compression.c).toBe(7);
    expect(look).toEqual({ yaw: replaySample.yaw, pitch: replaySample.pitch });
    expect(player.finished).toBe(true);
    const idle = nextReplayInputSample(player, compression, look);
    expect(idle.recordedSample).toBeUndefined();
    expect(idle.input).toMatchObject({ active: false, inputLocked: true, compression: 7 });
  });

  it('records whether the player column was ready at each player tick', () => {
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    recorder.recordTick({ ...replaySample, worldReady: true });
    recorder.recordTick({ ...replaySample, worldReady: false });
    const player = new InputReplayPlayer(recorder.copyInputs(), () => undefined);

    expect(player.next()?.worldReady).toBe(true);
    expect(player.next()?.worldReady).toBe(false);
  });

  it('reports replay unavailable when a recorded-ready player column is missing', () => {
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    recorder.recordTick(replaySample);
    const player = new InputReplayPlayer(recorder.copyInputs(), () => undefined);
    const runtime = createRuntime();
    const driver = new InputReplayDriver({
      player,
      terrain: {
        hasGeneratedColumn: () => false,
        generateForReplay: () => false,
        unloadForReplay: () => undefined,
        isReady: () => false,
      },
      onColumnLoad: () => undefined,
      onColumnUnload: () => undefined,
      simulation: {
        currentSimSeconds: () => runtime.sim.time,
        nextPlayerTickEnd: () => {
          const playerCursor = runtime.sim.scheduler.snapshotState().systems.find(({ id }) => id === 'player')!;
          return playerCursor.done + runtime.sim.scheduler.stepOf('player', runtime.sim.compression.c);
        },
        compression: runtime.sim.compression,
      },
      frameReplay: (realSeconds) => runtime.session.frameReplay(realSeconds),
      playerPosition: () => runtime.player.body.pos,
    });

    expect(driver.advanceFrame(1 / 60)).toEqual({ kind: 'unavailable', simSeconds: 0 });
    expect(player.tickCount).toBe(0);
  });

  it('replays a windowed marker from an initially generated column when its window opens', async () => {
    const [cx, cz] = fixtureZombieColumn;
    const initialColumns: ReplayGeneratedColumn[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        initialColumns.push([cx + dx, cz + dz]);
      }
    }
    const marker: ZombieSpawn = {
      type: 'shambler',
      pos: [cx * CHUNK + 7.25, 1, cz * CHUNK + 7.25],
      window: { fromGameTimeOfDay: gameTimeOfDay(defaultClock.start + 1) },
    };
    const site: Site = {
      surface: fixtureHamlet.surface,
      spawn: fixtureHamlet.spawn,
      stamp: (chunk) => fixtureHamlet.stamp(chunk),
      furnitureIn: (columnX, columnZ) => fixtureHamlet.furnitureIn(columnX, columnZ),
      zombiesIn: (columnX, columnZ) =>
        columnX === cx && columnZ === cz
          ? [...fixtureHamlet.zombiesIn(columnX, columnZ), marker]
          : fixtureHamlet.zombiesIn(columnX, columnZ),
      hordesIn: (columnX, columnZ) => fixtureHamlet.hordesIn(columnX, columnZ),
    };
    const loadedSource = createRuntime(
      undefined,
      false,
      initialColumns.map(([columnX, columnZ]) => [columnX, columnZ] as [number, number]),
    );
    for (const [columnX, columnZ] of initialColumns) {
      loadedSource.session.onColumn(columnX, columnZ, site);
    }
    const start = capture(loadedSource);
    const recorder = new InputReplayRecorder(start, undefined, initialColumns);
    const source = recordActiveSession(start, recorder, {
      columns: { initial: initialColumns, updatesAtTick: () => [] },
      initialColumns,
      initialColumnSite: site,
      frameDts: [1 / 60],
    });
    const markerKey = `shambler:${marker.pos.join(',')}`;
    expect(source.spawner.snapshotState()).toContain(markerKey);

    const inputs = recorder.copyInputs();
    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(start, inputs, formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    const replay = playSession(start, decoded.inputs, {
      endSimTimestamp: sourceEnd.character.simulation.time,
      initialColumns,
      initialColumnSite: site,
    });

    expect(replay.spawner.snapshotState()).toContain(markerKey);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it("replays a recorded column load's spawn and furniture under compression", async () => {
    const runtime = createRuntime();
    const firstZombieEntry = runtime.zombies.store.entries().next().value;
    if (!firstZombieEntry) {
      throw new Error('Replay fixture has no zombie');
    }
    const [zombieId, firstZombie] = firstZombieEntry;
    const restRefusal = runtime.sim.actions.startRest('sleep', -10, 1);
    if (restRefusal) {
      throw new Error(`Replay fixture could not start compression: ${restRefusal}`);
    }
    const start = capture(runtime);
    const cx = toChunk(Math.floor(firstZombie.body.pos[0]));
    const cz = toChunk(Math.floor(firstZombie.body.pos[2]));
    const targetTick = BACKGROUND_ZOMBIE_SLICE_COUNT + (zombieId % BACKGROUND_ZOMBIE_SLICE_COUNT);
    const generatedAroundZombie: ReplayColumnUpdate[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        generatedAroundZombie.push([cx + dx, cz + dz, true]);
      }
    }
    const spawnColumn = generatedAroundZombie.find(
      ([columnX, columnZ]) =>
        (columnX !== cx || columnZ !== cz) && fixtureHamlet.zombiesIn(columnX, columnZ).length > 0,
    );
    const furnitureColumn = generatedAroundZombie.find(
      ([columnX, columnZ]) =>
        (columnX !== cx || columnZ !== cz) && fixtureHamlet.furnitureIn(columnX, columnZ).length > 0,
    );
    expect(spawnColumn).toBeDefined();
    expect(furnitureColumn).toBeDefined();
    const recorder = new InputReplayRecorder(start);
    const source = recordActiveSession(start, recorder, {
      columns: {
        initial: [],
        updatesAtTick: (tick) => (tick === targetTick ? generatedAroundZombie : []),
      },
      initialColumns: [[cx + 10, cz + 10]],
      frameDts: [1 / 60],
    });
    expect(
      [...source.zombies.store.entries()].some(
        ([, zombie]) =>
          spawnColumn &&
          toChunk(Math.floor(zombie.body.pos[0])) === spawnColumn[0] &&
          toChunk(Math.floor(zombie.body.pos[2])) === spawnColumn[1],
      ),
    ).toBe(true);
    expect(
      [...source.entities.all].some(
        (entity) =>
          furnitureColumn &&
          toChunk(Math.floor(entity.pos[0])) === furnitureColumn[0] &&
          toChunk(Math.floor(entity.pos[2])) === furnitureColumn[1],
      ),
    ).toBe(true);
    const inputs = recorder.copyInputs();
    expect(inputs.columnChanges).toContainEqual([targetTick, cx, cz, true]);
    expect(inputs.frames[targetTick]?.[5]).toBeGreaterThan(1);
    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(start, inputs, formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    expect(decoded.inputs.columnChanges).toContainEqual([targetTick, cx, cz, true]);
    const replay = playSession(start, decoded.inputs, {
      endSimTimestamp: sourceEnd.character.simulation.time,
      initialColumns: [[cx + 10, cz + 10]],
      onCreated: (runtimeAtStart) => {
        expect([...runtimeAtStart.world.chunks.values()].some((chunk) => chunk.cx === cx && chunk.cz === cz)).toBe(
          false,
        );
      },
    });
    expect([...replay.world.chunks.values()].some((chunk) => chunk.cx === cx && chunk.cz === cz)).toBe(true);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('bounds the always-on recording window and retained buffers', () => {
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    while (!recorder.full) {
      recorder.recordTick(replaySample);
    }

    expect(recorder.tickCount).toBeGreaterThan(0);
    expect(recorder.retainedBufferBytes).toBeLessThanOrEqual(INPUT_REPLAY_MAX_BYTES);
  });

  it('round-trips the throw distance and exact held-item identity in replay', async () => {
    const runtime = createRuntime();
    const firearmType = [...runtime.inventory.registry.items.values()].find((def) => def.firearm)?.id;
    if (!firearmType) {
      throw new Error('Replay throw fixture needs a firearm');
    }
    const firearm = runtime.inventory.create(firearmType);
    const side = runtime.inventory.character.handedness;
    const primaryItem = runtime.inventory.hands[side];
    if (!(primaryItem && runtime.inventory.move(primaryItem, { kind: 'worn' }).ok)) {
      throw new Error('Could not clear the primary hand for the replay firearm');
    }
    if (!runtime.inventory.add(firearm, { kind: 'hand', side })) {
      throw new Error('Could not put the replay firearm in the primary hand');
    }
    const start = capture(runtime);
    const recorder = new InputReplayRecorder(start);
    recorder.queueAction('item.throw', 'down', 'play', {
      payload: {
        kind: 'item.throw',
        itemUid: firearm.uid,
        hand: side,
        distance: 2.5,
      },
    });
    recorder.recordTick(replaySample);
    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, start);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    expect(decoded.inputs.actions).toMatchObject([
      { action: 'item.throw', payload: { kind: 'item.throw', itemUid: firearm.uid, hand: side, distance: 2.5 } },
    ]);
    expect(decoded.snapshot.character.inventory.hands[side]).toMatchObject({ uid: firearm.uid, type: firearm.type });
  });

  it('validates replay pickup identities and gesture modes', () => {
    expect(isReplayActionPayload({ kind: 'inventory.assign', slot: 0, itemUid: 0 })).toBe(false);
    expect(isReplayActionPayload({ kind: 'inventory.assign', slot: 0, itemUid: 1 })).toBe(true);
    expect(isReplayActionPayload({ kind: 'item.pickup', itemUid: 0, mode: 'wield', feet: [0, 0, 0] })).toBe(false);
    expect(isReplayActionPayload({ kind: 'item.pickup', itemUid: 1, mode: 'pocket', feet: [0, 0, 0] })).toBe(true);
    expect(isReplayActionPayload({ kind: 'item.throw', itemUid: 1, hand: 'left', distance: 2 })).toBe(true);
    expect(isReplayActionPayload({ kind: 'item.throw', itemUid: 0, hand: 'left', distance: 2 })).toBe(false);
    expect(isReplayActionPayload({ kind: 'furniture.interact', entityUid: 1 })).toBe(true);
  });

  it('rejects an invalid inventory payload while decoding a replay', async () => {
    const start = capture(createRuntime());
    const artifact = await encodeInputReplay(
      start,
      {
        frames: [[0, 0, 0, 0, 1, 1]],
        actions: [
          {
            tick: 0,
            action: 'inventory.assign',
            phase: 'down',
            context: 'inventory',
            payload: { kind: 'inventory.assign', slot: 0, itemUid: 0 },
          },
        ],
        generatedColumns: [],
        columnChanges: [],
      },
      formatWorldOptions,
      start,
    );

    await expect(decodeInputReplay(artifact, { contentLookup })).rejects.toThrow(
      'Invalid or out-of-order replay action 0',
    );
  });

  it('records controls and dispatches semantic actions at their player tick in order', async () => {
    const runtime = createRuntime();
    const start: Readonly<SaveSnapshot> = capture(runtime);
    const recorder = new InputReplayRecorder(start);
    recorder.queueAction('movement.walk-toggle', 'down', 'play');
    recorder.recordTick(replaySample);
    recorder.queueAction('movement.walk-toggle', 'up', 'play');
    recorder.queueAction('world.interact', 'down', 'play');
    recorder.recordTick({ ...replaySample, yaw: 0.5, intent: { ...replaySample.intent, forward: 0 } });

    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, start);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    const seen: string[] = [];
    const player = new InputReplayPlayer(decoded.inputs, (action, sample) => {
      seen.push(`${action.phase}:${action.action}:${sample.yaw}`);
    });
    expect(player.next()).toMatchObject({ yaw: 0.4, intent: { forward: 1, sprint: true } });
    expect(player.next()).toMatchObject({ yaw: 0.5, intent: { forward: 0 } });
    expect(seen).toEqual(['down:movement.walk-toggle:0.4', 'up:movement.walk-toggle:0.5', 'down:world.interact:0.5']);
    expect(decoded.snapshot).toEqual(start);
  });

  it('round-trips throwing-stance toggle and drop actions in the replay stream', async () => {
    const start = capture(createRuntime());
    const recorder = new InputReplayRecorder(start);
    recorder.queueAction('throw.stance.toggle', 'down', 'play');
    recorder.queueAction('item.drop', 'down', 'play');
    recorder.recordTick(replaySample);

    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, start);
    const decoded = await decodeInputReplay(bytes, { contentLookup });

    expect(decoded.inputs.actions.map(({ action, phase, context }) => [action, phase, context])).toEqual([
      ['throw.stance.toggle', 'down', 'play'],
      ['item.drop', 'down', 'play'],
    ]);
  });

  it('replays recorded compression through the replay driver', async () => {
    const runtime = createRuntime();
    expect(runtime.sim.actions.startRest('sleep', -10, 1)).toBeUndefined();
    const start = capture(runtime);
    const recorder = new InputReplayRecorder(start);
    const source = recordActiveSession(start, recorder, { frameDts: [1 / 60] });
    const inputs = recorder.copyInputs();
    expect(inputs.frames.some((frame) => sampleFromReplayFrame(frame).compression > 1)).toBe(true);

    const sourceEnd = capture(source);
    const replay = playSession(start, inputs, { endSimTimestamp: sourceEnd.character.simulation.time });

    const finalSample = sampleFromReplayFrame(inputs.frames.at(-1)!);
    expect(replay.sim.compression.c).toBe(finalSample.compression);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('records active session movement and replays between-frame commands to the same state', async () => {
    const start = capture(createRuntime());
    const recorder = new InputReplayRecorder(start);
    const source = recordActiveSession(start, recorder);
    expect(recorder.tickCount).toBe(96);
    expect(source.player.body.pos).not.toEqual(start.character.player.body.pos);
    expect(source.view.walk).toBe(true);
    expect(recorder.copyInputs().actions.map(({ phase }) => phase)).toEqual(['down', 'up']);

    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    expect(decoded.endStateFingerprint).toBe(await replayStateFingerprint(sourceEnd));
    expect(decoded.endSimTimestamp).toBe(sourceEnd.character.simulation.time);
    expect(source.view.yaw).not.toBe(start.character.player.yaw);
    expect(source.view.pitch).not.toBe(start.character.player.pitch);
    const replay = playSession(start, decoded.inputs);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('replays UID-based inventory assignments to the same fingerprint', async () => {
    const runtime = createRuntime();
    const backpack = runtime.inventory.hands.right!;
    const beans = backpack.pockets?.[0]?.[0]?.item;
    if (!beans) {
      throw new Error('Replay fixture has no stable-UID inventory item');
    }
    const start = capture(runtime);
    const payloads = [
      {
        tick: 12,
        context: 'inventory' as const,
        payload: {
          kind: 'inventory.move' as const,
          itemUid: beans.uid,
          target: runtime.inventory.targetState({ kind: 'pile', pos: runtime.player.body.pos }),
          count: 1,
        },
      },
      {
        tick: 12,
        context: 'inventory' as const,
        payload: { kind: 'inventory.assign' as const, slot: 1, itemUid: beans.uid },
      },
    ];
    const recorder = new InputReplayRecorder(start);
    const source = recordActiveSession(start, recorder, { commands: payloads });
    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    expect(decoded.inputs.actions.flatMap(({ payload }) => (payload ? [payload] : []))).toEqual(
      payloads.map(({ payload }) => payload),
    );
    expect(source.quickbar.slots[1]).toBe(beans.uid);
    const replay = playSession(start, decoded.inputs, { endSimTimestamp: decoded.endSimTimestamp });
    expect(replay.inventory.itemByUid(beans.uid)?.uid).toBe(beans.uid);
    expect(replay.quickbar.slots[1]).toBe(beans.uid);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('replays craft start, stop and continue commands to the same fingerprint', async () => {
    const { runtime, recipe } = createCraftReplayFixture();
    const start = capture(runtime);
    const payloads = [
      { tick: 0, context: 'play' as const, payload: { kind: 'craft.start', recipeId: recipe.id } as const },
      { tick: 0, context: 'play' as const, payload: { kind: 'craft.stop' } as const },
      { tick: 0, context: 'play' as const, payload: { kind: 'craft.continue' } as const },
      { tick: 0, context: 'play' as const, payload: { kind: 'craft.stop' } as const },
    ];
    const recorder = new InputReplayRecorder(start);
    const source = recordActiveSession(start, recorder, { commands: payloads, frameDts: [1 / 60] });
    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    expect(decoded.inputs.actions.map(({ action }) => action).filter((action) => action.startsWith('craft.'))).toEqual([
      'craft.start',
      'craft.stop',
      'craft.continue',
      'craft.stop',
    ]);
    const replay = playSession(start, decoded.inputs, { endSimTimestamp: decoded.endSimTimestamp });
    expect(replay.session.crafting.currentUid).toBe(source.session.crafting.currentUid);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('replays R loading a magazine round by round, fitting it, charging and removing it to the same inventory and rifle', async () => {
    const { runtime, magazine, rifle } = createRifleReplayFixture();
    const start = capture(runtime);
    const recorder = new InputReplayRecorder(start);
    const source = recordReloadSteps(start, recorder, [
      { gesture: 'firearm.load' },
      { gesture: 'firearm.load' },
      { payload: { kind: 'inventory.to-hands', itemUid: rifle.uid, feet: [...runtime.player.body.pos] } },
      { gesture: 'firearm.load' },
      { gesture: 'firearm.rack' },
      { gesture: 'firearm.remove' },
    ]);
    const charged = (end: ReturnType<typeof createRuntime>) => {
      const held = end.inventory.itemByUid(rifle.uid)!;
      const removed = end.inventory.itemByUid(magazine.uid)!;
      return {
        fitted: held.slots?.magazine?.uid,
        chamber: held.firearm?.chamber,
        magazineAt: end.inventory.locate(removed)?.kind,
        left: removed.cartridges,
      };
    };
    expect(charged(source)).toEqual({
      fitted: undefined,
      chamber: 'round',
      magazineAt: 'pocket',
      left: [expect.any(String)],
    });

    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    const replay = playSession(start, decoded.inputs, { endSimTimestamp: decoded.endSimTimestamp });
    expect(charged(replay)).toEqual(charged(source));
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('replays a tap, then R held, racking the pump empty, to the same gun, ground and fingerprint', async () => {
    const loads = 3;
    const { runtime, pump, shell } = createPumpReplayFixture(loads);
    const start = capture(runtime);
    const recorder = new InputReplayRecorder(start);
    const load = { gesture: 'firearm.load' } as const;
    const source = recordHeldRack(start, recorder, pump.uid, [load, load, { gesture: 'firearm.rack' }, load]);
    const racked = (end: ReturnType<typeof createRuntime>) => ({
      gun: end.inventory.itemByUid(pump.uid)?.firearm,
      onGround: [...end.inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .reduce((sum, { item }) => sum + (item.type === shell ? item.count : 0), 0),
    });
    expect(racked(source)).toEqual({ gun: expect.objectContaining({ chamber: 'empty', tube: [] }), onGround: loads });

    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    // The rack that chambers the first shell, then one held rack per shell taken out.
    expect(decoded.inputs.actions.filter(({ action }) => action === 'firearm.rack')).toHaveLength(1 + loads);
    const replay = playSession(start, decoded.inputs, { endSimTimestamp: decoded.endSimTimestamp });
    expect(racked(replay)).toEqual(racked(source));
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('replays movement skips captured while the player column was unready', async () => {
    const start = capture(createRuntime());
    const recorder = new InputReplayRecorder(start);
    let readyTick = 0;
    const playerColumn = [toChunk(start.character.player.body.pos[0]), toChunk(start.character.player.body.pos[2])];
    const source = recordActiveSession(start, recorder, {
      ready: (x, z) => {
        if (toChunk(x) !== playerColumn[0] || toChunk(z) !== playerColumn[1]) {
          return true;
        }
        const tick = readyTick;
        readyTick += 1;
        return tick % 4 !== 0;
      },
    });
    source.session.frame(1 / 120);
    expect(recorder.tickCount).toBe(96);
    const inputs = recorder.copyInputs();
    expect(inputs.frames.some((frame) => !sampleFromReplayFrame(frame).worldReady)).toBe(true);
    const sourceEnd = capture(source);
    const replay = playSession(start, inputs, { endSimTimestamp: sourceEnd.character.simulation.time });

    expect(source.player.body.pos).not.toEqual(start.character.player.body.pos);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('rolls an overflowing column batch into the next replay segment', async () => {
    const initialColumn: [number, number] = [100, 100];
    const loadedColumn: [number, number] = [101, 100];
    const start = capture(createRuntime(undefined, false, [initialColumn]));
    let recorder = new InputReplayRecorder(start, 2, [initialColumn], { columnChangeEventLimit: 2 });
    const source = createRuntime(start, false, [initialColumn], {
      sampleAtPlayerTick: (_tick, live, _time, compression) => {
        recorder.recordTick(live, compression);
        return live;
      },
    });
    source.sim.paused = false;
    recorder.queueColumnChange(initialColumn[0], initialColumn[1], false);
    removeFixtureColumn(source, ...initialColumn);
    source.session.onColumnUnload(...initialColumn);
    source.session.frame(1 / 60);
    const previous = recorder.copyInputs();

    recorder.queueColumnChange(loadedColumn[0], loadedColumn[1], true);
    addFixtureColumn(source, ...loadedColumn);
    source.session.onColumn(loadedColumn[0], loadedColumn[1], fixtureHamlet);
    recorder.queueColumnChange(loadedColumn[0], loadedColumn[1], false);
    removeFixtureColumn(source, ...loadedColumn);
    source.session.onColumnUnload(...loadedColumn);
    expect(recorder.columnChangesWouldOverflow).toBe(true);

    recorder = rolloverInputReplayRecorder(recorder, capture(source), []);
    source.session.frame(1 / 60);
    const joined = joinInputReplayWindows(previous, recorder.copyInputs());
    expect(joined.columnChanges).toEqual([
      [0, initialColumn[0], initialColumn[1], false],
      [1, loadedColumn[0], loadedColumn[1], true],
      [1, loadedColumn[0], loadedColumn[1], false],
    ]);

    const sourceEnd = capture(source);
    const replay = playSession(start, joined, {
      endSimTimestamp: sourceEnd.character.simulation.time,
      initialColumns: [initialColumn],
    });
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('preserves ordered load and unload effects when action capacity rolls a window without a player tick', () => {
    const start = capture(createRuntime());
    const previous = new InputReplayRecorder(start, 2);
    previous.recordTick(replaySample);
    while (!previous.full) {
      previous.queueAction('movement.walk-toggle', 'down', 'play');
    }
    previous.queueColumnChange(7, -4, true);
    previous.queueColumnChange(7, -4, false);

    expect(previous.full).toBe(true);
    const next = rolloverInputReplayRecorder(previous, start);
    next.recordTick(replaySample);

    const joined = joinInputReplayWindows(previous.copyInputs(), next.copyInputs());
    expect(joined.columnChanges).toEqual([
      [1, 7, -4, true],
      [1, 7, -4, false],
    ]);
    const player = new InputReplayPlayer(joined, () => undefined);
    player.takePreparedColumnChanges();
    player.next();
    expect(player.takePreparedColumnChanges()).toEqual([
      [1, 7, -4, true],
      [1, 7, -4, false],
    ]);
  });

  it('keeps a toggle already in the rollover snapshot at the previous seam, so each segment verifies', async () => {
    const start = capture(createRuntime());
    const ticksPerWindow = 2;
    let recorder = new InputReplayRecorder(start, ticksPerWindow);
    let queuedAtBoundary = false;
    let source!: ReturnType<typeof createRuntime>;
    source = createRuntime(start, false, undefined, {
      sampleAtPlayerTick: (_tick, live, _time, compression) => {
        recorder.recordTick(live, compression);
        if (recorder.tickCount === ticksPerWindow && !queuedAtBoundary) {
          dispatchWalkToggle(source, 'down', recorder);
          queuedAtBoundary = true;
        }
        return live;
      },
    });
    source.sim.paused = false;
    source.view.intent.forward = 0;
    while (!recorder.full) {
      source.session.frame(1 / 30);
    }
    const previousRecorder = recorder;
    const nextStart = capture(source);
    recorder = rolloverInputReplayRecorder(previousRecorder, nextStart);
    while (recorder.tickCount < 2) {
      source.session.frame(1 / 30);
    }

    const current = recorder.copyInputs();
    const previous = previousRecorder.copyInputs();
    const inputs = joinInputReplayWindows(previous, current);
    const sourceEnd = capture(source);
    expect(previous.actions).toContainEqual({
      tick: ticksPerWindow,
      action: 'movement.walk-toggle',
      phase: 'down',
      context: 'play',
    });
    expect(current.actions).toEqual([]);
    const boundaryReplay = await encodeInputReplay(start, previous, formatWorldOptions, nextStart);
    const decodedBoundary = await decodeInputReplay(boundaryReplay, { contentLookup });
    expect(decodedBoundary.inputs.actions).toContainEqual({
      tick: ticksPerWindow,
      action: 'movement.walk-toggle',
      phase: 'down',
      context: 'play',
    });

    const previousReplay = playSession(start, previous, { endSimTimestamp: nextStart.character.simulation.time });
    expect(await replayStateFingerprint(capture(previousReplay))).toBe(await replayStateFingerprint(nextStart));
    const joinedReplay = playSession(start, inputs, { endSimTimestamp: sourceEnd.character.simulation.time });
    expect(await replayStateFingerprint(capture(joinedReplay))).toBe(await replayStateFingerprint(sourceEnd));
    const segmentReplay = playSession(nextStart, current, { endSimTimestamp: sourceEnd.character.simulation.time });
    expect(await replayStateFingerprint(capture(segmentReplay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('keeps actions outside the snapshot at tick zero of the next segment', () => {
    const start = capture(createRuntime());
    const previous = new InputReplayRecorder(start, 1);
    previous.recordTick(replaySample);
    const actions = ['aim.ads-toggle', 'throw.stance.toggle', 'stance.ready', 'ui.inventory-toggle'] as const;
    for (const action of actions) {
      previous.queueAction(action, 'down', 'play');
    }

    const next = rolloverInputReplayRecorder(previous, start);
    next.recordTick(replaySample);
    expect(next.copyInputs().actions.map(({ tick, action }) => [tick, action])).toEqual(
      actions.map((action) => [0, action]),
    );
  });

  it('preserves a payload on an action declared in the rollover snapshot', () => {
    const runtime = createRuntime();
    const hand = runtime.inventory.character.handedness;
    const heldItem = runtime.inventory.hands[hand];
    if (!heldItem) {
      throw new Error('Snapshot action fixture needs a held item');
    }
    const payload: ReplayActionPayload = {
      kind: 'item.throw',
      itemUid: heldItem.uid,
      hand,
      distance: 2.5,
    };
    const start = capture(runtime);
    const previous = new InputReplayRecorder(start, 1);
    previous.recordTick(replaySample);
    previous.queueAction('item.throw', 'down', 'play', { payload, inSnapshot: true });

    rolloverInputReplayRecorder(previous, start);
    expect(previous.copyInputs().actions).toEqual([
      { tick: 1, action: 'item.throw', phase: 'down', context: 'play', payload },
    ]);
  });

  it('replays a dominant use from a standalone segment whose start is in throwing stance', async () => {
    const initial = createRuntime();
    const start = capture(initial);
    const startState: ReplayStartState = {
      throwingStance: true,
      readyHeld: false,
      inventoryOpen: false,
    };
    const throwDominantItem = (runtime: ReturnType<typeof createRuntime>): void => {
      const held = runtime.inventory.hands[dominantSide(runtime.session.character)];
      if (held && !runtime.inventory.move(held, { kind: 'pile', pos: runtime.player.body.pos }).ok) {
        throw new Error('Could not throw the dominant held item');
      }
    };
    const previousRecorder = new InputReplayRecorder(start, 1);
    previousRecorder.recordTick(replaySample);
    previousRecorder.queueAction('throw.stance.toggle', 'down', 'play', { inSnapshot: true });
    const recorder = rolloverInputReplayRecorder(previousRecorder, start, [], { startState });
    const throwingStance = true;
    const source = createRuntime(start, false, undefined, {
      sampleAtPlayerTick: (_tick, live, _time, compression) => {
        const sampled = { ...live, intent: { ...live.intent, useDominant: true } };
        recorder.recordTick(sampled, compression);
        return sampled;
      },
      useDominant: () =>
        routeDominantUse(
          throwingStance,
          () => throwDominantItem(source),
          () => undefined,
        ),
    });
    source.sim.paused = false;
    source.view.intent.forward = 1;
    source.session.frame(1 / 60);
    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(start, recorder.copyInputs(), formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    const standaloneReplay = playSession(decoded.snapshot, decoded.inputs, {
      endSimTimestamp: decoded.endSimTimestamp,
      startState: decoded.startState,
    });

    expect(previousRecorder.copyInputs().actions).toContainEqual({
      tick: 1,
      action: 'throw.stance.toggle',
      phase: 'down',
      context: 'play',
    });
    expect(decoded.startState).toEqual(startState);
    expect(recorder.tickCount).toBeGreaterThan(0);
    expect(await replayStateFingerprint(capture(standaloneReplay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('rolls a deferred throw into the next segment, which verifies alone and joined', async () => {
    const start = capture(createRuntime());
    const ticksPerWindow = 1;
    let recorder = new InputReplayRecorder(start, ticksPerWindow);
    let pendingThrow: ReplayActionPayload | undefined;
    let source!: ReturnType<typeof createRuntime>;
    source = createRuntime(start, false, undefined, {
      sampleAtPlayerTick: (_tick, live, _time, compression) => {
        recorder.recordTick(live, compression);
        if (pendingThrow) {
          const reason = applyCommand(source, pendingThrow, (itemUid) => {
            const item = source.inventory.itemByUid(itemUid);
            if (!(item && source.inventory.consume(item))) {
              throw new Error('Replay throw fixture could not consume the held item');
            }
          });
          if (reason) {
            throw new Error(`Source throw refused: ${reason}`);
          }
          pendingThrow = undefined;
        }
        return live;
      },
    });
    source.sim.paused = false;
    while (recorder.tickCount < ticksPerWindow) {
      source.session.frame(1 / 30);
    }
    const side = source.inventory.character.handedness;
    const heldItem = source.inventory.hands[side];
    if (!heldItem) {
      throw new Error('Replay throw fixture needs a held item');
    }
    const payload: ReplayActionPayload = {
      kind: 'item.throw',
      itemUid: heldItem.uid,
      hand: side,
      distance: 2.5,
    };
    const previousRecorder = recorder;
    previousRecorder.queueAction(payload.kind, 'down', 'play', { payload });
    const nextStart = capture(source);
    recorder = rolloverInputReplayRecorder(previousRecorder, nextStart);
    pendingThrow = payload;
    while (recorder.tickCount < 1) {
      source.session.frame(1 / 30);
    }

    const sourceEnd = capture(source);
    const current = recorder.copyInputs();
    const previous = previousRecorder.copyInputs();
    expect(current.actions).toEqual([{ tick: 0, action: 'item.throw', phase: 'down', context: 'play', payload }]);
    const joined = joinInputReplayWindows(previous, current);
    const previousReplay = playSession(start, previous, { endSimTimestamp: nextStart.character.simulation.time });
    expect(await replayStateFingerprint(capture(previousReplay))).toBe(await replayStateFingerprint(nextStart));
    const discardThrownItem = (runtime: ReturnType<typeof createRuntime>, itemUid: number): void => {
      const item = runtime.inventory.itemByUid(itemUid);
      if (!(item && runtime.inventory.consume(item))) {
        throw new Error('Replay throw fixture could not consume the held item');
      }
    };
    const standaloneReplay = playSession(nextStart, current, {
      endSimTimestamp: sourceEnd.character.simulation.time,
      throwItem: (runtime, itemUid) => discardThrownItem(runtime, itemUid),
    });
    const joinedReplay = playSession(start, joined, {
      endSimTimestamp: sourceEnd.character.simulation.time,
      throwItem: (runtime, itemUid) => discardThrownItem(runtime, itemUid),
    });
    expect(await replayStateFingerprint(capture(standaloneReplay))).toBe(await replayStateFingerprint(sourceEnd));
    expect(await replayStateFingerprint(capture(joinedReplay))).toBe(await replayStateFingerprint(sourceEnd));
  });

  it('preserves end state when a multi-tick frame crosses the recording window seam', async () => {
    const start = capture(createRuntime());
    const ticksPerWindow = 121;
    let recorder = new InputReplayRecorder(start, ticksPerWindow);
    let previous: ReplayInputData | undefined;
    const source = createRuntime(start, false, undefined, {
      sampleAtPlayerTick: (_tick, live, _time, compression) => {
        recorder.recordTick(live, compression);
        return live;
      },
    });
    source.sim.paused = false;
    source.view.intent.forward = 1;
    for (let frame = 0; frame < 100; frame += 1) {
      source.session.frame(1 / 30);
      if (frame === 59) {
        dispatchWalkToggle(source, 'down', recorder);
      }
      if (recorder.full) {
        previous = recorder.copyInputs();
        recorder = new InputReplayRecorder(capture(source), ticksPerWindow);
      }
    }

    const inputs = joinInputReplayWindows(previous, recorder.copyInputs());
    const replay = playSession(start, inputs);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(capture(source)));
  });

  it('replay fingerprints preserve sub-tick and full-tick simulation-time differences', async () => {
    const baseline = capture(createRuntime());
    const subTick = structuredClone(baseline);
    subTick.character.simulation.time += 1 / (PHYSICS_RATE * 4);
    const nextTick = structuredClone(baseline);
    nextTick.character.simulation.time += 1 / PHYSICS_RATE;

    const baselineFingerprint = await replayStateFingerprint(baseline);
    expect(await replayStateFingerprint(subTick)).not.toBe(baselineFingerprint);
    expect(await replayStateFingerprint(nextTick)).not.toBe(baselineFingerprint);
  });

  it('replay export allows an unmodified held gun but refuses any per-type override', () => {
    const { session, inventory } = createRuntime();
    const backpack = inventory.hands.right!;
    const flashlight = inventory.hands.left!;
    expect(inventory.move(backpack, { kind: 'worn' }).ok).toBe(true);
    expect(inventory.move(flashlight, { kind: 'pocket', owner: backpack, pocket: 0 }).ok).toBe(true);
    const heldGun = inventory.create('pump_shotgun');
    expect(inventory.add(heldGun, { kind: 'hand', side: 'right' })).toBe(true);
    const content = session.firearmsSkillZeroHandling;
    let encoded = false;
    const exportReplay = () =>
      withReplayExportGuard(session.hasFirearmHandlingOverrides(), () => {
        encoded = true;
        return new Uint8Array([1]);
      });

    expect(session.hasFirearmHandlingOverrides()).toBe(false);
    expect(exportReplay()).toEqual(new Uint8Array([1]));
    encoded = false;
    const overridden = {
      ...content,
      singleShot: { ...content.singleShot, variance: content.singleShot.variance + 1 },
    };
    session.setFirearmsSkillZeroHandling(overridden);
    expect(session.hasFirearmHandlingOverrides()).toBe(true);
    expect(() => exportReplay()).toThrow(REPLAY_EXPORT_OVERRIDE_MESSAGE);
    const futureField = {
      ...content,
      singleShot: { ...content.singleShot, perGunFactor: 2 },
    } as typeof content;
    session.setFirearmsSkillZeroHandling(futureField);
    expect(session.hasFirearmHandlingOverrides()).toBe(true);
    expect(() => exportReplay()).toThrow(REPLAY_EXPORT_OVERRIDE_MESSAGE);
    expect(encoded).toBe(false);
    session.setFirearmsSkillZeroHandling(content);
    expect(session.hasFirearmHandlingOverrides()).toBe(true);
    expect(() => exportReplay()).toThrow(REPLAY_EXPORT_OVERRIDE_MESSAGE);

    const unheldRuntime = createRuntime();
    const unheldGun = unheldRuntime.inventory.create('rifle_ak');
    expect(unheldRuntime.inventory.add(unheldGun, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    const unheldContent = unheldRuntime.session.firearms.skillZeroHandlingFor(unheldGun.uid);
    expect(
      unheldRuntime.session.firearms.setSkillZeroHandlingFor(unheldGun.uid, {
        ...unheldContent,
        singleShot: { ...unheldContent.singleShot, variance: unheldContent.singleShot.variance + 1 },
      }),
    ).toBe(true);
    expect(unheldRuntime.session.hasFirearmHandlingOverrides()).toBe(true);
    let unheldEncoded = false;
    expect(() =>
      withReplayExportGuard(unheldRuntime.session.hasFirearmHandlingOverrides(), () => {
        unheldEncoded = true;
        return new Uint8Array([1]);
      }),
    ).toThrow(REPLAY_EXPORT_OVERRIDE_MESSAGE);
    expect(unheldEncoded).toBe(false);

    const flatRuntime = createRuntime(undefined, false, undefined, { wobbleFlatOverride: 0 });
    let flatEncoded = false;
    expect(flatRuntime.session.hasFirearmHandlingOverrides()).toBe(true);
    expect(() =>
      withReplayExportGuard(flatRuntime.session.hasFirearmHandlingOverrides(), () => {
        flatEncoded = true;
        return new Uint8Array([1]);
      }),
    ).toThrow(REPLAY_EXPORT_OVERRIDE_MESSAGE);
    expect(flatEncoded).toBe(false);
  });

  it('rejects a replay whose embedded start save has an incompatible simulation identity', async () => {
    const runtime = createRuntime();
    const start = capture(runtime);
    const incompatibleVersion = { ...formatVersion, simulationHash: 'b'.repeat(64) };
    const startSave = await encodeSave(start, {
      generation: 1,
      worldOptions: formatWorldOptions,
      version: incompatibleVersion,
    });
    const artifact = encodeFixtureReplay(startSave, {
      frames: [[0, 0, 0, 0, 1, 1]],
      actions: [],
      generatedColumns: [],
      columnChanges: [],
    });
    await expect(decodeInputReplay(artifact, { contentLookup })).rejects.toThrow(INCOMPATIBLE_SAVE);
  });
});
