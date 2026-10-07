import { describe, expect, it } from 'vitest';
import { canonicalJsonBytes } from '../src/core/canonicalJson.ts';
import { practiceForNextLevel, SKILL_LEVEL_LEGENDARY } from '../src/core/character.ts';
import { defaultClock } from '../src/core/clock.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import { toHands } from '../src/core/options.ts';
import { encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import type { Site, ZombieSpawn } from '../src/core/site.ts';
import { gameTimeOfDay, realSeconds } from '../src/core/time.ts';
import { BACKGROUND_ZOMBIE_SLICE_COUNT } from '../src/core/zombies.ts';
import { advanceLiveFrame } from '../src/game/frameDriver.ts';
import {
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
  replayStateFingerprint,
  sampleFromReplayFrame,
  withReplayExportGuard,
} from '../src/game/inputReplay.ts';
import { InputReplayDriver } from '../src/game/inputReplayDriver.ts';
import { applyReplayLook, InputReplayPlayer } from '../src/game/inputReplayPlayer.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayActionPayload,
} from '../src/game/replayCommands.ts';
import {
  addFixtureColumn,
  capture,
  contentLookup,
  createRuntime,
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
    schemaVersion: 7,
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
  recorder?.queueAction('movement.walk-toggle', phase, 'play');
  if (phase === 'down') {
    runtime.view.walk = !runtime.view.walk;
    runtime.view.intent.walk = runtime.view.walk;
  }
};

const applyCommand = (runtime: ReturnType<typeof createRuntime>, payload: ReplayActionPayload): string | undefined =>
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
    craftStart: (recipeId, preference) => runtime.session.crafting.start(recipeId, preference),
    craftContinue: () => {
      const uid = runtime.session.crafting.currentUid;
      return uid === undefined ? undefined : runtime.session.crafting.act(uid, 'continue');
    },
    craftStop: () => {
      runtime.sim.actions.stop();
    },
    cancelGlowstick: () => undefined,
  });

const applyColumnUpdates = (
  updates: readonly ReplayColumnUpdate[] | undefined,
  generatedColumns: Set<string>,
  pendingChanges: Map<string, ReplayColumnUpdate>,
): void => {
  for (const [cx, cz, isGenerated] of updates ?? []) {
    const key = `${cx},${cz}`;
    if (isGenerated) {
      generatedColumns.add(key);
    } else {
      generatedColumns.delete(key);
    }
    pendingChanges.set(key, [cx, cz, isGenerated]);
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
  const pendingColumnChanges = new Map<string, ReplayColumnUpdate>();
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
          recorder.queueAction(payload.kind, 'down', context, payload);
          pendingCommands.push(payload);
        }
        const columnChanges = [...pendingColumnChanges.values()];
        pendingColumnChanges.clear();
        recorder.recordTick(live, compression, columnChanges);
        const updates = columns?.updatesAtTick(recorder.tickCount) ?? [];
        applyColumnUpdates(updates, generatedColumns, pendingColumnChanges);
        for (const [cx, cz, generated] of updates) {
          if (generated) {
            addFixtureColumn(source, cx, cz);
            source.session.onColumn(cx, cz, fixtureHamlet);
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
    advanceLiveFrame(source.sim, realSeconds(frameDts[frame % frameDts.length]!), undefined, (simDt, until) =>
      source.session.frame(simDt, until),
    );
    if (frame > 400) {
      throw new Error('Source session did not reach the recorded tick window');
    }
  }
  return source;
};

const dispatchReplayAction = (replay: ReturnType<typeof createRuntime>, action: ReplayAction): void => {
  if (action.payload) {
    const reason = applyCommand(replay, action.payload);
    if (reason) {
      throw new Error(`Replay command ${action.payload.kind} refused: ${reason}`);
    }
  } else {
    dispatchWalkToggle(replay, action.phase);
  }
};

const replayInputSample = (
  replay: ReturnType<typeof createRuntime>,
  player: InputReplayPlayer,
): ReplayControlSample => {
  // Match play.ts, samplePlayerInput: consume each control sample before applying its recorded controls.
  const sample = player.next();
  if (sample) {
    replay.sim.compression.c = sample.compression;
    applyReplayLook(replay.view, sample);
    return sample;
  }
  return {
    active: false,
    inputLocked: true,
    intent: { forward: 0, right: 0, jump: false, sprint: false, walk: false, useDominant: false, useOff: false },
    yaw: replay.view.yaw,
    pitch: replay.view.pitch,
    walking: false,
    descending: false,
    worldReady: false,
    compression: replay.sim.compression.c,
  };
};

const playSession = (
  start: Readonly<SaveSnapshot>,
  inputs: ReplayInputData,
  options: {
    endSimTimestamp?: number;
    initialColumns?: readonly ReplayGeneratedColumn[];
    initialColumnSite?: Site;
    onCreated?: (runtime: ReturnType<typeof createRuntime>) => void;
  } = {},
) => {
  let replay!: ReturnType<typeof createRuntime>;
  const player = new InputReplayPlayer(inputs, (action) => dispatchReplayAction(replay, action));
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
      compression: replay.sim.compression,
    },
    frameReplay: (simSeconds) => replay.session.frameReplay(simSeconds),
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

const REPLAY_EXPORT_OVERRIDE_MESSAGE = /debug firearm-handling overrides differ from content/;

describe('input replay', () => {
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

  it('prepares tick-zero generated columns when playback is constructed', () => {
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    const column: ReplayColumnUpdate = [7, -4, true];
    recorder.recordTick(replaySample, 1, [column]);
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
    recorder.recordTick(replaySample, 1, [[0, 0, true]]);
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
      simulation: { currentSimSeconds: () => sim.time, compression: sim.compression },
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
        compression: runtime.sim.compression,
      },
      frameReplay: (simSeconds) => runtime.session.frameReplay(simSeconds),
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

  it('round-trips the resolved glowstick throw distance', async () => {
    const start = capture(createRuntime());
    const recorder = new InputReplayRecorder(start);
    recorder.queueAction('glowstick.throw', 'down', 'play', 2.5);
    recorder.recordTick(replaySample);
    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, start);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    expect(decoded.inputs.actions).toMatchObject([{ action: 'glowstick.throw', value: 2.5 }]);
  });

  it('rejects replay command payloads with invalid item identities', () => {
    expect(isReplayActionPayload({ kind: 'inventory.assign', slot: 0, itemUid: 0 })).toBe(false);
    expect(isReplayActionPayload({ kind: 'inventory.assign', slot: 0, itemUid: 1 })).toBe(true);
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

  it('refuses export when the session reports firearm-handling overrides', () => {
    const { session } = createRuntime();
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
    expect(session.hasFirearmHandlingOverrides()).toBe(false);
    expect(exportReplay()).toEqual(new Uint8Array([1]));
    expect(encoded).toBe(true);
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
