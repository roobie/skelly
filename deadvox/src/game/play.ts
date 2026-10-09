// Normal play: walk, look, loot, manage what you carry, eat, drink and light your way.
// The simulation core runs the clock, the player's physics, needs and the handling
// queue; Esc pauses it. When health runs out, the death screen offers a new world.

import { aimDirection, NEUTRAL_AIM } from '../core/aim.ts';
import type { BlockEntity } from '../core/blockEntities.ts';
import { dominantSide, offSide } from '../core/character.ts';
import { nextTimeOfDay, skipTarget } from '../core/clock.ts';
import { SKIP_COMPRESSION } from '../core/compression.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import type { WorkOperation } from '../core/craftCommands.ts';
import { crosshairTarget } from '../core/crosshairTarget.ts';
import { heldFirearmTransform, throwStanceWorldOffset } from '../core/heldPose.ts';
import { type InteractionTarget, pickInteractionTarget } from '../core/interactionPick.ts';
import type { HandSide, Inventory, Pile, Target } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { hasMetThrowMinimumHold, throwDistanceForItem, traceItemLanding } from '../core/itemThrow.ts';
import { chargeShare, offHandUse } from '../core/lights.ts';
import type { LongJob, RestKind } from '../core/longAction.ts';
import { doorOptions, doorPlan, pocketGroundItem, toHands } from '../core/options.ts';
import type { Body } from '../core/physics.ts';
import { pryPlan } from '../core/prying.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import { isForwardButton, PressDedupe } from '../core/sideButton.ts';
import type { SoundEmission } from '../core/soundPicker.ts';
import { type RealSeconds, type RealTimestamp, realSeconds as realDuration } from '../core/time.ts';
import { FISTS_MELEE, type MeleeWeapon, PLAYER_CHEST_METRES } from '../core/zombies.ts';
import { FrameTimes } from '../render/frameTimes.ts';
import { handlingRotation } from '../render/handlingTurn.ts';
import { renderMeleePose } from '../render/meleePose.ts';
import { createPlayView } from '../render/playView.ts';
import { renderAudioOptions } from '../ui/audioOptions.ts';
import { mountCraftPanel } from '../ui/craftController.ts';
import { newWorldQuery, showDeath } from '../ui/death.ts';
import { mountGameCursor } from '../ui/gameCursor.ts';
import {
  type HandlingPresentationSource,
  type TimedActionPresentation,
  quickbarKey,
  renderQuickbar,
  timedActionHandlingPresentation,
} from '../ui/hud.ts';
import {
  type HudOptionsState,
  hudVisibility,
  readHudOptions,
  renderHudOptions,
  writeHudOptions,
} from '../ui/hudOptions.ts';
import { InventoryScreen } from '../ui/inventoryScreen.ts';
import { mountMenuPointer } from '../ui/menuPointer.ts';
import { computeMenuState } from '../ui/menuState.ts';
import {
  type PlayStatus,
  playCrosshairFrame,
  playHudText,
  playInteractionText,
  playNeedsText,
  playPromptText,
  projectCrosshairScreenPosition,
  renderPlayHandling,
  renderPlayHud,
} from '../ui/playHud.ts';
import { playReadout } from '../ui/playReadout.ts';
import { primaryActionHint } from '../ui/primaryActionHint.ts';
import { mountReading } from '../ui/reading.ts';
import { renderRest } from '../ui/rest.ts';
import type { SaveController } from '../ui/saveController.ts';
import { GameAudio } from './audio.ts';
import {
  createRefusalPresenter,
  firearmShotEmission,
  handlingMoveCompleteCue,
  handlingMoveStartCue,
} from './audioPresentation.ts';
import type { DebugHooks, DebugModule, DebugRuntime, InputReplayStatusState } from './debugInterface.ts';
import { debugTargetRay } from './debugTargetRay.ts';
import { DOOR_ACTION } from './doorAction.ts';
import type { Engine } from './engine.ts';
import { firearmBoreRay, firearmBoreTarget } from './firearmAim.ts';
import { firearmHandlingFor } from './firearmHandling.ts';
import { FirearmTrigger } from './firearmTrigger.ts';
import { advanceLiveFrame, realNow, startRealFrames } from './frameDriver.ts';
import { adjustLookPitch, Input } from './input.ts';
import {
  type InputCancellationReason,
  type InputCommand,
  type InputContext,
  inventoryTabForAction,
  keyboardInput,
  labelForAction,
  shouldCancelInputForViewerFocus,
} from './inputBindings.ts';
import {
  encodeInputReplay,
  InputReplayRecorder,
  joinInputReplayWindows,
  type ReplayAction,
  type ReplayControlSample,
  type ReplayGeneratedColumn,
  type ReplayInputData,
  type ReplayStartState,
  replayStateFingerprint,
  rolloverInputReplayRecorder,
  stashInputReplay,
  withReplayExportGuard,
} from './inputReplay.ts';
import { createReplayPlayStateBinding, routeDominantUse, toggleWalking } from './inputReplayActions.ts';
import { InputReplayDriver, type InputReplayDriverPorts, nextReplayInputSample } from './inputReplayDriver.ts';
import { applyReplayLook, InputReplayPlayer } from './inputReplayPlayer.ts';
import { startingLoadout } from './loadout.ts';
import { resolvePlayerMeleeWeapon, shouldBlockFromEnGarde, shouldEnterMeleeReady, startPlayerMelee } from './melee.ts';
import { routeModalCommand } from './modalCommand.ts';
import type { MoveIntent } from './player.ts';
import { applyToHeldItem, PlayerTickActions } from './playerTickActions.ts';
import { PlaytestObserver } from './playtestObserver.ts';
import {
  createSnapshotHistory,
  loadMetrics,
  metricsExportJson,
  persistMetrics,
  SessionMetrics,
} from './playtestTools.ts';
import { PressHoldInput } from './pressHoldInput.ts';
import { ignitionTargetForHand, selectPrimaryAction } from './primaryAction.ts';
import { QUICKBAR_SLOTS } from './quickbar.ts';
import { QuickbarActions } from './quickbarActions.ts';
import { QuickbarInput } from './quickbarInput.ts';
import { RELOAD_GESTURE_MS, type ReloadBinding, reloadTarget } from './reloadInput.ts';
import { applyReplayActionPayload, type ReplayActionPayload, type ReplayCommandOwners } from './replayCommands.ts';
import { restKindForFurniture } from './rest.ts';
import { createSession, type PlayerInputSample } from './session.ts';
import { updateStartupHintLatch } from './startupHint.ts';
import { populateTestHouseRepairCorner } from './testHouse.ts';
import { Unpacking } from './unpacking.ts';
import { playerStartFromWorld } from './worldSetup.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STARTUP_MESH_RADIUS = 1;
const STARTUP_COLUMN_COUNT = (STARTUP_MESH_RADIUS * 2 + 1) ** 2;
/** Metres: how far away you can open a door or search a container you're looking at. */
export const USE_REACH = 2;
/** Sim seconds of slack for a debug time skip "reaching its target"; the clamped last frame lands within float error of it. */
const SKIP_SLACK = 1e-6;
const QUICKBAR_ACTION = /^quickbar\.(tap|hold)\.(\d+)$/;
const isGestureAction = (action: string): boolean =>
  action === 'firearm.reload' ||
  action === 'player.throw' ||
  action === 'world.interact' ||
  action.startsWith('quickbar.use.');

type InputReplayVerification = 'matched' | 'diverged' | 'unavailable' | undefined;
const INPUT_REPLAY_COLUMN_OVERFLOW_STOP_REASON =
  'a streamed-column batch exceeded the recording window; the recent replay was discarded';
const inputReplayStoppedStatus = (reason: string): string => `Recording stopped: ${reason}`;

interface InputReplayStatusOptions {
  readonly replayPlayer: InputReplayPlayer | undefined;
  readonly inputRecorder: InputReplayRecorder | undefined;
  readonly previousRecorder: InputReplayRecorder | undefined;
  readonly total: number;
  readonly verification: InputReplayVerification;
  readonly verificationTick: number | undefined;
  readonly stoppedReason?: string | undefined;
}

export const inputReplayStatus = ({
  replayPlayer,
  inputRecorder,
  previousRecorder,
  total,
  verification,
  verificationTick,
  stoppedReason,
}: InputReplayStatusOptions): string => {
  if (replayPlayer) {
    if (verification === 'matched') {
      return `Replay verified at ${verificationTick} ticks`;
    }
    if (verification === 'diverged') {
      return `Replay end state differs after ${verificationTick} ticks`;
    }
    if (verification === 'unavailable') {
      return `Replay could not be verified after ${verificationTick} ticks`;
    }
    return `Replay ${Math.min(replayPlayer.tickCount, total)} / ${total} ticks`;
  }
  if (inputRecorder) {
    const ticks = inputRecorder.tickCount + (previousRecorder?.tickCount ?? 0);
    const bytes = inputRecorder.retainedBufferBytes + (previousRecorder?.retainedBufferBytes ?? 0);
    return `Recording ${ticks} ticks · ${bytes} buffer bytes`;
  }
  if (stoppedReason) {
    return inputReplayStoppedStatus(stoppedReason);
  }
  return 'Recording starts when play begins';
};

const encodeRecentInputReplay = (
  recording: {
    readonly previousRecorder: InputReplayRecorder | undefined;
    readonly recorder: InputReplayRecorder | undefined;
    readonly stoppedReason: string | undefined;
  },
  worldOptions: { blockSize: number; site: string; storeys: number; density: number | null },
  endSnapshot: Readonly<SaveSnapshot>,
): Promise<Uint8Array> => {
  const { previousRecorder, recorder, stoppedReason } = recording;
  if (stoppedReason) {
    throw new Error(inputReplayStoppedStatus(stoppedReason));
  }
  if (!recorder) {
    throw new Error('Input recording has not started');
  }
  const inputs = joinInputReplayWindows(previousRecorder?.copyInputs(), recorder.copyInputs());
  return encodeInputReplay(
    previousRecorder?.startSnapshot ?? recorder.startSnapshot,
    inputs,
    worldOptions,
    endSnapshot,
  );
};

const createInputReplayPlayer = (
  inputs: ReplayInputData | undefined,
  dispatch: (action: ReplayAction, sample: ReplayControlSample) => void,
): InputReplayPlayer | undefined => {
  if (!inputs) {
    return undefined;
  }
  return new InputReplayPlayer(inputs, dispatch);
};

const createInputReplayRecorder = (
  replaying: boolean,
  snapshot: () => Readonly<SaveSnapshot>,
  generatedColumns: readonly ReplayGeneratedColumn[],
  startState: () => ReplayStartState,
): InputReplayRecorder | undefined => {
  if (replaying) {
    return undefined;
  }
  return new InputReplayRecorder(snapshot(), undefined, generatedColumns, { startState: startState() });
};

const createInputReplayDriver = (
  player: InputReplayPlayer | undefined,
  ports: Omit<InputReplayDriverPorts, 'player'>,
): InputReplayDriver | undefined => (player ? new InputReplayDriver({ ...ports, player }) : undefined);

const handlingPresentationFor = (
  job: Readonly<LongJob> | undefined,
  queue: HandlingPresentationSource,
  inventory: Inventory,
  throwCharge?: HandlingPresentationSource['throwCharge'],
): HandlingPresentationSource => {
  if (throwCharge) {
    return { jobs: [], throwCharge };
  }
  const stopLabel = labelForAction('handling.stop');
  if (!job || job.stopped) {
    return { ...queue, cancelLabel: queue.cancelLabel ?? `${stopLabel} cancels` };
  }
  let label: string;
  if (job.jobType === 'reading') {
    const book = inventory.itemByUid(job.bookUid);
    label = book ? `Reading ${inventory.name(book)}` : 'Reading';
  } else if (job.jobType === 'pry') {
    label = 'Prying padlock';
  } else if (job.jobType === 'treatment') {
    const item = inventory.itemByUid(job.itemUid);
    label = item ? `Treating ${inventory.name(item)}` : 'Treating wound';
  } else {
    return { ...queue, cancelLabel: queue.cancelLabel ?? `${stopLabel} cancels` };
  }
  const action: TimedActionPresentation = {
    kind: job.jobType,
    ...(job.jobType === 'reading' ? { ownerUid: job.bookUid } : {}),
    label,
    duration: job.duration,
    elapsed: job.elapsed,
    stopped: job.stopped,
  };
  return timedActionHandlingPresentation(action, stopLabel);
};

const createPlayRefusalPresenter = (
  registry: Engine['registry'],
  audio: GameAudio,
  showNotice: (text: string) => void,
) => {
  const nope = registry.sounds.get('player_nope');
  return createRefusalPresenter(
    showNotice,
    () => (nope ? audio.preview('player_nope', nope.variants[0]!) : false),
    nope?.minIntervalSimSeconds ?? 0,
  );
};

export interface StartPlayOptions {
  readonly handedness?: HandSide;
  readonly restore?: Readonly<SaveSnapshot>;
  readonly saveController?: SaveController;
  readonly replay?: {
    readonly inputs: ReplayInputData;
    readonly endStateFingerprint: string;
    readonly endSimTimestamp: number;
    readonly startState: ReplayStartState;
  };
}

const configureReplayStreaming = (streamer: Engine['streamer'], replay: StartPlayOptions['replay']): void => {
  if (replay) {
    streamer.setReplayControlled();
  }
};

export const startPlay = (
  engine: Engine,
  debugModule?: DebugModule,
  options: StartPlayOptions = {},
): { enter: () => void } => {
  const { config, registry, streamer, renderer, camera, meshes } = engine;
  const inputTarget = renderer?.domElement ?? $('view');
  const startupHint = $('startup-hint');
  const startupProgress = $('startup-hint-progress') as HTMLProgressElement;
  if (options.saveController) {
    streamer.onGenerationError = (error) => {
      if (!options.saveController?.refuseRestore(error)) {
        throw error;
      }
    };
  }
  configureReplayStreaming(streamer, options.replay);
  const { scale } = config;
  const s = scale.blockSize;

  const playerStart = playerStartFromWorld(engine, scale, config.debugStart, options.restore !== undefined);
  let debugTools: DebugRuntime | undefined;
  let replayPlayer: InputReplayPlayer | undefined;
  const shouldCancelForViewerFocus = (reason: InputCancellationReason): boolean =>
    shouldCancelInputForViewerFocus(reason, replayPlayer !== undefined);
  const input = new Input(
    inputTarget,
    () => !debugTools?.buildOn,
    () => shouldCancelForViewerFocus('window-blur'),
    () => replayPlayer === undefined,
  );
  input.yaw = playerStart.yaw;
  let performHandUse: (hand: 'right' | 'left') => void = () => undefined;
  const playerSenseTuning = registry.senses.get('player');
  if (!playerSenseTuning) {
    throw new Error('Missing player sense tuning');
  }
  const {
    throwMaxDistanceMetres,
    throwChargeSimSeconds,
    throwMinimumHoldSimSeconds,
    throwStanceDropHoldRealSeconds,
    throwArmSpeedMetresPerRealSecond,
    throwArmEnergyJoules,
  } = playerSenseTuning.light;
  const itemThrowTuning = {
    maximumDistanceMetres: throwMaxDistanceMetres,
    chargeSimSeconds: throwChargeSimSeconds,
    armSpeedMetresPerRealSecond: throwArmSpeedMetresPerRealSecond,
    armEnergyJoules: throwArmEnergyJoules,
  };
  let throwingStance = false;
  let itemThrowStartedAt: number | undefined;
  let itemThrowItemUid: number | undefined;
  let itemThrowHand: HandSide | undefined;
  const pendingPlayerTickActions = new PlayerTickActions();
  let interactionPressTarget: InteractionTarget | undefined;
  const audio = new GameAudio({
    registry,
    blockSize: s,
    isSolid: engine.isSolid,
    tuning: playerSenseTuning,
    report: (message) => {
      const errors = $('errors');
      errors.textContent = [errors.textContent, message].filter(Boolean).join('\n');
    },
  });
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  const playSessionSound = (sound: Readonly<SoundEmission>): void =>
    audio.play(sound, sound.position.map((v) => v * s) as Vec3);

  // ---- simulation ----

  let playtestObserver: PlaytestObserver | undefined;
  let debugLaserEnabled = true;
  const firearmTrigger = new FirearmTrigger();
  let inputRecorder: InputReplayRecorder | undefined;
  let previousInputRecorder: InputReplayRecorder | undefined;
  let inputReplayStoppedReason: string | undefined;
  let replaySample: ReplayControlSample | undefined;
  let dispatchReplayAction: (action: ReplayAction, sample: ReplayControlSample) => void = () => undefined;
  let replayVerification: 'matched' | 'diverged' | 'unavailable' | undefined;
  let replayVerificationTick: number | undefined;
  let replayVerificationStarted = false;
  replayPlayer = createInputReplayPlayer(options.replay?.inputs, (action, sample) =>
    dispatchReplayAction(action, sample),
  );
  const samplePlayerInput = (
    _tick: number,
    live: PlayerInputSample,
    _time: number,
    compressionAtTick: number,
  ): PlayerInputSample => {
    if (!replayPlayer) {
      if (inputRecorder && !inputRecorder.recordTick(live, compressionAtTick)) {
        stopInputRecordingForColumnOverflow();
      }
      pendingPlayerTickActions.applyAtNextTick();
      return live;
    }
    const replayInput = nextReplayInputSample(replayPlayer, sim.compression, input);
    replaySample = replayInput.recordedSample;
    return replayInput.input;
  };
  let automaticFireUid: number | undefined;
  const automaticFireWeapon = (): Item | undefined => {
    if (debugTools?.buildOn || queue.busy) {
      return undefined;
    }
    const action = selectPrimaryAction(inventory);
    if (throwingStance || action.kind !== 'firearm' || registry.items.get(action.item.type)?.firearm?.pump) {
      return undefined;
    }
    return action.item;
  };
  const updateAutomaticFireUid = (automaticItem: Item | undefined, pressed: boolean): void => {
    if (pressed) {
      automaticFireUid =
        automaticItem && isFirearmReady(automaticItem.uid) && !session.sprinting ? automaticItem.uid : undefined;
    }
  };
  const readyAutomaticWeapon = (automaticItem: Item | undefined): Item | undefined =>
    automaticItem && automaticItem.uid === automaticFireUid && isFirearmReady(automaticItem.uid) && !session.sprinting
      ? automaticItem
      : undefined;
  const advanceAutomaticTrigger = (time: number, pressed: boolean, triggerHeld: boolean, weapon?: Item): void => {
    const acceptedPress = pressed && weapon !== undefined;
    const deadlines = firearmTrigger.advance(
      time,
      triggerWeapon(weapon, acceptedPress),
      acceptedPress,
      triggerHeld && automaticFireUid !== undefined,
    );
    if (weapon) {
      for (const deadline of deadlines) {
        fireWeapon(weapon, deadline);
      }
    }
  };
  const handleHeldDominantUse = (time: number, pressed: boolean, triggerHeld: boolean): void => {
    const automaticItem = automaticFireWeapon();
    updateAutomaticFireUid(automaticItem, pressed);
    advanceAutomaticTrigger(time, pressed, triggerHeld, readyAutomaticWeapon(automaticItem));
    if (!triggerHeld) {
      automaticFireUid = undefined;
    }
  };
  let spectatorCameraEnabled = false;
  let spectatorCameraBody: Body | undefined;
  let spectatorBodyView: { readonly yaw: number; readonly pitch: number } | undefined;
  let perceptionLabelsEnabled = false;
  const session = createSession({
    registry,
    handedness: config.debugHandedness ?? options.handedness,
    world: engine.world,
    isSolid: engine.isSolid,
    isOpaque: engine.isOpaque,
    scale,
    seed: config.seed,
    wobbleFlatOverride: config.debugWobbleFlat,
    wobbleNoiseScaleOverride: config.debugWobbleNoiseScale,
    start: config.start,
    spawn: playerStart.position,
    entities: engine.entities,
    terrainFloor: (x, z) => engine.groundAt(x * s, z * s) / s,
    ...(options.restore ? { restore: options.restore } : {}),
    ready: (x, z) => streamer.isReady(x, z),
    zombieReady: (x, z) => replayPlayer?.isReady(x, z) ?? streamer.isReady(x, z),
    controls: {
      active: () => Boolean(options.replay) || (input.locked && !input.menuPointer),
      intent: (): MoveIntent =>
        spectatorCameraEnabled ? { forward: 0, right: 0, jump: false, sprint: false, walk: false } : input.intent(),
      sampleAtPlayerTick: samplePlayerInput,
      readyHeld: () => input.rightMouseHeld,
      blocking: () => shouldPlayerBlock(),
      consumeDominantUse: () => input.consumeDominantUse(),
      consumeOffUse: () => input.consumeOffUse(),
      consumeCrouchToggle: () => input.consumeCrouchToggle(),
      useDominant: () =>
        routeDominantUse(
          throwingStance,
          () => {
            if (!replayPlayer) {
              beginItemThrow();
            }
          },
          () => {
            // Build-mode canvas clicks belong exclusively to the block editor, not the held-item action.
            const action = selectPrimaryAction(inventory);
            if (
              !(
                debugTools?.buildOn ||
                (action.kind === 'firearm' && !registry.items.get(action.item.type)?.firearm?.pump)
              )
            ) {
              performHandUse(dominantSide(inventory.character));
            }
          },
        ),
      heldDominantUse: (time, pressed, triggerHeld) => {
        if (throwingStance) {
          if (!(replayPlayer || triggerHeld) && itemThrowItemUid !== undefined) {
            finishItemThrow();
          }
          return;
        }
        if (sim.body.actionRefusal) {
          firearmTrigger.advance(time, undefined, pressed, triggerHeld);
          if (pressed) {
            showRefusal(sim.body.actionRefusal, sim.time);
          }
          return;
        }
        handleHeldDominantUse(time, pressed, triggerHeld);
      },
      automaticFireHeld: () => {
        const weapon = automaticFireWeapon();
        return Boolean(
          (replaySample?.intent.useDominantHeld ?? input.dominantUseHeld) &&
            !sim.body.actionRefusal &&
            weapon &&
            automaticFireUid === weapon.uid &&
            isFirearmReady(weapon.uid) &&
            !session.sprinting,
        );
      },
      adjustPitch: (delta) => {
        if (!replaySample) {
          return input.adjustPitch(delta);
        }
        const adjusted = adjustLookPitch(replaySample.pitch, delta);
        replaySample = { ...replaySample, pitch: adjusted.pitch };
        applyReplayLook(input, replaySample);
        return adjusted.applied;
      },
      useOff: () => {
        if (!debugTools?.buildOn) {
          performHandUse(offSide(inventory.character));
        }
      },
      yaw: () => spectatorBodyView?.yaw ?? input.yaw,
      pitch: () => spectatorBodyView?.pitch ?? input.pitch,
      walking: () => input.walking,
      descending: () => keyboardInput.held('noclip.descend'),
    },
    // The session works in blocks; playback is in metres.
    audio: {
      play: playSessionSound,
      onMoveStart: (move, ownerLocation, position, time) => {
        const cue = handlingMoveStartCue(move, ownerLocation, position);
        if (cue) {
          session.playPlayerSound(cue.event, time);
        }
      },
      onMoveComplete: (move, time) => {
        const cue = handlingMoveCompleteCue(move);
        if (cue) {
          session.playWorldSound(cue.event, cue.position, time);
        }
      },
    },
    notice: (text) => showNotice(text),
    refusal: (text) => showRefusal(text, sim.time),
    onRead: (readable, bookUid) => reading.open(readable, bookUid),
    onHandlingOutcomes: (result) => playtestObserver?.handlingOutcomes(result),
    onFirearmEjection: (effect) => caseEffects.spawn(effect),
    onFirearmTrajectory: (trajectory) => view.impactEffects.fire(trajectory, config.debug && debugLaserEnabled),
    debug: () => debugTools,
    // Presentation only: what the simulation decided (a part severed, a zombie dead) drawn as debris and a
    // corpse. Only MobActorMeshes implements these; ZombieMeshes leaves them undefined.
    zombieEffects: {
      onSever: (id, zombie, part, hit) => zombieMeshes.zombieSevered?.(id, part, hit, zombie),
      onCarve: (id, zombie, cells, hit) => zombieMeshes.zombieCarved?.(id, zombie, cells, hit),
      onIncapacitated: (id, zombie) => zombieMeshes.zombieIncapacitated?.(id, zombie),
      onDeath: (id, zombie) => zombieMeshes.zombieDied?.(id, zombie, [...body.pos]),
      ...(config.debug ? { onMeleeResult: (result) => debugTools?.recordMeleeResult(result) } : {}),
      onMeleeContact: (impulse) => view.recoil(impulse),
    },
  });
  const {
    sim,
    inventory,
    entities,
    queue,
    firearms,
    magazines,
    aim,
    quickbar,
    survival,
    rest,
    body,
    feet,
    pileDistance,
    entityDistance,
    nameOf,
    search,
  } = session;
  const hasActiveFirearmInput = (): boolean =>
    replayPlayer ? replaySample?.active === true && !replaySample.inputLocked : input.locked && !input.menuPointer;
  const isFirearmReady = (uid: number): boolean =>
    input.rightMouseActionHeld && hasActiveFirearmInput() && !compression.locksInput && firearms.isReady(uid);
  const isAimingDownSights = (): boolean => {
    const action = selectPrimaryAction(inventory);
    return (
      input.aimingDownSights &&
      input.rightMouseActionHeld &&
      hasActiveFirearmInput() &&
      action.kind === 'firearm' &&
      isFirearmReady(action.item.uid) &&
      !session.sprinting
    );
  };
  input.setAimingDownSightsAllowed(() => {
    const action = selectPrimaryAction(inventory);
    return action.kind === 'firearm' && isFirearmReady(action.item.uid) && !session.sprinting;
  });
  const { compression } = sim;
  const unpacking = new Unpacking(inventory, queue, feet);
  if (session.restoredLook) {
    input.yaw = session.restoredLook.yaw;
    input.pitch = session.restoredLook.pitch;
    input.walking = session.restoredLook.walk;
  }
  let snapshotIds = {
    worldId: options.restore?.world.id ?? '',
    characterId: options.restore?.character.id ?? '',
  };
  const captureSnapshot = () => session.snapshot(snapshotIds);
  const snapshotHistory = createSnapshotHistory();
  if (!(options.saveController || options.restore)) {
    snapshotIds = { worldId: crypto.randomUUID(), characterId: crypto.randomUUID() };
  }
  const { zombies: zombieSystem, playerCombat, zombieStore } = session;
  if (!options.restore) {
    startingLoadout(inventory);
    populateTestHouseRepairCorner({
      inventory,
      registry,
      site: config.site,
      spawn: engine.spawn.pos,
      blockSize: s,
    });
  }
  // Furniture, with the loot rolled for it, arrives with its column.
  const applyColumnLoad = (cx: number, cz: number): void => {
    session.onColumn(cx, cz, engine.site);
    for (const { spec, loot } of engine.furnitureIn(cx, cz)) {
      inventory.furnish(spec, loot);
    }
  };
  const applyColumnUnload = (cx: number, cz: number): void => session.onColumnUnload(cx, cz);
  const replayDriver = createInputReplayDriver(replayPlayer, {
    terrain: streamer,
    onColumnLoad: applyColumnLoad,
    onColumnUnload: applyColumnUnload,
    simulation: {
      currentSimSeconds: () => sim.time,
      nextPlayerTickEnd: () => {
        const player = sim.scheduler.snapshotState().systems.find(({ id }) => id === 'player');
        if (!player) {
          throw new Error('Replay simulation has no player scheduler cursor');
        }
        return player.done + sim.scheduler.stepOf('player', sim.compression.c);
      },
      compression: sim.compression,
    },
    frameReplay: (realSeconds) => session.frameReplay(realSeconds),
    playerPosition: () => body.pos,
  });
  streamer.onColumn = (cx, cz) => {
    if (replayPlayer) {
      return;
    }
    applyColumnLoad(cx, cz);
    if (inputRecorder) {
      inputRecorder.queueColumnChange(cx, cz, true);
    }
  };
  streamer.onColumnUnload = (cx, cz) => {
    if (replayPlayer) {
      return;
    }
    applyColumnUnload(cx, cz);
    if (inputRecorder) {
      inputRecorder.queueColumnChange(cx, cz, false);
    }
  };
  const view = createPlayView(engine, inventory, (message) => {
    const box = $('errors');
    box.textContent = [box.textContent, message].filter(Boolean).join('\n');
  });
  const { weather, caseEffects, itemThrows, impactEffects, flashlight, zombieMeshes } = view;
  const damageEvents = sim.events.reader();

  // ---- UI ----

  const overlay = $('overlay');
  const gameCursor = mountGameCursor($('game-cursor-root'));
  const inventoryPanel = $('inventory');
  let stopReadingOnClose = () => undefined;
  const reading = mountReading($('reading'), () => syncMenuState(), () => stopReadingOnClose());
  const hud = $('hud');
  const hudOptions = readHudOptions();
  const drawHudOptions = () =>
    renderHudOptions($('hud-options'), hudOptions, (key, value) => {
      hudOptions[key] = value;
      writeHudOptions(hudOptions);
      drawHudOptions();
    });
  drawHudOptions();
  const prompt = $('prompt');
  const quickbarBox = $('quickbar');
  const handlingBox = $('handling');
  const restBox = $('rest');
  $('errors').textContent = [$('errors').textContent, engine.contentErrors].filter(Boolean).join('\n');
  renderAudioOptions($('audio-options'), audio.settings, (category, value) => audio.setVolume(category, value));

  /** A message that isn't an interruption, such as why a move was refused. */
  let notice = '';
  let noticeUntil = 0;
  const showNotice = (text: string) => {
    notice = text;
    noticeUntil = realNow() + 3000;
  };
  const showRefusal = createPlayRefusalPresenter(registry, audio, showNotice);

  const toggleRest = (kind: RestKind, entity: BlockEntity): void => {
    const already = rest.action?.kind === kind && rest.action.furnitureUid === entity.uid;
    if (compression.interruption !== undefined && !already) {
      return;
    }
    if (!already) {
      if (compression.locksInput) {
        return;
      }
      queue.cancel();
      if (kind === 'sleep') {
        options.saveController?.beforeSleep();
      }
    }
    const reason = rest.toggle(kind, entity.uid);
    if (reason) {
      showRefusal(`Can't ${kind}: ${reason}`, sim.time);
    }
  };

  // ---- furniture: searching and doors ----

  const toggleDoor = (entity: BlockEntity) => {
    if (entity.lock?.locked && entities.defOf(entity).door?.prying) {
      const plan = pryPlan(inventory, entity, undefined, session.character);
      if (!plan.ok) {
        showRefusal(plan.reason, sim.time);
        return;
      }
      queue.cancel();
      const reason = session.pryDoor(entity, plan.tool.uid);
      if (reason) {
        showRefusal(reason, sim.time);
      }
      return;
    }
    const option = doorOptions(inventory, entity)[0]!;
    if (!option.plan.ok) {
      showRefusal(option.plan.reason, sim.time);
      return;
    }
    queue.enqueueAction(DOOR_ACTION, `${option.label} the ${nameOf(entity)}`, option.plan.time, {
      entityUid: entity.uid,
      closing: option.operation === 'close',
    });
  };

  const activateKey = (item: Item) => {
    const entity = lookedAt();
    if (!(entity && entities.defOf(entity).door)) {
      return;
    }
    const lock = registry.items.get(item.type)?.key?.lock;
    if (lock === undefined) {
      return;
    }
    const operation = entity.lock?.locked ? 'unlock' : 'lock';
    const plan = doorPlan(inventory, entity, operation, [lock]);
    if (!plan.ok) {
      showRefusal(plan.reason, sim.time);
      return;
    }
    queue.enqueueAction(DOOR_ACTION, `${operation === 'lock' ? 'Lock' : 'Unlock'} the ${nameOf(entity)}`, plan.time, {
      entityUid: entity.uid,
      locked: operation === 'lock',
    });
  };

  const screen = new InventoryScreen(inventoryPanel, inventory, queue, {
    feet,
    reach: session.reach,
    nearby: () => session.reach().piles,
    distance: (pile: Pile) => pileDistance(pile.pos),
    containers: () => session.reach().furniture,
    entityDistance,
    dispatch: dispatchScreenCommand,

    searching: session.searching,
    notice: showNotice,
    refusal: (text) => showRefusal(text, sim.time),
    describe: (item) => [...survival.describe(item), ...firearms.describe(item), ...magazines.describe(item)],
    workOptions: (uid) => session.crafting.options(uid),
    character: () => session.character,
    body: () => sim.body.snapshotState(),
    needs: () => needsText(),
    actionRefusal: () => sim.body.actionRefusal,
    attachmentCandidates: (firearmUid, slotId) => session.firearmAttachments.candidates(firearmUid, slotId),
  });

  const craftPanel = mountCraftPanel($('crafting'), $('craft-status'), session, {
    notice: (text) => showRefusal(text, sim.time),
    dispatch: dispatchScreenCommand,
  });

  let revealZombies = false;
  const storedMetrics = (() => {
    try {
      return loadMetrics(config.seed, localStorage);
    } catch {
      // Storage can be disabled; metrics start fresh for this run.
      return null;
    }
  })();
  const metrics = new SessionMetrics(config.seed, storedMetrics);
  playtestObserver = new PlaytestObserver(metrics);
  const saveMetrics = (): void => {
    try {
      persistMetrics(metrics, localStorage);
    } catch {
      /* Storage can be disabled; gameplay remains available. */
    }
  };
  const exportMetrics = (): void => {
    const blob = new Blob([metricsExportJson(metrics)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `deadvox-metrics-seed-${config.seed}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const measureSnapshot = () => playtestObserver!.measureSnapshot(captureSnapshot, session);
  const openInventoryScreen = (): void => {
    screen.open();
  };
  const closeInventoryScreen = (): void => {
    screen.close();
  };
  const replayPlayState = createReplayPlayStateBinding({
    getThrowingStance: () => throwingStance,
    setThrowingStance: (value) => {
      throwingStance = value;
    },
    getReadyHeld: () => input.rightMouseHeld,
    setReadyHeld: (value) => {
      input.rightMouseHeld = value;
    },
    getAimingDownSights: () => input.aimingDownSights,
    setAimingDownSights: (value) => {
      input.aimingDownSights = value;
    },
    getInventoryOpen: () => screen.isOpen,
    setInventoryOpen: (value) => {
      if (value) {
        openInventoryScreen();
      } else {
        closeInventoryScreen();
      }
    },
  });
  const captureReplayStartState = (): ReplayStartState => replayPlayState.capture();

  const spawnItem = (type: string): string => {
    const item = inventory.create(type);
    return inventory.add(item, { kind: 'pile', pos: feet() })
      ? `${inventory.name(item)} is at your feet`
      : `No room for the ${inventory.name(item).toLowerCase()} in the pile at your feet`;
  };
  const importReplay = (bytes: Uint8Array): void => {
    stashInputReplay(bytes);
    const url = new URL(location.href);
    url.searchParams.delete('cam');
    url.searchParams.delete('freeze');
    url.searchParams.set('debug', '1');
    location.assign(url);
  };
  const inputReplayHooks: DebugHooks['inputReplay'] = {
    state: (): InputReplayStatusState => {
      if (!replayPlayer) {
        if (inputRecorder) {
          return 'recording';
        }
        return inputReplayStoppedReason ? 'stopped' : 'idle';
      }
      switch (replayVerification) {
        case 'matched':
          return 'verified';
        case 'diverged':
        case 'unavailable':
          return replayVerification;
        default:
          return 'playing';
      }
    },
    status: () =>
      inputReplayStatus({
        replayPlayer,
        inputRecorder,
        previousRecorder: previousInputRecorder,
        total: options.replay?.inputs.frames.length ?? 0,
        verification: replayVerification,
        verificationTick: replayVerificationTick,
        stoppedReason: inputReplayStoppedReason,
      }),
    export: () => {
      if (inputReplayStoppedReason) {
        throw new Error(inputReplayStoppedStatus(inputReplayStoppedReason));
      }
      return withReplayExportGuard(session.hasFirearmHandlingOverrides(), () =>
        encodeRecentInputReplay(
          {
            previousRecorder: previousInputRecorder,
            recorder: inputRecorder,
            stoppedReason: inputReplayStoppedReason,
          },
          {
            blockSize: s,
            site: config.site,
            storeys: config.storeys,
            density: config.density,
          },
          captureSnapshot(),
        ),
      );
    },
    import: importReplay,
  };
  debugTools = debugModule?.attachDebugTools({
    engine,
    weather,
    flashlight,
    body,
    inventory,
    character: session.character,
    newGame: options.restore === undefined,
    sim,
    input,
    debugModifierHeld: () => keyboardInput.held('debug.gate'),
    impactLaser: {
      enabled: () => debugLaserEnabled,
      toggle: () => {
        debugLaserEnabled = !debugLaserEnabled;
        if (!debugLaserEnabled) {
          impactEffects.update(0, false);
        }
      },
    },
    roll: () => view.cameraRoll,
    zombies: () => zombieSystem,
    spectatorCamera: {
      enabled: () => spectatorCameraEnabled,
      toggle: () => {
        spectatorCameraEnabled = !spectatorCameraEnabled;
        spectatorCameraBody = spectatorCameraEnabled
          ? { ...body, pos: [...eye()], vel: [0, 0, 0], onGround: false }
          : undefined;
        spectatorBodyView = spectatorCameraEnabled ? { yaw: input.yaw, pitch: input.pitch } : undefined;
      },
    },
    perceptionLabels: {
      enabled: () => perceptionLabelsEnabled,
      toggle: () => {
        perceptionLabelsEnabled = !perceptionLabelsEnabled;
      },
    },
    emitTestNoise: () =>
      !replayPlayer && session.playPlayerSound('player_hurt_light', sim.time, { sourceLabel: 'debug test noise' }),
    feet,
    showNotice,
    spawnItem,
    compress: () => compress(),
    skipGameHours: (hours) => skipGameHours(hours),
    setTimeOfDay: (hour, minute) => {
      const timeOfDay = hour * 3600 + minute * 60;
      sim.setDebugCalendarTime(nextTimeOfDay(sim.calendar, timeOfDay));
      options.saveController?.rearmAutosaveAfterTimeSeek();
    },
    revealZombies: (enabled) => {
      revealZombies = enabled;
    },
    measureSnapshot,
    exportMetrics,
    inputReplay: inputReplayHooks,
    firearmsSkillZeroHandling: () => session.firearmsSkillZeroHandling,
    firearmsSkillZeroTarget: () => session.firearmsSkillZeroTarget,
    setFirearmsSkillZeroHandling: (value) => session.setFirearmsSkillZeroHandling(value),
  });

  let started = options.restore !== undefined;
  let mainMenuOpen = !options.replay;
  let startupHintPending = !options.replay;
  let resumeRequested = false;
  const syncMenuState = (pointerLockChanged = false) => {
    const state = computeMenuState({
      started,
      mainMenuOpen,
      inventoryOpen: screen.isOpen,
      readingOpen: reading.isOpen,
      debugMenuOpen: debugTools?.menuOpen ?? false,
      pointerLocked: input.locked || Boolean(options.replay),
      dead: sim.dead !== undefined,
      pointerLockChanged,
      resumeRequested,
      ...(started || !options.saveController ? {} : { titleNewWorldLabel: options.saveController.titleNewWorldLabel }),
      titleActive: Boolean(options.saveController && !options.saveController.isEntered),
    });
    ({ started, mainMenuOpen } = state);
    if (pointerLockChanged || state.closeOtherMenus) {
      resumeRequested = false;
    }
    if (state.closeOtherMenus) {
      reading.close();
      closeInventoryScreen();
      debugTools?.closeMenus();
    }
    input.menuPointer = state.menuPointer;
    keyboardInput.sync();
    overlay.hidden = state.overlayHidden;
    if (options.saveController) {
      options.saveController.setGoLabel(state.goLabel);
    } else {
      $('go').textContent = state.goLabel;
    }
    return state;
  };
  const updateStartupHint = () => {
    if (options.replay || !started || mainMenuOpen || screen.isOpen || reading.isOpen || debugTools?.menuOpen) {
      startupHint.hidden = true;
      return;
    }
    const unmeshed = streamer.unmeshedColumns(body.pos[0], body.pos[2], STARTUP_MESH_RADIUS);
    startupProgress.max = STARTUP_COLUMN_COUNT;
    startupProgress.value = STARTUP_COLUMN_COUNT - unmeshed;
    const latch = updateStartupHintLatch(startupHintPending, unmeshed);
    startupHintPending = latch.pending;
    startupHint.hidden = !latch.visible;
  };
  const resume = () => {
    if (replayPlayer) {
      return;
    }
    resumeRequested = true;
    if (input.locked) {
      syncMenuState();
      resumeRequested = false;
    } else {
      input.lock();
    }
  };
  overlay.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : undefined;
    if (target?.closest('a')) {
      return;
    }
    if (target?.closest('#go') || target?.closest('#save-replace-confirm') || (!input.locked && target === overlay)) {
      resume();
    }
  });
  const menuPointer = mountMenuPointer({ input, canvas: inputTarget, cursor: gameCursor });
  inputTarget.addEventListener('click', () => {
    if (mainMenuOpen) {
      resume();
      return;
    }
    if (input.locked || screen.isOpen || reading.isOpen || debugTools?.menuOpen || sim.dead) {
      return;
    }
    resume();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!input.locked) {
      menuPointer.releaseCaptures();
    }
    syncMenuState(true);
  });
  document.addEventListener('pointerlockerror', () => {
    resumeRequested = false;
  });

  const compress = () => {
    queue.cancel();
    const result = sim.compress();
    if (!result.ok) {
      showRefusal(`Can't rest: ${result.reason}`, sim.time);
    }
  };

  /** Debug time skip: the simulation time it runs to, while one is running. */
  let skipUntil: number | undefined;
  /** Ends the skip exactly on target: snapping c to 1 keeps the ramp-down from running past it. */
  const endSkip = (): void => {
    skipUntil = undefined;
    sim.ignoreUnsafe = false;
    compression.stop();
    compression.snap();
  };

  /**
   * Debug: fast-forwards the real clock by `hours` game hours through the same compressed
   * stepping as rest (needs, scheduler and shamblers all run), ignoring danger. Another call
   * during a skip pushes the target out. It replaces a rest/sleep in progress.
   */
  const skipGameHours = (hours: number): void => {
    if (sim.actions.job?.jobType === 'pry') {
      sim.actions.stop();
    } else {
      rest.stop();
    }
    queue.cancel();
    skipUntil = skipTarget(sim.clock, skipUntil ?? sim.time, hours);
    sim.ignoreUnsafe = true;
    sim.compress(SKIP_COMPRESSION);
  };

  /** Ends the skip when it arrives, is interrupted, the player dies or the debug T key stops compression. */
  const updateSkip = (until: number): void => {
    const { interruption } = compression;
    if (interruption !== undefined) {
      showNotice(`Time skip stopped: ${interruption}`);
    }
    if (interruption !== undefined || sim.dead || !compression.active || until - sim.time <= SKIP_SLACK) {
      endSkip();
    }
  };

  const actOnWork = (uid: number, operation: WorkOperation): string | undefined => {
    const reason = session.crafting.act(uid, operation);
    if (!reason && operation === 'continue') {
      closeInventoryScreen();
      syncMenuState();
    }
    return reason;
  };

  const continueWork = (): boolean => {
    const workUid = session.crafting.currentUid;
    if (workUid === undefined) {
      return false;
    }
    const reason = actOnWork(workUid, 'continue');
    if (reason) {
      showRefusal(`Can't continue: ${reason}`, sim.time);
    }
    return true;
  };

  /** Continue a craft, rest/sleep, or the debug compression test. */
  const continueAction = (): void => {
    const refusal = sim.body.actionRefusal;
    if (refusal) {
      showRefusal(refusal, sim.time);
      return;
    }
    if (continueWork()) {
      return;
    }
    if (
      rest.action ||
      sim.actions.job?.jobType === 'reading' ||
      sim.actions.job?.jobType === 'pry' ||
      sim.actions.job?.jobType === 'treatment'
    ) {
      const reason = rest.action ? rest.resume() : sim.actions.resume();
      if (reason) {
        showRefusal(`Can't continue: ${reason}`, sim.time);
      }
    } else {
      compress();
    }
  };

  /** Stop the current long action without discarding owned progress. */
  const stopAction = (): void => {
    if (rest.action && !rest.canStop) {
      return;
    }
    if (
      sim.actions.job?.jobType === 'craft' ||
      sim.actions.job?.jobType === 'reading' ||
      sim.actions.job?.jobType === 'pry' ||
      sim.actions.job?.jobType === 'treatment'
    ) {
      sim.actions.stop();
    } else if (rest.action) {
      rest.stop();
    } else {
      compression.stop();
    }
  };
  stopReadingOnClose = () => {
    if (sim.actions.job?.jobType === 'reading' && !sim.actions.job.stopped) {
      sim.actions.stop();
    }
  };

  const replayCommandOwners: ReplayCommandOwners = {
    inventory,
    queue,
    quickbar,
    search: (uid) => {
      const entity = entities.byUid(uid);
      if (!entity) {
        return 'The container is no longer available';
      }
      playtestObserver?.beginSearch(entity, nameOf(entity));
      return search(entity);
    },
    work: actOnWork,
    fitAttachment: (firearmUid, slotId, attachmentUid) =>
      session.firearmAttachments.fit(firearmUid, slotId, attachmentUid),
    removeAttachment: (firearmUid, slotId) => session.firearmAttachments.remove(firearmUid, slotId),
    toHands: (uid, feetPosition) => {
      const item = inventory.itemByUid(uid);
      return item ? toHands(inventory, queue, item, feetPosition) : 'The item is no longer available';
    },
    pickup: pickupGroundItem,
    interact: interactFurniture,
    craftStart: (recipeId, preference) => session.crafting.start(recipeId, preference),
    craftContinue: () => {
      continueAction();
    },
    craftStop: () => {
      stopAction();
    },
    cancelItemThrow,
    throwItem: throwRecordedItem,
  };
  const applyScreenCommand = (payload: ReplayActionPayload): string | undefined => {
    const reason = applyReplayActionPayload(payload, replayCommandOwners);
    if (reason) {
      return reason;
    }
    if (payload.kind === 'inventory.assign') {
      const item = inventory.itemByUid(payload.itemUid);
      if (item) {
        showNotice(`${inventory.name(item)} on quickbar ${payload.slot + 1}`);
      }
    } else if (payload.kind === 'craft.start') {
      closeInventoryScreen();
      syncMenuState();
    }
    return undefined;
  };
  function dispatchScreenCommand(payload: ReplayActionPayload): string | undefined {
    if (replayPlayer) {
      return undefined;
    }
    if (!inputRecorder) {
      return applyScreenCommand(payload);
    }
    inputRecorder.queueAction(payload.kind, 'down', inputContext(), { payload });
    pendingPlayerTickActions.enqueue(() => {
      const reason = applyScreenCommand(payload);
      if (reason) {
        showRefusal(reason, sim.time);
      }
    });
    return undefined;
  }

  const timeKeys = (code: string): boolean => {
    if (compression.interruption === undefined) {
      return false;
    }
    if (code === 'compression.continue') {
      continueAction();
      return true;
    }
    if (code === 'handling.stop') {
      stopAction();
      return true;
    }
    return false;
  };

  const openInventory = (tab?: NonNullable<ReturnType<typeof inventoryTabForAction>>) => {
    quickbarInput.cancel();
    if (tab) {
      screen.openOnTab(tab);
    } else {
      openInventoryScreen();
    }
    mainMenuOpen = false;
    syncMenuState();
  };
  const toggleInventory = () => {
    if (screen.isOpen) {
      quickbarInput.cancel();
      closeInventoryScreen();
      syncMenuState();
    } else {
      openInventory();
    }
  };

  const quickbarActions = new QuickbarActions({
    inventory,
    queue,
    feet,
    survival,
    notice: (text) => showRefusal(text, sim.time),
  });
  const runQuickbarAction = (slot: number, held: boolean): void => {
    if (sim.body.actionRefusal) {
      showRefusal(sim.body.actionRefusal, sim.time);
      return;
    }
    const item = quickbar.resolve(slot, inventory);
    if (!item) {
      showRefusal(`Quickbar ${slot + 1} is empty`, sim.time);
      return;
    }
    if (held) {
      quickbarActions.hold(item);
    } else {
      quickbarActions.tap(item);
    }
  };
  const quickbarTap = (slot: number) => {
    if (!replayPlayer && inputRecorder) {
      inputRecorder.queueAction(`quickbar.tap.${slot + 1}`, 'down', inputContext());
      pendingPlayerTickActions.enqueue(() => runQuickbarAction(slot, false));
      return;
    }
    runQuickbarAction(slot, false);
  };
  const quickbarHold = (slot: number) => {
    if (!replayPlayer && inputRecorder) {
      inputRecorder.queueAction(`quickbar.hold.${slot + 1}`, 'down', inputContext());
      pendingPlayerTickActions.enqueue(() => runQuickbarAction(slot, true));
      return;
    }
    runQuickbarAction(slot, true);
  };
  const quickbarInput = new QuickbarInput({ tap: quickbarTap, hold: quickbarHold });
  const throwStanceInput = new PressHoldInput<string>({
    holdRealMs: () => throwStanceDropHoldRealSeconds * 1000,
    tap: () => toggleThrowingStance(),
    hold: () => dropHeldItemForThrowingStance(),
  });
  const interactInput = new PressHoldInput<string>({
    holdRealMs: () => RELOAD_GESTURE_MS.hold,
    tap: () => completeWorldInteraction('pocket'),
    hold: () => completeWorldInteraction('wield'),
  });
  const hintToggleInput = new PressHoldInput<string>({
    holdRealMs: (action) => keyboardInput.registry.binding(action)?.holdMs ?? 0,
    tap: () => undefined,
    hold: (action) => {
      if (action === 'hud.toggle-interaction-hints' && !sim.body.actionRefusal) {
        hudOptions.interaction = !hudOptions.interaction;
        writeHudOptions(hudOptions);
        drawHudOptions();
      }
    },
  });
  globalThis.addEventListener('blur', () => {
    quickbarInput.cancel();
    throwStanceInput.cancel();
    interactInput.cancel();
    interactionPressTarget = undefined;
    hintToggleInput.cancel();
  });

  /** Default-view R reloads, racks and removes; menus own their own bindings (including inventory rotation). */
  const reloadBinding = (): ReloadBinding | undefined => {
    if (
      !(input.locked || replayPlayer) ||
      (input.menuPointer && !replayPlayer) ||
      compression.locksInput ||
      sim.paused ||
      sim.dead ||
      sim.body.actionRefusal ||
      debugTools?.buildOn ||
      itemThrowStartedAt !== undefined
    ) {
      return;
    }
    // An admitted gesture is recorded; replay drives it back through this binding.
    const admit = (action: 'firearm.load' | 'firearm.rack' | 'firearm.remove', reason: string | undefined): boolean => {
      if (reason) {
        showRefusal(reason, sim.time);
      } else {
        inputRecorder?.queueAction(action, 'down', inputContext());
      }
      return reason === undefined;
    };
    const target = reloadTarget(firearms, magazines);
    if (!target) {
      return;
    }
    return {
      uid: target.uid,
      busy: () => queue.busy || firearms.busy,
      oneAction: target.oneAction,
      load: () => admit('firearm.load', target.load(sim.time)),
      rack: () => admit('firearm.rack', target.rack(sim.time)),
      remove: () => admit('firearm.remove', target.remove(sim.time)),
      ...(target.stillLoaded ? { stillLoaded: target.stillLoaded } : {}),
      cancelLoad: target.cancelLoad,
    };
  };

  const playContext = (): InputContext => {
    if (mainMenuOpen || sim.dead) {
      return 'menu';
    }
    if (reading.isOpen) {
      return 'reading';
    }
    if (screen.isOpen) {
      return 'inventory';
    }
    if (compression.interruption !== undefined) {
      return 'interrupted';
    }
    if (debugTools?.buildOn) {
      return 'build';
    }
    return debugTools?.noclip || spectatorCameraEnabled ? 'noclip' : 'play';
  };
  const inputContext = (): InputContext => {
    if (options.saveController && !options.saveController.isEntered) {
      return 'title';
    }
    if (debugTools?.spawnOpen) {
      return 'spawn';
    }
    if (debugTools?.menuOpen) {
      return 'debug-panel';
    }
    return playContext();
  };
  keyboardInput.context = () => ({ debug: config.debug, context: inputContext() });
  keyboardInput.cancelled = (preservePointer, reason) => {
    if (!shouldCancelForViewerFocus(reason ?? 'manual')) {
      return;
    }
    input.cancel(preservePointer);
    cancelItemThrow();
    throwStanceInput.cancel();
    quickbarInput.cancel();
    hintToggleInput.cancel();
  };
  keyboardInput.escape = () => reading.close();
  const inventoryTabCommand = (action: string): boolean => {
    const tab = inventoryTabForAction(action);
    if (!tab) {
      return false;
    }
    if (compression.locksInput) {
      return true;
    }
    openInventory(tab);
    return true;
  };
  const modalCommand = (action: string): boolean =>
    routeModalCommand(action, {
      toggleMainMenu: () => {
        mainMenuOpen = !mainMenuOpen;
        syncMenuState();
      },
      readingOpen: reading.isOpen,
      readingAction: (command) => reading.onAction(command),
      readingMovementAction: () => {
        if (reading.bookUid === undefined) {
          return false;
        }
        reading.close();
        return true;
      },
      toggleInventory: () => {
        if (!compression.locksInput) {
          toggleInventory();
        }
      },
      inventoryTabAction: inventoryTabCommand,
      screenOpen: screen.isOpen,
      screenAction: (command) => screen.onAction(command),
      mainMenuOpen,
      interruptionCommand: timeKeys,
    });
  const withUnlockedInput = (action: () => void): void => {
    if (!(replaySample?.inputLocked ?? compression.locksInput)) {
      action();
    }
  };
  const stopHandling = (): void => {
    input.reload.cancel();
    queue.cancel();
    if (sim.actions.job || rest.action || compression.active) {
      stopAction();
    }
  };
  const assignQuickbarIfUnlocked = (slot: number | undefined, at: number): void => {
    if (slot !== undefined && !compression.locksInput) {
      quickbarInput.keyDown(slot, at);
    }
  };
  const gameplayCommand = (action: string, at: number, slot: number | undefined): void => {
    switch (action) {
      case 'stance.ready':
        input.rightMouseHeld = true;
        break;
      case 'aim.ads-toggle':
        input.toggleAimingDownSights(replayPlayer !== undefined);
        break;
      case 'movement.walk-toggle':
        input.walking = toggleWalking(input.walking, replayPlayer ? undefined : inputRecorder, inputContext());
        break;
      case 'player.crouch-toggle':
        withUnlockedInput(() => input.requestCrouchToggle());
        break;
      case 'player.throw':
        withUnlockedInput(() => throwStanceInput.keyDown(action, at));
        break;
      case 'hand.use-off':
        if (!replayPlayer) {
          input.useOff();
        }
        break;
      case 'firearm.reload':
        input.reload.keyDown(at, reloadBinding());
        break;
      case 'world.interact':
        withUnlockedInput(() => {
          interactionPressTarget = interactionTargetAt();
          interactInput.keyDown(action, at);
        });
        break;
      case 'craft.continue':
        if (session.crafting.currentUid !== undefined) {
          dispatchScreenCommand({ kind: 'craft.continue' });
        }
        break;
      case 'handling.stop':
        stopHandling();
        break;
      default:
        break;
    }
    assignQuickbarIfUnlocked(slot, at);
  };
  const releaseCommand = (action: string, at: number, slot: number | undefined): void => {
    if (action === 'stance.ready') {
      input.rightMouseHeld = false;
      input.aimingDownSights = false;
    }
    if (action === 'firearm.reload') {
      input.reload.keyUp(at);
    }
    if (action === 'world.interact') {
      interactInput.keyUp(action, at);
      interactionPressTarget = undefined;
    }
    if (action === 'player.throw') {
      throwStanceInput.keyUp(action, at);
    }
    if (slot !== undefined) {
      quickbarInput.keyUp(slot, at);
    }
  };
  const quickbarSlotFor = (action: string): number | undefined =>
    action.startsWith('quickbar.use.') ? Number(action.slice('quickbar.use.'.length)) - 1 : undefined;
  const handleDebugCommand = (action: string): boolean => {
    if (!(action.startsWith('debug.') || action.startsWith('spawn.'))) {
      return false;
    }
    debugTools?.handleAction(action);
    syncMenuState();
    return true;
  };
  const handleHintCommand = (action: string, phase: InputCommand['phase'], at: number): boolean => {
    if (action !== 'hud.toggle-interaction-hints') {
      return false;
    }
    if (phase === 'up') {
      hintToggleInput.keyUp(action, at);
    } else {
      hintToggleInput.keyDown(action, at);
    }
    return true;
  };
  const cancelHeldInput = (): void => {
    input.reload.cancel();
    throwStanceInput.cancel();
    quickbarInput.cancel();
    interactInput.cancel();
    interactionPressTarget = undefined;
  };
  const rejectRefusedInput = (): boolean => {
    const refusal = sim.body.actionRefusal;
    if (!refusal) {
      return false;
    }
    cancelHeldInput();
    showRefusal(refusal, sim.time);
    return true;
  };
  const releaseInputCommand = (action: string, at: number, slot: number | undefined): void => {
    if (handleHintCommand(action, 'up', at)) {
      return;
    }
    if (sim.body.actionRefusal) {
      cancelHeldInput();
      return;
    }
    releaseCommand(action, at, slot);
  };
  const dispatchPressCommand = (action: string, at: number, slot: number | undefined): void => {
    if (action === 'ui.main-menu-toggle') {
      modalCommand(action);
      return;
    }
    if (handleDebugCommand(action)) {
      return;
    }
    if (rejectRefusedInput()) {
      return;
    }
    if (handleHintCommand(action, 'down', at)) {
      return;
    }
    if (sim.dead) {
      return;
    }
    if (!modalCommand(action)) {
      gameplayCommand(action, at, slot);
    }
  };
  const dispatchInputCommand = ({ action, phase, at }: InputCommand, fromReplay = false): void => {
    if (replayPlayer && !fromReplay) {
      return;
    }
    const context = inputContext();
    const payloadBackedScreenAction =
      (context === 'inventory' &&
        ((action.startsWith('inventory.') && !['inventory.previous', 'inventory.next'].includes(action)) ||
          action.startsWith('quickbar.assign.') ||
          action === 'handling.stop')) ||
      action === 'craft.continue';
    // Gameplay records this press after toggling saved state; recording it here too duplicates the live press.
    const walkToggleHandledByGameplay = action === 'movement.walk-toggle' && phase === 'down';
    if (!(fromReplay || isGestureAction(action) || payloadBackedScreenAction || walkToggleHandledByGameplay)) {
      inputRecorder?.queueAction(action, phase, context);
    }
    const slot = quickbarSlotFor(action);
    if (phase === 'up') {
      releaseInputCommand(action, at, slot);
      return;
    }
    dispatchPressCommand(action, at, slot);
  };
  keyboardInput.command = (command) => dispatchInputCommand(command);
  const dispatchReplayQuickbar = (action: ReplayAction): boolean => {
    const match = QUICKBAR_ACTION.exec(action.action);
    if (!match) {
      return false;
    }
    const index = Number(match[2]);
    if (index < 1 || index > QUICKBAR_SLOTS) {
      return false;
    }
    (match[1] === 'tap' ? quickbarTap : quickbarHold)(index - 1);
    return true;
  };
  const dispatchReplayGesture = (action: ReplayAction): boolean => {
    switch (action.action) {
      case 'firearm.load':
        reloadBinding()?.load();
        return true;
      case 'firearm.rack':
        reloadBinding()?.rack();
        return true;
      case 'firearm.remove':
        reloadBinding()?.remove();
        return true;
      case 'throw.stance.toggle':
        toggleThrowingStance();
        return true;
      case 'item.drop':
        dropHeldItemForThrowingStance();
        return true;
      case 'item.throw.cancel':
        cancelItemThrow();
        return true;
      default:
        return dispatchReplayQuickbar(action);
    }
  };
  dispatchReplayAction = (action, sample) => {
    replaySample = sample;
    if (action.payload) {
      const reason = applyScreenCommand(action.payload);
      if (reason) {
        showRefusal(reason, sim.time);
      }
      return;
    }
    if (dispatchReplayGesture(action)) {
      return;
    }
    dispatchInputCommand({ action: action.action, phase: action.phase, at: performance.now() }, true);
  };
  keyboardInput.install();
  keyboardInput.sync();
  replayPlayState.restore(options.replay?.startState);
  const cycleWieldedAction = (deltaY: number): boolean => {
    const item = inventory.hands[dominantSide(inventory.character)];
    return item !== undefined && survival.cycleItemAction(item, Math.sign(deltaY));
  };
  globalThis.addEventListener(
    'wheel',
    (e) => {
      if (input.locked && mainMenuOpen) {
        $('overlay').querySelector<HTMLElement>('.card')!.scrollTop += e.deltaY;
        e.preventDefault();
      } else if (input.locked && !input.menuPointer) {
        if (debugTools?.buildOn || !cycleWieldedAction(e.deltaY)) {
          debugTools?.wheel(e.deltaY);
        } else {
          e.preventDefault();
        }
      }
    },
    { passive: false },
  );

  const lookDir = (): Vec3 =>
    aimDirection(replaySample?.yaw ?? input.yaw, replaySample?.pitch ?? input.pitch, NEUTRAL_AIM);
  const eye = (): Vec3 => [body.pos[0], body.pos[1] + session.playerEyeHeightMetres / s, body.pos[2]];

  /** The nearest visible furniture panel or cell in the crosshair. */
  const interactionTargetAt = (): InteractionTarget | undefined =>
    pickInteractionTarget({
      inventory,
      entities,
      origin: eye(),
      direction: lookDir(),
      maxDistance: USE_REACH / s,
      blockSize: s,
      worldSeed: config.seed,
      isSolid: engine.isOpaque,
      hasModel: (id) => view.models.has(id),
    });
  const lookedAt = (): BlockEntity | undefined => {
    const target = interactionTargetAt();
    return target?.kind === 'furniture' ? target.entity : undefined;
  };

  const keyLockHint = (entity: BlockEntity): string | undefined => {
    if (!entities.defOf(entity).door) {
      return undefined;
    }
    const heldKeys = [
      inventory.hands[dominantSide(inventory.character)],
      inventory.hands[offSide(inventory.character)],
    ].filter((item): item is Item => item !== undefined && registry.items.get(item.type)?.key !== undefined);
    const heldKey =
      heldKeys.find((item) => registry.items.get(item.type)?.key?.lock === entity.lock?.id) ?? heldKeys[0];
    const keyLock = heldKey && registry.items.get(heldKey.type)?.key?.lock;
    if (keyLock === undefined) {
      return undefined;
    }
    const operation = entity.lock?.locked ? 'unlock' : 'lock';
    const plan = doorPlan(inventory, entity, operation, [keyLock]);
    return `${operation === 'lock' ? 'Lock' : 'Unlock'}${plan.ok ? '' : ` — ${plan.reason}`}`;
  };

  const pryHint = (entity: BlockEntity): string | undefined => {
    if (!(entity.lock?.locked && entities.defOf(entity).door?.prying)) {
      return undefined;
    }
    const plan = pryPlan(inventory, entity, undefined, session.character);
    if (plan.ok) {
      return `with the ${inventory.name(plan.tool).toLowerCase()}`;
    }
    const tools = plan.toolNames.map((name) => name.toLowerCase()).join(' or ') || 'a suitable tool';
    return `with ${tools} — ${plan.reason}`;
  };

  /** Describes the displayed action for the selected target. */
  const useText = (entity: BlockEntity): string => {
    const door = entities.defOf(entity).door ? doorOptions(inventory, entity)[0] : undefined;
    const prying = pryHint(entity);
    const doorReason = !prying && door?.plan.ok === false ? door.plan.reason : undefined;
    return playInteractionText({
      doorReason,
      lock: keyLockHint(entity),
      prying,
      door: Boolean(entities.defOf(entity).door),
      open: entity.open,
      container: Boolean(entity.pockets),
      readable: Boolean(entities.defOf(entity).readable),
      restAction: restKindForFurniture(entities.defOf(entity)),
      searched: entity.searched,
      name: nameOf(entity),
      fullName: entities.defOf(entity).name,
    });
  };

  function completeWorldInteraction(mode: 'pocket' | 'wield'): void {
    const target = interactionPressTarget;
    interactionPressTarget = undefined;
    if (!target) {
      return;
    }
    const payload: ReplayActionPayload =
      target.kind === 'item'
        ? { kind: 'item.pickup', itemUid: target.item.uid, mode, feet: feet() }
        : { kind: 'furniture.interact', entityUid: target.entity.uid };
    const reason = dispatchScreenCommand(payload);
    if (reason) {
      showRefusal(reason, sim.time);
    }
  }

  function pickupGroundItem(uid: number, mode: 'pocket' | 'wield', feetPosition: Vec3): string | undefined {
    const item = inventory.itemByUid(uid);
    if (!item) {
      return 'The item is no longer available';
    }
    return mode === 'wield' ? toHands(inventory, queue, item, feetPosition) : pocketGroundItem(inventory, queue, item);
  }

  function interactFurniture(uid: number): string | undefined {
    const entity = entities.byUid(uid);
    if (!entity) {
      return 'The target is no longer available';
    }
    if (compression.locksInput && rest.action?.furnitureUid !== entity.uid) {
      return undefined;
    }
    useTarget(entity);
    return undefined;
  }

  function throwHandPriority(): HandSide {
    const off = offSide(inventory.character);
    return inventory.hands[off] ? off : dominantSide(inventory.character);
  }

  function toggleThrowingStance(): void {
    throwingStance = !throwingStance;
    automaticFireUid = undefined;
    if (!replayPlayer) {
      inputRecorder?.queueAction('throw.stance.toggle', 'down', inputContext(), { inSnapshot: true });
    }
    if (!throwingStance) {
      cancelItemThrow();
    }
    syncThrowingStance();
  }

  function syncThrowingStance(): void {
    if (throwingStance && !inventory.hands.right && !inventory.hands.left) {
      throwingStance = false;
      cancelItemThrow();
    }
  }

  function dropHeldItemForThrowingStance(): void {
    if (!replayPlayer) {
      if (sim.body.actionRefusal) {
        showRefusal(sim.body.actionRefusal, sim.time);
        return;
      }
      if (!inventory.hands[throwHandPriority()]) {
        return;
      }
      inputRecorder?.queueAction('item.drop', 'down', inputContext());
      pendingPlayerTickActions.enqueue(dropHeldItemForThrowingStanceNow);
      return;
    }
    dropHeldItemForThrowingStanceNow();
  }

  function dropHeldItemForThrowingStanceNow(): void {
    if (sim.body.actionRefusal) {
      showRefusal(sim.body.actionRefusal, sim.time);
      return;
    }
    const hand = throwHandPriority();
    const item = inventory.hands[hand];
    if (!item) {
      return;
    }
    const result = inventory.move(item, { kind: 'pile', pos: feet() });
    if (!result.ok) {
      showRefusal(`Can't drop it: ${result.reason}`, sim.time);
      return;
    }
    if (itemThrowItemUid === item.uid) {
      cancelItemThrow();
    }
    syncThrowingStance();
  }

  function beginItemThrow(): void {
    const refusal = sim.body.actionRefusal;
    if (refusal) {
      showRefusal(refusal, sim.time);
      return;
    }
    if (itemThrowStartedAt !== undefined || itemThrowItemUid !== undefined) {
      return;
    }
    const hand = throwHandPriority();
    const item = inventory.hands[hand];
    if (!item) {
      return;
    }
    itemThrowHand = hand;
    itemThrowItemUid = item.uid;
    if (queue.busy || firearms.busy) {
      showNotice('Waiting for handling to finish');
      return;
    }
    itemThrowStartedAt = sim.time;
  }

  function finishItemThrow(): void {
    if (itemThrowStartedAt === undefined) {
      cancelItemThrow();
      return;
    }
    if (itemThrowItemUid === undefined) {
      return;
    }
    const heldSimSeconds = Math.max(0, sim.time - itemThrowStartedAt);
    const uid = itemThrowItemUid;
    const hand = itemThrowHand;
    cancelItemThrow();
    if (input.consumeRightMousePressed() || input.rightMouseHeld) {
      dispatchScreenCommand({ kind: 'item.throw.cancel' });
      input.suppressRightMouseUntilRelease();
      return;
    }
    if (!hasMetThrowMinimumHold(heldSimSeconds, throwMinimumHoldSimSeconds)) {
      return;
    }
    const item = inventory.itemByUid(uid);
    if (!(item && hand && inventory.hands[hand] === item)) {
      return;
    }
    const distance = throwDistanceForItem(item, registry, itemThrowTuning, heldSimSeconds);
    const chargeProgress = Math.min(1, heldSimSeconds / itemThrowTuning.chargeSimSeconds);
    if (!replayPlayer) {
      inputRecorder?.queueAction('item.throw', 'down', inputContext(), {
        payload: {
          kind: 'item.throw',
          itemUid: uid,
          hand,
          distance,
        },
      });
      pendingPlayerTickActions.enqueue(() => {
        applyToHeldItem(inventory.hands, hand, uid, (heldItem) => {
          throwHeldItem(heldItem, hand, distance, chargeProgress);
          syncThrowingStance();
        });
      });
    }
  }

  function cancelItemThrow(): void {
    itemThrowStartedAt = undefined;
    itemThrowItemUid = undefined;
    itemThrowHand = undefined;
  }

  function advancePendingItemThrow(): void {
    if (itemThrowItemUid === undefined || itemThrowStartedAt !== undefined) {
      return;
    }
    if (!input.dominantUseHeld) {
      cancelItemThrow();
      return;
    }
    if (sim.paused || queue.busy || firearms.busy) {
      return;
    }
    if (itemThrowHand === undefined || inventory.hands[itemThrowHand]?.uid !== itemThrowItemUid) {
      cancelItemThrow();
      showRefusal('The item left your hand before the throw began', sim.time);
      return;
    }
    itemThrowStartedAt = sim.time;
    showNotice('');
  }

  function throwRecordedItem(itemUid: number, hand: HandSide, distanceMetres: number): void {
    applyToHeldItem(inventory.hands, hand, itemUid, (item) => {
      throwHeldItem(item, hand, distanceMetres);
      syncThrowingStance();
    });
  }

  function throwHeldItem(item: Item, hand: HandSide, distanceMetres: number, chargeProgress = 0): void {
    if (inventory.hands[hand] !== item) {
      return;
    }
    const target = itemLandingTarget(distanceMetres);
    if (!target) {
      showRefusal("Can't find a place for it to land", sim.time);
      return;
    }
    const placement = inventory.planAdd(item, target);
    if (!placement.ok) {
      showRefusal(`Can't throw it there: ${placement.reason}`, sim.time);
      return;
    }
    const location = inventory.locate(item);
    if (location?.kind !== 'hand' || location.side !== hand || !inventory.consume(item)) {
      return;
    }
    if (!inventory.add(item, target)) {
      inventory.add(item, { kind: 'hand', side: location.side });
      showRefusal("Couldn't land the item there", sim.time);
      return;
    }
    const throwOffset: Vec3 = throwingStance
      ? throwStanceWorldOffset(hand, input.yaw, input.pitch, chargeProgress)
      : [0, 0, 0];
    const origin: Vec3 = [
      body.pos[0] * s + throwOffset[0],
      body.pos[1] * s + session.playerEyeHeightMetres + throwOffset[1],
      body.pos[2] * s + throwOffset[2],
    ];
    const landing: Vec3 = [(target.pos[0] + 0.5) * s, (target.pos[1] + 0.15) * s, (target.pos[2] + 0.5) * s];
    itemThrows.spawn(origin, landing, item);
  }

  function itemLandingTarget(distanceMetres: number): Extract<Target, { kind: 'pile' }> | undefined {
    const from: Vec3 = [body.pos[0] * s, body.pos[1] * s + session.playerEyeHeightMetres, body.pos[2] * s];
    const pos = traceItemLanding({
      from,
      direction: lookDir(),
      distanceMetres,
      blockSize: s,
      minY: scale.minCy * CHUNK,
      isSolid: engine.isSolid,
    });
    return pos ? { kind: 'pile', pos } : undefined;
  }

  function toggleRestFromTarget(kind: RestKind, entity: BlockEntity): void {
    const { action } = rest;
    if (action?.kind === kind && action.furnitureUid === entity.uid && !rest.canStop) {
      return;
    }
    toggleRest(kind, entity);
  }

  function useTarget(entity: BlockEntity): void {
    const def = entities.defOf(entity);
    if (def.door) {
      toggleDoor(entity);
      return;
    }
    if (def.readable) {
      const reason = session.readFurniture(entity);
      if (reason) {
        showRefusal(reason, sim.time);
      }
      return;
    }
    const kind = restKindForFurniture(def);
    if (kind) {
      toggleRestFromTarget(kind, entity);
      return;
    }
    if (!entity.pockets) {
      return;
    }
    playtestObserver?.beginSearch(entity, nameOf(entity));
    search(entity);
    if (!screen.isOpen) {
      toggleInventory();
    }
  }

  inputTarget.addEventListener('contextmenu', (e) => e.preventDefault());
  const handUids = () => ({
    right: inventory.hands.right?.uid ?? null,
    left: inventory.hands.left?.uid ?? null,
  });
  const meleeSelection = (
    preferredHand?: 'right' | 'left',
  ): {
    weapon: MeleeWeapon;
    profile: 'blunt' | 'cut' | 'pierce' | 'fists';
    hand?: 'right' | 'left';
    twoHanded: boolean;
    item?: (typeof inventory.hands)['right'];
  } => {
    const handOrder: readonly ('right' | 'left')[] = preferredHand
      ? [preferredHand]
      : [dominantSide(inventory.character), offSide(inventory.character)];
    for (const hand of handOrder) {
      const item = inventory.hands[hand];
      const weapon = item && registry.items.get(item.type)?.weapon?.melee;
      if (item && weapon) {
        return {
          weapon: { ...weapon, cooldown: weapon.cooldownSimSeconds },
          profile: weapon.type,
          hand,
          twoHanded: registry.items.get(item.type)?.twoHanded ?? false,
          item,
        };
      }
    }
    return {
      weapon: FISTS_MELEE,
      profile: 'fists',
      ...(preferredHand === undefined ? {} : { hand: preferredHand }),
      twoHanded: false,
    };
  };
  const meleeWeapon = () => meleeSelection().weapon;

  const swing = (preferredHand?: 'right' | 'left') => {
    if (sim.body.actionRefusal) {
      showRefusal(sim.body.actionRefusal, sim.time);
      return;
    }
    const selected = meleeSelection(preferredHand);
    const classTuning = selected.profile === 'fists' ? undefined : registry.meleeClasses.get(selected.profile);
    if (selected.profile !== 'fists' && classTuning === undefined) {
      throw new Error(`Missing melee class tuning for ${selected.profile}`);
    }
    const swingWeapon = resolvePlayerMeleeWeapon(
      selected.weapon,
      classTuning,
      session.sim.body.consequences.swingSlowdown,
    );
    const result = startPlayerMelee(
      playerCombat,
      sim.needs,
      {
        origin: eye(),
        direction: lookDir(),
        weapon: swingWeapon,
        profile: selected.profile,
        ...(selected.hand === undefined ? {} : { hand: selected.hand }),
        twoHanded: selected.twoHanded,
        hands: handUids(),
        aimYaw: input.yaw,
        aimPitch: input.pitch,
      },
      sim.body.tuning.staminaRegenDelaySimSeconds,
    );
    if (result === 'too-tired') {
      showRefusal('You are too tired to swing', sim.time);
    }
  };

  const fireWeapon = (item: Item, time: number): boolean => {
    const fired = firearms.fire({
      aimFrame: aim.frame,
      ready: isFirearmReady(item.uid),
      aimingDownSights: isAimingDownSights(),
      sprinting: session.sprinting,
      item,
      feet: feet(),
      eye: eye(),
      yaw: input.yaw,
      pitch: input.pitch,
      seed: config.seed,
      simTime: time,
      blockSize: s,
    });
    if (!fired) {
      return false;
    }
    if (registry.items.get(item.type)?.firearm?.pump) {
      return true;
    }
    const shot = firearmShotEmission(item, firearms.noiseFactorFor(item));
    session.playPlayerSound(shot.event, time, shot);
    return true;
  };

  const triggerWeapon = (weapon: Item | undefined, pressed: boolean) => {
    if (!weapon) {
      return;
    }
    const reason = firearms.fireReason(weapon.uid);
    if (reason) {
      if (pressed) {
        showRefusal(reason, sim.time);
      }
      return;
    }
    const { roundsPerSimSecond } = firearmHandlingFor(weapon, registry);
    return roundsPerSimSecond === undefined ? undefined : { uid: weapon.uid, roundsPerSimSecond };
  };

  const refusalReason = (reason: string | undefined): void => {
    if (reason) {
      showRefusal(reason, sim.time);
    }
  };
  const refusePrimaryUseWhileHandling = (): boolean => {
    if (!(queue.busy || firearms.busy)) {
      return false;
    }
    showRefusal('Already handling something', sim.time);
    return true;
  };

  const shouldPlayerBlock = (): boolean => {
    const action = selectPrimaryAction(inventory);
    const enGarde = shouldEnterMeleeReady({
      rightMouseHeld: input.rightMouseActionHeld && input.locked && !input.menuPointer,
      meleeWeaponHeld: action.kind === 'melee',
      handsEmpty: !(inventory.hands.right || inventory.hands.left),
      debugBuild: debugTools?.buildOn ?? false,
      inputLocked: compression.locksInput,
    });
    return shouldBlockFromEnGarde(enGarde, keyboardInput.held('movement.back'));
  };

  const activateIgniter = (item: Item, hand: HandSide): void => {
    const target = ignitionTargetForHand(inventory, hand);
    const usable = target ?? (registry.items.get(item.type)?.light ? item : undefined);
    if (usable) {
      refusalReason(survival.use(usable));
      return;
    }
    showRefusal(primaryActionHint(registry, item), sim.time);
  };
  const fireHeldItem = (item: Item): void => {
    if (!isFirearmReady(item.uid) || session.sprinting || fireWeapon(item, sim.time)) {
      return;
    }
    showRefusal(firearms.fireReason(item.uid) ?? 'Firearm is not ready', sim.time);
  };
  performHandUse = (hand: 'right' | 'left') => {
    if (sim.body.actionRefusal) {
      showRefusal(sim.body.actionRefusal, sim.time);
      return;
    }
    if (refusePrimaryUseWhileHandling()) {
      return;
    }
    const action = selectPrimaryAction(inventory, hand);
    switch (action.kind) {
      case 'unpack':
        refusalReason(unpacking.activate(action.item));
        return;
      case 'melee':
        swing(action.hand);
        return;
      case 'ignite':
        activateIgniter(action.item, action.hand);
        return;
      case 'light':
      case 'read':
      case 'use':
        refusalReason(survival.use(action.item));
        return;
      case 'firearm':
        fireHeldItem(action.item);
        return;
      case 'magazine':
        refusalReason(
          survival.selectedItemAction(action.item)?.magazine === 'strip'
            ? magazines.strip(action.item.uid, sim.time)
            : 'Magazine is empty',
        );
        return;
      case 'fists':
        swing(action.hand);
        return;
      case 'noop':
        return;
      case 'key':
        activateKey(action.item);
        return;
      case 'none':
        showRefusal(primaryActionHint(registry, action.item), sim.time);
        return;
      default: {
        const unhandled: never = action;
        throw new Error(`Unhandled primary action ${String(unhandled)}`);
      }
    }
  };
  // Buttons 3 and 4 are the browser's history Back/Forward; swallow every phase of them so a press never navigates away.
  // Listened on the document (capture) in case the pointer-lock target isn't the canvas; the mouse and pointer
  // events can both arrive for one press, so the forward press is deduped.
  const swallowSideButton = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
    }
  };
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'auxclick']) {
    document.addEventListener(type, (e) => swallowSideButton(e as MouseEvent), true);
  }

  const forwardPress = new PressDedupe();
  const onForwardPress = (e: MouseEvent) => {
    if (!(isForwardButton(e) && forwardPress.accept(e.timeStamp))) {
      return;
    }
    if (!input.locked || input.menuPointer || compression.locksInput || debugTools?.buildOn) {
      return;
    }
    if (refusePrimaryUseWhileHandling()) {
      return;
    }
    // Instant off-hand use shares Survival's owner with a quickbar second press.
    const item = offHandUse(registry, inventory);
    const reason = item && survival.use(item);
    if (reason) {
      showRefusal(reason, sim.time);
    }
  };
  document.addEventListener('pointerdown', onForwardPress, true);
  document.addEventListener('mousedown', onForwardPress, true);
  inputTarget.addEventListener('mousedown', (e) => {
    if (!input.locked || input.menuPointer || compression.locksInput || !debugTools?.buildOn) {
      return;
    }
    debugTools.click(e.button, eye(), lookDir());
  });

  // ---- loop ----

  let last = realNow();
  let lastDebugUpdate = 0;
  let fps = 0;
  // Debug readout: frame intervals and CPU work alongside simulation, rendering and mesh timings.
  const frameInterval = new FrameTimes();
  const frameWork = new FrameTimes();
  let simulationMs = 0;
  let renderMs: number | null = engine.renderer ? 0 : null;
  let meshingQueueMs = 0;

  const displayCalendar = (): number => sim.calendar;
  const throwStanceCueVisible = (): boolean =>
    throwingStance && hudOptions.interaction && input.locked && !screen.isOpen && !reading.isOpen && !mainMenuOpen;

  const statusView = (): PlayStatus => ({
    calendar: displayCalendar(),
    speed: compression.c,
    paused: sim.paused,
    needs: sim.needs,
    health: sim.body.health,
    sprinting: session.sprinting,
    lightCharge: survival.lit ? (chargeShare(registry, survival.lit) ?? 0) : undefined,
  });
  const needsText = (): string => playNeedsText(statusView());
  const hudText = (looking: string, visible: Readonly<HudOptionsState>): string =>
    playHudText(
      {
        ...statusView(),
        carriedGrams: inventory.carriedWeight(),
        fps,
        seed: config.seed,
        radiusMetres: config.radiusM,
        walking: input.walking,
        positionMetres: body.pos.map((v) => v * s),
        meshed: meshes.count,
        pending: streamer.pending,
        looking: [
          looking,
          ...(visible.interaction && itemThrowStartedAt !== undefined ? ['Mouse-1 held · right-click cancels'] : []),
        ]
          .filter(Boolean)
          .join(' · '),
      },
      visible,
    );
  const promptText = (now: number, visible: Readonly<HudOptionsState>): string => {
    const target = visible.interaction && input.locked && !debugTools?.buildOn ? interactionTargetAt() : undefined;
    let interactionHint: string | undefined;
    if (target?.kind === 'item') {
      interactionHint = `${labelForAction('world.interact')}: pocket the ${inventory.name(target.item)}; hold to wield`;
    } else if (target?.kind === 'furniture') {
      interactionHint = useText(target.entity);
    }
    return playPromptText(
      {
        now,
        notice,
        noticeUntil,
        interactionHint,
        itemActionHint:
          visible.interaction && input.locked && !debugTools?.buildOn ? survival.wieldedItemActionHint() : undefined,
        interruption: compression.interruption,
        resting: rest.action !== undefined,
      },
      visible,
    );
  };

  let quickbarDrawn = '';
  const drawQuickbar = () => {
    const key = quickbarKey(quickbar, inventory);
    if (key !== quickbarDrawn) {
      quickbarDrawn = key;
      renderQuickbar(quickbarBox, quickbar, inventory);
    }
    quickbarBox.hidden = debugTools?.buildOn ?? false;
  };

  const updateVisualFeedback = (dt: number): void => {
    for (const event of damageEvents.read()) {
      if (event.kind === 'damage') {
        view.damage(event.amount);
      }
    }
    view.updateCamera(
      {
        dt,
        body,
        paused: sim.paused,
        noclip: debugTools?.noclip ?? false,
        yaw: input.yaw,
        pitch: input.pitch,
        stridePhase: session.playerStridePhase,
        eye: eye(),
        ...(spectatorCameraEnabled && spectatorCameraBody
          ? { spectator: { position: [...spectatorCameraBody.pos], yaw: input.yaw, pitch: input.pitch } }
          : {}),
        sightImpaired: sim.body.consequences.sightImpaired,
      },
      $('damage'),
    );
  };

  const updateDebugReadout = (now: number): void => {
    if (!debugTools || now - lastDebugUpdate < 250) {
      return;
    }
    lastDebugUpdate = now;
    debugTools.update(
      playReadout({
        measurements: {
          fps,
          frame: frameInterval.summary(),
          work: frameWork.summary(),
          seed: config.seed,
          radius: config.radiusM,
          chunks: meshes.count,
          pending: streamer.pending,
          holes: streamer.unmeshedColumns(body.pos[0], body.pos[2], config.radiusChunks),
          zombies: zombieStore.size,
          sounds: audio.heardSounds,
          simulationMs,
          renderMs,
          meshingQueueMs,
          entities: zombieStore.size + [...entities.all].length + inventory.piles.size,
          compression: compression.c,
          snapshotLastMs: snapshotHistory.lastMs ?? 0,
          snapshotP95Ms: snapshotHistory.p95Ms,
          snapshotCount: snapshotHistory.count,
        },
        walking: input.walking,
        positionBlocks: body.pos,
        blockSize: s,
        calendar: displayCalendar(),
        chunks: engine.world.chunks.values(),
        drawn: engine.meshes.group.children,
        revealedPositions: revealZombies
          ? [...zombieStore.entries()].map(([, { body: zombieBody }]) => zombieBody.pos)
          : [],
      }),
    );
  };

  const firearmReadiness = () => {
    const selected = selectPrimaryAction(inventory);
    if (selected.kind !== 'firearm' || !input.rightMouseActionHeld || !input.locked || input.menuPointer) {
      return;
    }
    return {
      uid: selected.item.uid,
      progress: firearms.readyProgress(selected.item.uid),
      aimingDownSights: isAimingDownSights(),
    };
  };

  const handlingPresentation = () => {
    const [job] = queue.jobs;
    const item = job?.kind === 'move' ? inventory.itemByUid(job.itemUid) : undefined;
    const location = item ? inventory.locate(item) : undefined;
    const progress =
      job?.kind === 'move' && location?.kind === 'pile' && job.duration > 0
        ? Math.max(0, Math.min(1, job.elapsed / job.duration))
        : undefined;
    return { job, progress };
  };

  const throwingPresentation = () => {
    if (!throwingStance) {
      return {};
    }
    return {
      throwing: {
        chargeProgress:
          itemThrowStartedAt === undefined
            ? 0
            : Math.max(0, Math.min(1, (sim.time - itemThrowStartedAt) / itemThrowTuning.chargeSimSeconds)),
      },
    };
  };

  const updateHeldItems = (dt: number, readiness = firearmReadiness()): void => {
    camera.updateMatrixWorld(); // the beam follows this frame's view, not the last one's
    const selectedMelee = meleeSelection();
    const ready = shouldEnterMeleeReady({
      rightMouseHeld: input.rightMouseActionHeld && input.locked && !input.menuPointer,
      meleeWeaponHeld: selectedMelee.item !== undefined,
      handsEmpty: !(inventory.hands.right || inventory.hands.left),
      debugBuild: debugTools?.buildOn ?? false,
      inputLocked: compression.locksInput,
    });
    const action = playerCombat.activeMeleeAction;
    const elapsed = action
      ? Math.min(action.cooldown, action.elapsed + (sim.paused ? 0 : Math.max(0, sim.time - session.lastPlayerStep)))
      : 0;
    const pose = renderMeleePose(action, elapsed, ready, dominantSide(inventory.character));
    const { job: handlingJob, progress: grabProgress } = handlingPresentation();
    view.updateHeld(dt, pose, survival.lit, {
      firearms: firearms.frames(),
      ...(readiness === undefined ? {} : { readiness }),
      aim: aim.frame,
      job: handlingJob,
      ...(grabProgress === undefined ? {} : { grab: { progress: grabProgress } }),
      ...throwingPresentation(),
    });
  };

  const heldFirearmBore = (readiness = firearmReadiness()) => {
    const selected = selectPrimaryAction(inventory);
    if (selected.kind !== 'firearm') {
      return;
    }
    const tuning = registry.skills.get('firearms_combat')?.combat?.firearms;
    if (!tuning) {
      throw new Error('Missing firearms-combat pose tuning');
    }
    const { item } = selected;
    const firearmPose = readiness?.uid === item.uid ? readiness : undefined;
    const { model } = firearmHandlingFor(item, registry);
    const side = inventory.hands.right?.uid === item.uid ? ('right' as const) : ('left' as const);
    const progress = firearmPose?.progress ?? 0;
    const viewpoint = { eye: eye(), yaw: input.yaw, pitch: input.pitch };
    const leadingSide = dominantSide(inventory.character);
    const twoHanded = Boolean(registry.items.get(item.type)?.twoHanded);
    const aimingDownSights = firearmPose?.aimingDownSights ?? false;
    const poseInput = {
      model,
      side,
      leadingSide,
      twoHanded,
      progress,
      aimingDownSights,
      aimFrame: aim.frame,
      loweredPitchRadians: tuning.loweredPitchRadians,
      adsApertureFill: tuning.adsApertureFill,
      verticalFovDegrees: camera.fov,
    };
    const basePose = heldFirearmTransform(poseInput);
    const heldFirearmFrame = firearms.frames().find((entry) => entry.uid === item.uid);
    const handlingTurn = handlingRotation(model, side, heldFirearmFrame, {
      x: basePose.rootOffset[0],
      y: basePose.rootOffset[1],
    });
    return firearmBoreRay({
      ...poseInput,
      ...viewpoint,
      blockSize: s,
      handlingTurn,
      isSolid: engine.isSolid,
    });
  };

  const targetAlongBore = (bore: ReturnType<typeof firearmBoreRay>) => {
    const surface = crosshairTarget(
      { world: engine.world, registry, entities, isSolid: engine.isSolid, blockSize: s },
      bore.origin,
      bore.direction,
    );
    return firearmBoreTarget({
      eye: bore.origin,
      direction: bore.direction,
      surface,
      zombies: zombieSystem,
      blockSize: s,
    });
  };

  const crosshairScreenPosition = (bore: ReturnType<typeof firearmBoreRay> | undefined) => {
    if (!bore) {
      return;
    }
    return projectCrosshairScreenPosition(camera, inputTarget.getBoundingClientRect(), targetAlongBore(bore).point, s);
  };

  /** The scheduler's player tick (which carries noclip) is stopped by the debug freeze, so noclip flight is stepped here instead. */
  const stepFrozenNoclip = (dt: number, frozenAndPlaying: boolean): void => {
    if (
      !(
        frozenAndPlaying &&
        !replayPlayer &&
        debugTools?.noclip &&
        !spectatorCameraEnabled &&
        input.locked &&
        !input.menuPointer
      )
    ) {
      return;
    }
    debugTools.stepNoclip({
      body,
      scale,
      yaw: input.yaw,
      pitch: input.pitch,
      intent: input.intent(),
      descend: keyboardInput.held('noclip.descend'),
      dt,
    });
  };

  const verifyReplayEndState = (): void => {
    if (!(replayPlayer?.finished && !replayVerificationStarted)) {
      return;
    }
    replayVerificationStarted = true;
    replayVerificationTick = replayPlayer.tickCount;
    const finalSnapshot = captureSnapshot();
    sim.paused = true;
    replayStateFingerprint(finalSnapshot).then(
      (actual) => {
        replayVerification = actual === options.replay?.endStateFingerprint ? 'matched' : 'diverged';
      },
      () => {
        replayVerification = 'unavailable';
      },
    );
  };

  const cancelItemThrowOnRightClick = (): void => {
    if (sim.body.actionRefusal && itemThrowItemUid !== undefined) {
      cancelItemThrow();
      return;
    }
    if (!replayPlayer && input.consumeRightMousePressed() && itemThrowItemUid !== undefined) {
      dispatchScreenCommand({ kind: 'item.throw.cancel' });
      input.suppressRightMouseUntilRelease();
    }
  };

  const stepReplaySimulation = (realDt: RealSeconds, menuPaused: boolean, gameFrozen: boolean): void => {
    sim.paused = menuPaused || gameFrozen || replayPlayer?.finished === true || replayVerification === 'unavailable';
    if (sim.paused || !replayPlayer || !replayDriver) {
      return;
    }
    if (replayDriver.advanceFrame(realDt).kind === 'unavailable') {
      replayVerification = 'unavailable';
      sim.paused = true;
      return;
    }
    if (replayPlayer.finished) {
      replayDriver.advanceEndRemainder(options.replay!.endSimTimestamp);
    }
    verifyReplayEndState();
  };

  const stopInputRecordingForColumnOverflow = (): void => {
    inputReplayStoppedReason = INPUT_REPLAY_COLUMN_OVERFLOW_STOP_REASON;
    inputRecorder = undefined;
    previousInputRecorder = undefined;
    showNotice(`Replay ${inputReplayStoppedStatus(inputReplayStoppedReason).toLowerCase()}.`);
  };

  const rollInputRecorderWindow = (): void => {
    if (!inputRecorder) {
      return;
    }
    const previousRecorder = inputRecorder;
    previousInputRecorder = previousRecorder;
    inputRecorder = rolloverInputReplayRecorder(
      previousRecorder,
      captureSnapshot(),
      streamer.generatedColumns(),
      captureReplayStartState(),
    );
  };

  const handleInputRecorderColumnOverflow = (): void => {
    if (replayPlayer || !inputRecorder?.columnChangesWouldOverflow) {
      return;
    }
    if (inputRecorder.pendingColumnChangesExceedWindow) {
      stopInputRecordingForColumnOverflow();
    } else {
      rollInputRecorderWindow();
    }
  };

  /** Advances the simulation one frame; returns whether the debug game freeze (M) is on. */
  const stepSimulation = (realDt: RealSeconds, menuPaused: boolean): boolean => {
    cancelItemThrowOnRightClick();
    handleInputRecorderColumnOverflow();
    // The freeze stops the sim like the pause menu does, but without the overlay or pointer release.
    const gameFrozen = debugTools?.frozen ?? false;
    if (replayPlayer) {
      stepReplaySimulation(realDt, menuPaused, gameFrozen);
    } else {
      sim.paused = menuPaused || gameFrozen;
      advanceLiveFrame(sim, realDt, skipUntil, (simDt, until) => session.frame(simDt, until));
    }
    // A running time skip simply waits out the freeze: a paused sim.frame leaves its target and compression alone.
    if (skipUntil !== undefined) {
      updateSkip(skipUntil);
    }
    if (!replayPlayer && inputRecorder?.full) {
      rollInputRecorderWindow();
    }
    stepFrozenNoclip(realDt, gameFrozen && !menuPaused);
    if (spectatorCameraEnabled && spectatorCameraBody && input.locked && !input.menuPointer) {
      debugTools?.stepNoclip({
        body: spectatorCameraBody,
        scale,
        yaw: input.yaw,
        pitch: input.pitch,
        intent: input.intent(),
        descend: keyboardInput.held('noclip.descend'),
        dt: realDt,
      });
    }
    return gameFrozen;
  };

  const updateDebugTargets = (bore: ReturnType<typeof firearmBoreRay> | undefined) => {
    if (!debugTools) {
      return;
    }
    const selected = selectPrimaryAction(inventory);
    const firearmReady = selected.kind === 'firearm' && isFirearmReady(selected.item.uid);
    const ray = debugTargetRay({
      bore,
      eye: eye(),
      lookDirection: lookDir(),
      rightMouseHeld: input.rightMouseActionHeld,
      pointerLocked: input.locked,
      menuPointer: input.menuPointer,
      firearmReady,
    });
    const zombieAim = debugTools.aimEnabled ? zombieSystem.aimAt(ray.origin, ray.direction, meleeWeapon()) : undefined;
    debugTools.updateAim(zombieAim);
    debugTools.updateLookedAt(ray.origin, ray.direction, input.locked);
  };

  const updateActionInputs = (now: number): void => {
    const actionRefusal = Boolean(sim.body.actionRefusal);
    if (actionRefusal) {
      input.reload.cancel();
      quickbarInput.cancel();
      interactInput.cancel();
      interactionPressTarget = undefined;
    } else {
      input.reload.advance(now, reloadBinding());
    }
    const inputLocked = replaySample?.inputLocked ?? compression.locksInput;
    if (screen.isOpen || mainMenuOpen || inputLocked || sim.dead || actionRefusal) {
      quickbarInput.cancel();
      interactInput.cancel();
      interactionPressTarget = undefined;
    } else {
      quickbarInput.update(now);
      interactInput.update(now);
    }
    throwStanceInput.update(now);
    hintToggleInput.update(now);
  };

  const frame = (now: RealTimestamp) => {
    const workStart = realNow();
    const elapsedReal = Math.max(0, (now - last) / 1000);
    const dt = realDuration(Math.min(0.1, elapsedReal));
    frameInterval.record(now, now - last);
    last = now;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    const menuState = syncMenuState();
    const visible = hudVisibility(hudOptions);
    let mark = realNow();
    streamer.update(body.pos[0], body.pos[2]);
    updateStartupHint();
    meshingQueueMs = realNow() - mark;
    updateActionInputs(now);
    playtestObserver?.beforeFrame(queue, inventory);
    mark = realNow();
    const gameFrozen = stepSimulation(dt, menuState.paused);
    advancePendingItemThrow();
    syncThrowingStance();
    caseEffects.update(dt, engine.isSolid);
    impactEffects.update(dt, config.debug && debugLaserEnabled);
    simulationMs = realNow() - mark;
    options.saveController?.afterFrame();
    playtestObserver?.afterFrame(
      { realSeconds: elapsedReal, screenOpen: screen.isOpen, visible: document.visibilityState === 'visible' },
      queue,
      session,
    );
    if (
      playtestObserver?.frame({
        realSeconds: elapsedReal,
        paused: sim.paused,
        visible: document.visibilityState === 'visible',
        compression: compression.c,
        interruption: compression.interruption,
        now,
      })
    ) {
      saveMetrics();
    }
    const { hour, sky } = view.syncWorld({
      calendar: sim.calendar,
      time: sim.time,
      playerEye: eye().map((coordinate) => coordinate * s) as Vec3,
      playerChest: [body.pos[0] * s, body.pos[1] * s + PLAYER_CHEST_METRES, body.pos[2] * s],
      lastZombieStep: session.lastZombieStep,
      lastBackgroundStep: session.lastBackgroundStep,
      dt,
      entities,
      zombies: zombieStore,
      frozen: debugTools !== undefined && (zombieSystem.isFrozen || gameFrozen),
      perceptionLabels: perceptionLabelsEnabled,
    });
    const readiness = firearmReadiness();
    updateHeldItems(dt, readiness);
    const bore = heldFirearmBore(readiness);
    updateDebugTargets(bore);
    updateDebugReadout(now);
    mark = realNow();

    updateVisualFeedback(dt);
    const unconsciousPresentation = sim.body.unconscious && !sim.dead;
    document.body.classList.toggle('unconscious', unconsciousPresentation);
    audio.setOutputMuted(unconsciousPresentation);
    audio.updateHeartbeat(sim.needs.stamina);
    audio.updateListener([camera.position.x, camera.position.y, camera.position.z], lookDir());
    menuPointer.update();

    const crosshair = playCrosshairFrame(visible.crosshair, bore !== undefined, crosshairScreenPosition(bore));
    debugTools?.setCrosshairVisible(visible.crosshair);
    $('throw-stance').hidden = !throwStanceCueVisible();
    renderPlayHud(
      { hud, prompt, crosshair: $('crosshair') },
      {
        hud: hudText(debugTools?.target(eye(), lookDir(), input.locked) ?? '', visible),
        crosshairVisible: crosshair.visible,
        crosshairScreenPosition: crosshair.screenPosition,
        prompt: promptText(now, visible),
      },
    );
    document.body.classList.toggle('resting', rest.action !== undefined);
    renderRest({
      root: restBox,
      action: rest.action,
      canStop: rest.canStop,
      sim,
      messagesVisible: visible.messages,
    });
    const handlingPresentation = handlingPresentationFor(
      sim.actions.job,
      queue,
      inventory,
      itemThrowStartedAt === undefined
        ? undefined
        : {
            elapsedSimSeconds: Math.max(0, sim.time - itemThrowStartedAt),
            chargeSimSeconds: throwChargeSimSeconds,
            minimumHoldSimSeconds: throwMinimumHoldSimSeconds,
          },
    );
    screen.update();
    const readingBookUid = reading.bookUid;
    if (readingBookUid !== undefined) {
      const action = handlingPresentation.longAction;
      const book = inventory.itemByUid(readingBookUid);
      const definition = book && registry.items.get(book.type);
      if (action?.kind === 'reading' && action.ownerUid === readingBookUid) {
        reading.setProgress({ value: action.elapsed, max: action.duration });
      } else if (definition?.book?.recipes.every((recipe) => session.character.knownRecipes.has(recipe))) {
        reading.setProgress({ value: 1, max: 1 });
      } else {
        reading.setProgress(undefined);
      }
    }
    craftPanel.update(screen.isOpen && !sim.dead, visible.messages);
    drawQuickbar();
    quickbarBox.hidden = (debugTools?.buildOn ?? false) || !visible.quickbar;
    renderPlayHandling(handlingBox, handlingPresentation, !screen.isOpen && visible.handling);
    view.prepareLighting(sky);
    view.updateShadows(hour, sky);
    renderMs = view.render();
    frameWork.record(now, realNow() - workStart);
    if (sim.dead) {
      die(sim.dead);
      return false;
    }
    return true;
  };

  /** Stops play and shows what happened; "New world" reloads with the next seed. */
  const die = ({ cause, time }: { cause: string; time: number }) => {
    input.unlock();
    metrics.recordDeath(cause, time * sim.clock.ratio);
    saveMetrics();
    reading.close();
    closeInventoryScreen();
    inventoryPanel.hidden = true;
    syncMenuState();
    prompt.hidden = true;
    const summary = {
      cause,
      survived: time * sim.clock.ratio,
      looted: inventory.looted,
      searched: [...entities.all].filter((e) => e.searched).length,
    };
    showDeath($('death'), registry, summary, () => location.assign(newWorldQuery(location.search, config.seed)));
  };
  if (options.saveController) {
    snapshotIds = options.saveController.bindSession(
      captureSnapshot,
      () => sim.time,
      { blockSize: s, site: config.site, storeys: config.storeys, density: config.density },
      { clock: sim.clock, recordSnapshotDuration: (durationMs) => snapshotHistory.add(durationMs) },
    );
  }
  inputRecorder = createInputReplayRecorder(
    Boolean(options.replay),
    captureSnapshot,
    streamer.generatedColumns(),
    captureReplayStartState,
  );
  // Shaders compile while the world streams in behind the main menu: started now, not awaited, so
  // nothing waits for it. Models that load later (glTF materials) compile when first drawn.
  view.warmUp().catch((error: unknown) => showNotice(`Shader warm-up failed: ${String(error)}`));
  startRealFrames(frame);
  return {
    enter: () => {
      audio.unlock();
      resume();
    },
  };
};
