// Normal play: walk, look, loot, manage what you carry, eat, drink and light your way.
// The simulation core runs the clock, the player's physics, needs and the handling
// queue; Esc pauses it. When health runs out, the death screen offers a new world.

import { type ActionText, actionText, fillParts, fillText } from '../core/actionText.ts';
import { aimDirection, NEUTRAL_AIM } from '../core/aim.ts';
import type { BlockEntity } from '../core/blockEntities.ts';
import type { BodyRegion } from '../core/body.ts';
import { getBuildRevision } from '../core/buildInfo.ts';
import { dominantSide, offSide } from '../core/character.ts';
import { CitySite } from '../core/citySite.ts';
import { formatClock, nextTimeOfDay, skipTarget } from '../core/clock.ts';
import { SKIP_COMPRESSION } from '../core/compression.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import { coreMessage } from '../core/coreText.ts';
import type { WorkOperation } from '../core/craftCommands.ts';
import { crosshairTarget } from '../core/crosshairTarget.ts';
import type { EntityId } from '../core/entities.ts';
import type { PinState } from '../core/explosive.ts';
import { movableRefusal, slidableFurniture } from '../core/furnitureMove.ts';
import { heldFirearmTransform, throwStanceWorldOffset } from '../core/heldPose.ts';
import { interactionAffordance } from '../core/interactionAffordance.ts';
import { type InteractionTarget, pickInteractionTarget } from '../core/interactionPick.ts';
import type { HandSide, Inventory, Pile } from '../core/inventory.ts';
import { damageWord, type Item } from '../core/items.ts';
import { flightForItem, hasMetThrowMinimumHold, throwDistanceForItem } from '../core/itemThrow.ts';
import { chargeShare, offHandUse, wornNightVision } from '../core/lights.ts';
import type { LongJob, RestKind } from '../core/longAction.ts';
import { doorOptions, doorPlan, dropTarget, heldDoorBar, pocketGroundItem, toHands } from '../core/options.ts';
import { pryPlan } from '../core/prying.ts';
import { raycast } from '../core/raycast.ts';
import { reachTuning } from '../core/reach.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import { pileScatterPlacements } from '../core/scatterPile.ts';
import { discoveryForPlan } from '../core/scenarioDiscovery.ts';
import type { BodyTuningDef } from '../core/schema.ts';
import { isForwardButton, PressDedupe } from '../core/sideButton.ts';
import { firearmsCombatTuning } from '../core/skillTraining.ts';
import type { SoundEmission } from '../core/soundPicker.ts';
import { soundVariantKey } from '../core/soundSynth.ts';
import { fillText as fillScreenText } from '../core/textTemplate.ts';
import { type RealSeconds, type RealTimestamp, realSeconds as realDuration, realTimestamp } from '../core/time.ts';
import { type MeleeWeapon, PLAYER_CHEST_METRES } from '../core/zombies.ts';
import { sightedFirearmModel } from '../render/firearmSight.ts';
import { FrameTimes } from '../render/frameTimes.ts';
import { worldGrabProgress } from '../render/grabPose.ts';
import { handlingRotation } from '../render/handlingTurn.ts';
import { markInteractionTarget } from '../render/interactionMarker.ts';
import { renderMeleePose } from '../render/meleePose.ts';
import { createPlayView } from '../render/playView.ts';
import { renderAudioOptions } from '../ui/audioOptions.ts';
import { chargerPanel } from '../ui/chargerPanel.ts';
import { mountCraftPanel } from '../ui/craftController.ts';
import { newWorldQuery, showDeath } from '../ui/death.ts';
import { type ErrorReportContext, setErrorReportContext } from '../ui/errorReport.ts';
import { mountGameCursor } from '../ui/gameCursor.ts';
import { renderGraphicsOptions } from '../ui/graphicsOptions.ts';
import {
  type HandlingPresentationSource,
  quickbarKey,
  renderQuickbar,
  type TimedActionPresentation,
  timedActionHandlingPresentation,
} from '../ui/hud.ts';
import {
  type HudOptionsState,
  hudVisibility,
  readHudOptions,
  renderHudOptions,
  writeHudOptions,
} from '../ui/hudOptions.ts';
import { InventoryScreen, type ScreenHooks } from '../ui/inventoryScreen.ts';
import { fillHint, type HintText, hintHtml as html, keyCap } from '../ui/keyCap.ts';
import { shouldConfirmPageLeave } from '../ui/leaveConfirmation.ts';
import { mountMenuPointer } from '../ui/menuPointer.ts';
import { computeMenuState } from '../ui/menuState.ts';
import {
  type PlayStatus,
  playCarryText,
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
import { renderRest, type WaitViewAction } from '../ui/rest.ts';
import type { SaveController } from '../ui/saveController.ts';
import { mountTutorial } from '../ui/tutorial.ts';
import { vehicleInspectionViewModel } from '../ui/vehicleInspection.ts';
import { showWin } from '../ui/win.ts';
import { mountWorldLoading } from '../ui/worldLoading.ts';
import { GameAudio } from './audio.ts';
import { createRefusalPresenter, handlingMoveCompleteCue, handlingMoveStartCue } from './audioPresentation.ts';
import { BackquoteOrbitGesture } from './backquoteOrbitGesture.ts';
import { openingTargetForHand } from './canOpening.ts';
import { columnArrival } from './columnArrival.ts';
import { continueActionResumesJob } from './continueAction.ts';
import type {
  DebugHooks,
  DebugModule,
  DebugRuntime,
  InputReplayStatusState,
  SkyRouteAttachment,
} from './debugInterface.ts';
import { debugTargetRay } from './debugTargetRay.ts';
import { DOOR_ACTION } from './doorAction.ts';
import type { Engine } from './engine.ts';
import { firearmBoreRay, firearmBoreTarget } from './firearmAim.ts';
import { firearmHandlingFor } from './firearmHandling.ts';
import { FirearmTrigger } from './firearmTrigger.ts';
import { advanceLiveFrame, observeRealFrame, realNow, startRealFrames } from './frameDriver.ts';
import { FurnitureActionSelection } from './furnitureActions.ts';
import { adjustLookPitch, Input } from './input.ts';
import {
  type InputCancellationReason,
  type InputCommand,
  type InputContext,
  inventoryTabForAction,
  keyboardInput,
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
import type { ItemAction } from './itemActions.ts';
import { registerLayoutVehicles } from './layoutVehicles.ts';
import { startingLoadout } from './loadout.ts';
import {
  meleeWeaponFromContent,
  resolvePlayerMeleeWeapon,
  shouldEnterMeleeReady,
  startPlayerMelee,
  unarmedMeleeWeapon,
} from './melee.ts';
import { routeModalCommand } from './modalCommand.ts';
import { OpticZoom } from './opticZoom.ts';
import type { MoveIntent } from './player.ts';
import { applyToHeldItem, PlayerTickActions } from './playerTickActions.ts';
import { bleedingStatusRows } from './playStatus.ts';
import { PlaytestObserver } from './playtestObserver.ts';
import {
  createSnapshotHistory,
  downloadFile,
  type HandBackFile,
  loadMetrics,
  metricsFile,
  persistMetrics,
  replayFile,
  SessionMetrics,
} from './playtestTools.ts';
import { PressHoldInput } from './pressHoldInput.ts';
import { ignitionTargetForHand, selectPrimaryAction } from './primaryAction.ts';
import { QUICKBAR_SLOTS } from './quickbar.ts';
import { QuickbarActions } from './quickbarActions.ts';
import { QuickbarInput } from './quickbarInput.ts';
import { stopReadingOnClose as stopReadingPageOnClose } from './readingClose.ts';
import { RELOAD_GESTURE_MS, type ReloadBinding, reloadTarget } from './reloadInput.ts';
import { applyReplayActionPayload, type ReplayActionPayload, type ReplayCommandOwners } from './replayCommands.ts';
import { restKindForFurniture } from './rest.ts';
import { createScreenCommandDispatcher } from './screenCommandDispatcher.ts';
import { createSession, type PlayerInputSample } from './session.ts';
import { Sharpening } from './sharpening.ts';
import { SpectatorCamera } from './spectatorCamera.ts';
import { populateTestHouseRepairCorner } from './testHouseRepair.ts';
import {
  isOrbitResetMovementAction,
  isPlayerFigureWhole,
  isPlayerThirdPersonView,
  ThirdPersonOrbit,
  type ThirdPersonOrbitAngle,
} from './thirdPersonOrbit.ts';
import { TierNotice } from './tierNotice.ts';
import { Tutorial } from './tutorial.ts';
import { tutorialUrl } from './tutorialUrl.ts';
import { Unpacking } from './unpacking.ts';
import { finishLoadingFrame, WorldLoading } from './worldLoading.ts';
import { playerStartFromWorld } from './worldSetup.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const caseLandingWorldPosition = ([x, y, z]: Vec3, blockSize: number, liftMetres: number): Vec3 => [
  (x + 0.5) * blockSize,
  y * blockSize + liftMetres,
  (z + 0.5) * blockSize,
];

const scenarioDiscovery = (site: Engine['site']) =>
  site instanceof CitySite ? discoveryForPlan(site.plan, site.registry) : undefined;

const scenarioObjective = (site: Engine['site']): Readonly<Vec3> | undefined =>
  site instanceof CitySite ? site.plan.composition?.objective : undefined;

interface PlayErrorReportPorts {
  readonly config: Engine['config'];
  readonly sim: ReturnType<typeof createSession>['sim'];
  readonly input: Input;
  readonly metricsFile: () => HandBackFile;
  readonly exportReplay: () => Promise<Uint8Array>;
  readonly halted: { value: boolean };
  readonly saveController: SaveController | undefined;
}

const stopPlayAfterError = (
  sim: PlayErrorReportPorts['sim'],
  input: Input,
  halted: PlayErrorReportPorts['halted'],
  saveController: SaveController | undefined,
): void => {
  halted.value = true;
  sim.paused = true;
  saveController?.halt();
  input.unlock();
  input.cancel();
};

const bindPlayErrorReport = ({
  config,
  sim,
  input,
  metricsFile: exportMetricsFile,
  exportReplay,
  halted,
  saveController,
}: PlayErrorReportPorts): void => {
  const context: ErrorReportContext = {
    seed: config.seed,
    site: config.site,
    clockText: () => formatClock(sim.calendar),
    stop: () => stopPlayAfterError(sim, input, halted, saveController),
    metricsFile: exportMetricsFile,
    replayFile: async () => replayFile(await exportReplay(), new Date()),
  };
  setErrorReportContext(context);
};

const debugErrorEnabled = (debug: boolean, search: string): boolean => {
  if (!debug) {
    return false;
  }
  return new URLSearchParams(search).get('debug-error') === '1';
};

const guardDebugErrorFrame = (
  frame: (now: RealTimestamp) => boolean,
  enabled: boolean,
  pointerLocked: () => boolean,
): ((now: RealTimestamp) => boolean) => {
  let pending = enabled;
  return (now) => {
    if (pending && pointerLocked()) {
      pending = false;
      throw new Error('Debug-triggered game-loop error');
    }
    return frame(now);
  };
};
/** Sim seconds of slack for a debug time skip "reaching its target"; the clamped last frame lands within float error of it. */
const SKIP_SLACK = 1e-6;
const QUICKBAR_ACTION = /^quickbar\.(tap|hold)\.(\d+)$/;
const PIN_LINES: Readonly<Record<PinState, string>> = {
  in: 'Pin: in',
  pulled: 'Pin: pulled',
  burning: 'Fuse: burning',
};
const pinDescription = (state: PinState | undefined): string[] => (state ? [PIN_LINES[state]] : []);
const isGestureAction = (action: string): boolean =>
  action === 'firearm.reload' ||
  action === 'player.throw' ||
  action === 'light.worn-toggle' ||
  action === 'world.interact' ||
  action.startsWith('quickbar.use.');

const resetOrbitOnLocomotion = (action: string, orbit: ThirdPersonOrbit): void => {
  if (isOrbitResetMovementAction(action)) {
    orbit.movementInput();
  }
};

const thirdPersonOrbitFrame = (angle: ThirdPersonOrbitAngle | undefined) => (angle ? { thirdPersonOrbit: angle } : {});

const cancelBackquoteGesture = (gesture: BackquoteOrbitGesture | undefined): void => gesture?.cancel();
const updateBackquoteGesture = (gesture: BackquoteOrbitGesture | undefined, at: number): void => gesture?.update(at);
const toggleBackquoteDebugPanel = (debugTools: DebugRuntime | undefined, sync: () => unknown): void => {
  debugTools?.handleAction('debug.panel-toggle');
  sync();
};
const routeBackquoteInput = (
  gesture: BackquoteOrbitGesture | undefined,
  action: string,
  options: Parameters<BackquoteOrbitGesture['routeInput']>[1],
): boolean => Boolean(gesture?.routeInput(action, options));

const dispatchDebugCommand = (
  action: string,
  at: number,
  options: {
    readonly backquoteGesture: BackquoteOrbitGesture | undefined;
    readonly debugTools: DebugRuntime | undefined;
    readonly facingYaw: number;
    readonly thirdPerson: boolean;
    readonly toggleReviewMap: () => void;
    readonly syncMenuState: () => void;
  },
): boolean => {
  if (!(action.startsWith('debug.') || action.startsWith('spawn.'))) {
    return false;
  }
  if (action === 'debug.review-map-toggle') {
    options.toggleReviewMap();
    return true;
  }
  options.backquoteGesture?.routeDebugAction({
    action,
    at,
    thirdPerson: options.thirdPerson,
    facingYaw: options.facingYaw,
    handleAction: () => options.debugTools?.handleAction(action),
  });
  options.syncMenuState();
  return true;
};

type InputReplayVerification = 'matched' | 'diverged' | 'unavailable' | undefined;
const INPUT_REPLAY_COLUMN_OVERFLOW_STOP_REASON =
  'a streamed-column batch exceeded the recording window; the recent replay was discarded';
const inputReplayStoppedStatus = (reason: string): string => `Recording stopped: ${reason}`;

const createReviewMapFrame = (debug: boolean): HTMLIFrameElement | undefined => {
  if (!debug) {
    return;
  }
  const frame = document.createElement('iframe');
  frame.title = 'Current-world review map';
  frame.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:var(--ui-layer-review-map);background:#d7ddd4';
  frame.hidden = true;
  document.body.append(frame);
  return frame;
};

const installReviewMapMessageListener = (
  frame: HTMLIFrameElement | undefined,
  onKey: (message: Record<string, unknown>) => void,
  onClose: () => void,
): void => {
  if (!frame) {
    return;
  }
  globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (
      event.origin !== globalThis.location.origin ||
      event.source !== frame.contentWindow ||
      typeof event.data !== 'object' ||
      event.data === null ||
      !('type' in event.data)
    ) {
      return;
    }
    const message = event.data;
    if (message.type === 'deadvox-review-map-key') {
      onKey(message as Record<string, unknown>);
    } else if (message.type === 'deadvox-review-map-close') {
      onClose();
    }
  });
};

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

const syncReadingProgress = (
  bookUid: number | undefined,
  action: TimedActionPresentation | undefined,
  setProgress: (progress: { readonly value: number; readonly max: number } | undefined) => void,
  bookIsComplete: (bookUid: number) => boolean,
): void => {
  if (bookUid === undefined) {
    return;
  }
  if (action?.kind === 'reading' && action.ownerUid === bookUid) {
    setProgress({ value: action.elapsed, max: action.duration });
    return;
  }
  setProgress(bookIsComplete(bookUid) ? { value: 1, max: 1 } : undefined);
};

type TimedLongJob = Extract<LongJob, { jobType: 'reading' | 'forceDoor' | 'treatment' | 'vehicleWork' }>;

const isTimedLongJob = (job: Readonly<LongJob>): job is TimedLongJob =>
  job.jobType === 'reading' ||
  job.jobType === 'forceDoor' ||
  job.jobType === 'treatment' ||
  job.jobType === 'vehicleWork';

const timedActionLabel = (job: TimedLongJob, inventory: Inventory): string => {
  const labels = actionText(inventory.registry).longActions;
  switch (job.jobType) {
    case 'reading': {
      const book = inventory.itemByUid(job.bookUid);
      return book ? fillText(labels.reading, { item: inventory.name(book) }) : labels.readingUnnamed;
    }
    case 'forceDoor':
      return labels.forcingPadlock;
    case 'treatment': {
      const item = inventory.itemByUid(job.itemUid);
      return item ? fillText(labels.treating, { item: inventory.name(item) }) : labels.treatingUnnamed;
    }
    case 'vehicleWork': {
      const text = screenTextOf(inventory.registry).vehicle;
      const item = inventory.itemByUid(job.itemUid);
      const part = item ? inventory.name(item) : '';
      return fillScreenText(job.kind === 'remove' ? text.removing : text.installing, { part });
    }
    default: {
      const unhandled: never = job;
      return unhandled;
    }
  }
};

const elapsedForPresentation = (
  job: TimedLongJob,
  simTime: number,
  clockRatio: number,
  compressionActive: boolean,
): number => {
  if (!compressionActive) {
    return job.elapsed;
  }
  const secondsPerSimSecond = job.jobType === 'reading' ? clockRatio : 1;
  return Math.min(job.duration, job.elapsed + Math.max(0, simTime - job.last) * secondsPerSimSecond);
};

interface HandlingPresentationOptions {
  readonly job: Readonly<LongJob> | undefined;
  readonly queue: HandlingPresentationSource;
  readonly inventory: Inventory;
  readonly simSeconds: number;
  readonly clockRatio: number;
  readonly compressionActive: boolean;
  readonly throwCharge?: HandlingPresentationSource['throwCharge'];
}

const screenTextOf = (registry: Engine['registry']) => registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText;

const handlingPresentationFor = ({
  job,
  queue,
  inventory,
  simSeconds,
  clockRatio,
  compressionActive,
  throwCharge,
}: HandlingPresentationOptions): HandlingPresentationSource => {
  if (throwCharge) {
    return { jobs: [], throwCharge };
  }
  const { cancel } = actionText(inventory.registry).hints;
  const inactive = {
    ...queue,
    cancelLabel: queue.cancelLabel ?? html`${fillParts(cancel, { key: keyCap('handling.stop') })}`,
  };
  if (!job || job.stopped || !isTimedLongJob(job)) {
    return inactive;
  }
  const action: TimedActionPresentation = {
    kind: job.jobType,
    ...(job.jobType === 'reading' ? { ownerUid: job.bookUid } : {}),
    label: timedActionLabel(job, inventory),
    duration: job.duration,
    elapsed: elapsedForPresentation(job, simSeconds, clockRatio, compressionActive),
    stopped: job.stopped,
  };
  return timedActionHandlingPresentation(action, screenTextOf(inventory.registry).handling);
};

const createPlayRefusalPresenter = (
  registry: Engine['registry'],
  audio: GameAudio,
  showNotice: (text: string) => void,
) => {
  const event = registry.ui.get(CORE_CONTENT_IDS.coreUi)!.refusalSound;
  const nope = registry.sounds.get(event)!;
  return createRefusalPresenter(
    showNotice,
    () => audio.preview(event, soundVariantKey(event, nope.variants[0]!)),
    nope.minIntervalSimSeconds,
  );
};

export interface StartPlayOptions {
  readonly tutorial?: boolean;
  readonly skyRoute?: SkyRouteAttachment;
  readonly handedness?: HandSide;
  readonly restore?: Readonly<SaveSnapshot>;
  readonly saveController?: SaveController;
  readonly loading?: { readonly owner: WorldLoading; readonly draw: () => void };
  readonly replay?: {
    readonly inputs: ReplayInputData;
    readonly endStateFingerprint: string;
    readonly endSimTimestamp: number;
    readonly startState: ReplayStartState;
  };
}

const playLoadingFor = (engine: Engine, options: StartPlayOptions) => {
  if (options.loading) {
    return options.loading;
  }
  const owner = new WorldLoading(engine, options.replay?.inputs.generatedColumns);
  return { owner, draw: mountWorldLoading(owner, screenTextOf(engine.registry).worldLoading) };
};

const configureReplayStreaming = (engine: Engine, replay: StartPlayOptions['replay']): void => {
  if (replay) {
    engine.streamer.setReplayControlled();
    engine.skylight?.setRecordedTerrain();
  }
};

const configureRestoreFailure = (streamer: Engine['streamer'], saveController: SaveController | undefined): void => {
  if (saveController) {
    streamer.onGenerationError = (error) => {
      if (!saveController.refuseRestore(error)) {
        throw error;
      }
    };
  }
};

const autosaveTuning = (registry: Engine['registry']) => {
  const autosave = registry.saves.get(CORE_CONTENT_IDS.autosave);
  if (!autosave) {
    throw new Error('Missing autosave tuning');
  }
  return autosave;
};

const assertPracticeIsolation = (options: StartPlayOptions): void => {
  if (options.tutorial && (options.saveController || options.restore)) {
    throw new Error('Practice cannot bind a save or restore a world');
  }
};

const leaveTutorial = () => location.assign(tutorialUrl(location.href, false));
const createPlayTutorial = (engine: Engine, enabled: boolean | undefined) => {
  if (!enabled) {
    return {};
  }
  const exitBeat = engine.site?.playtestMarks?.beats.find((beat) => beat.id === 'tutorial_exit');
  const lightKit = engine.site?.lightPractice;
  if (!(exitBeat && lightKit)) {
    throw new Error('Practice requires an authored exit and light module content');
  }
  const tutorial = new Tutorial(
    engine.spawn.pos.map((coordinate) => coordinate / engine.config.scale.blockSize) as Vec3,
    engine.spawn.yaw,
    exitBeat.area,
    lightKit,
  );
  const drawTutorial = mountTutorial(tutorial, screenTextOf(engine.registry).tutorial, leaveTutorial, () =>
    location.reload(),
  );
  return { tutorial, drawTutorial };
};

/** Says once, on the first live frame, that a focus fell back; loading and the main menu would use up its time. */
const focusNoticeOnce = (lines: ActionText, unknownFocus: string | undefined) => {
  let text = unknownFocus === undefined ? undefined : fillText(lines.play.focusUnknown, { focus: unknownFocus });
  return (live: boolean, show: (notice: string) => void): void => {
    if (live && text !== undefined) {
      show(text);
      text = undefined;
    }
  };
};

export const startPlay = (
  engine: Engine,
  debugModule?: DebugModule,
  options: StartPlayOptions = {},
): { enter: () => void } => {
  assertPracticeIsolation(options);
  const { config, registry, streamer, renderer, camera, meshes } = engine;
  const lines = actionText(registry);
  const restRefusals = { rest: lines.play.restRefused, sleep: lines.play.sleepRefused };
  const autosave = autosaveTuning(registry);
  const inputTarget = renderer?.domElement ?? $('view');
  const { owner: worldLoading, draw: drawWorldLoading } = playLoadingFor(engine, options);
  configureRestoreFailure(streamer, options.saveController);
  configureReplayStreaming(engine, options.replay);
  const { scale } = config;
  const s = scale.blockSize;
  const { tutorial, drawTutorial } = createPlayTutorial(engine, options.tutorial);

  const playerStart = playerStartFromWorld(engine, scale, config.debugStart, {
    restoring: options.restore !== undefined,
    focus: config.focus,
  });
  let debugTools: DebugRuntime | undefined;
  let replayPlayer: InputReplayPlayer | undefined;
  const shouldCancelForViewerFocus = (reason: InputCancellationReason): boolean =>
    shouldCancelInputForViewerFocus(reason, replayPlayer !== undefined);
  const input = new Input(
    inputTarget,
    () => !debugTools?.buildOn,
    () => shouldCancelForViewerFocus('window-blur'),
    () => worldLoading.ready && replayPlayer === undefined,
  );
  input.yaw = playerStart.yaw;
  let performHandUse: (hand: 'right' | 'left') => void = () => undefined;
  const playerSenseTuning = registry.senses.get(CORE_CONTENT_IDS.player);
  if (!playerSenseTuning) {
    throw new Error('Missing player sense tuning');
  }
  const {
    throwMaxDistanceMetres,
    throwChargeSimSeconds,
    throwMinimumHoldSimSeconds,
    throwStanceDropHoldRealSeconds,
    wornLightToggleHoldRealSeconds,
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
  const pendingPlayerTickActions = new PlayerTickActions();
  let interactionPressTarget: InteractionTarget | undefined;
  /** The vehicle opened by interacting with it; presentation only, so it is neither saved nor replayed. */
  let openedVehicleId: number | undefined;
  const furnitureActionSelection = new FurnitureActionSelection(actionText(registry).itemActions.openCan);
  const furnitureActions = (): ItemAction[] => [
    { id: 'push', label: 'Push' },
    { id: 'drag', label: 'Drag' },
  ];
  let audio: GameAudio;
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
    if (
      throwingStance ||
      action.kind !== 'firearm' ||
      action.item.firearm?.cylinder ||
      !firearmHandlingFor(action.item, registry).action.fire
    ) {
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
  const spectator = new SpectatorCamera();
  let thirdPersonViewEnabled = false;
  const thirdPersonOrbit = new ThirdPersonOrbit();
  let backquoteGesture: BackquoteOrbitGesture | undefined;
  let perceptionLabelsEnabled = false;
  const session = createSession({
    registry,
    scenario: engine.scenario,
    powerDevices: engine.powerDevices,
    objective: scenarioObjective(engine.site),
    discovery: scenarioDiscovery(engine.site),
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
    skyFields: engine.skyFields,
    registerVehicles: (owner) => {
      registerLayoutVehicles(owner, registry, config.site, s);
    },
    terrainFloor: (x, z) => engine.groundAt(x * s, z * s) / s,
    ...(options.restore ? { restore: options.restore } : {}),
    ready: (x, z) => streamer.isReady(x, z),
    zombieReady: (x, z) => replayPlayer?.isReady(x, z) ?? streamer.isReady(x, z),
    controls: spectator.guard({
      active: () => worldLoading.ready && (Boolean(options.replay) || (input.locked && !input.menuPointer)),
      intent: (): MoveIntent => input.intent(),
      sampleAtPlayerTick: samplePlayerInput,
      readyHeld: () => input.rightMouseHeld,
      aimingDownSights: () => input.aimingDownSights && input.rightMouseActionHeld,
      blocking: () => shouldPlayerBlock(),
      consumeDominantUse: () => input.consumeDominantUse(),
      consumeOffUse: () => input.consumeOffUse(),
      consumeStanceToggle: () => input.consumeStanceToggle(),
      useDominant: () =>
        routeDominantUse(throwingStance, beginItemThrow, () => {
          // Build-mode canvas clicks belong exclusively to the block editor, not the held-item action.
          const action = selectPrimaryAction(inventory);
          if (
            !(
              debugTools?.buildOn ||
              (action.kind === 'firearm' &&
                !action.item.firearm?.cylinder &&
                firearmHandlingFor(action.item, registry).action.fire !== undefined)
            )
          ) {
            performHandUse(dominantSide(inventory.character));
          }
        }),
      heldDominantUse: (time, pressed, triggerHeld) => {
        if (throwingStance) {
          magazines.advanceHeldStrip(undefined, time, false);
          if (!triggerHeld) {
            releaseItemThrow();
          }
          return;
        }
        if (sim.body.actionRefusal) {
          magazines.advanceHeldStrip(undefined, time, false);
          firearmTrigger.advance(time, undefined, pressed, triggerHeld);
          if (pressed) {
            showRefusal(sim.body.actionRefusal, sim.time);
          }
          return;
        }
        handleHeldDominantUse(time, pressed, triggerHeld);
        const action = selectPrimaryAction(inventory);
        const stripUid =
          action.kind === 'magazine' && survival.selectedItemAction(action.item)?.magazine === 'strip'
            ? action.item.uid
            : undefined;
        refusalReason(magazines.advanceHeldStrip(stripUid, time, triggerHeld));
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
      yaw: () => input.yaw,
      pitch: () => input.pitch,
      walking: () => input.walking,
      descending: () => keyboardInput.held('noclip.descend'),
    }),
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
    onRead: (request) => {
      reading.open(request);
      if (request.itemType) {
        playtestObserver?.readItem(request.itemType, sim.calendar);
      }
    },
    onHandlingOutcomes: (result) => playtestObserver?.handlingOutcomes(result),
    onConsumed: (type) => tutorial?.consumed(type),
    onHandlingOutcome: (item, outcome) => tutorial?.weapons.handling(item, outcome, registry),
    onDischarge: (item, sighted) => tutorial?.weapons.discharged(item, sighted, registry),
    onCompletedSwing: (isFist) => {
      if (tutorial?.stage === 'melee' && isFist) {
        tutorial.weapons.melee = true;
      }
    },
    onBatterySwapped: (lightType) => tutorial?.batterySwapped(lightType),
    onFirearmEjection: (effect) =>
      caseEffects.spawn({
        ...effect,
        landingPosition: caseLandingWorldPosition(
          effect.landingPosition,
          s,
          firearmsCombatTuning(registry).caseEjection.landingLiftMetres,
        ),
      }),
    onFirearmCaseLanded: (seed, item, instanceIndex) => {
      const location = inventory.locate(item);
      if (location?.kind !== 'pile') {
        return;
      }
      const placement = pileScatterPlacements({
        registry,
        pile: location.pile,
        worldSeed: config.seed,
        blockSize: s,
      }).filter(({ item: placed }) => placed.uid === item.uid)[instanceIndex];
      if (placement) {
        caseEffects.retarget(seed, placement.position);
      }
    },
    onFirearmTrajectory: ({ traces }) => view.impactEffects.fire(traces, config.debug && debugLaserEnabled),
    onDetonation: (at, radiusMetres) => view.blastFlashes.spawn(at, radiusMetres),
    onFuseLit: (item) => {
      const model = registry.items.get(item.type)?.model;
      const lever = model ? registry.models.get(model)?.lever : undefined;
      if (lever) {
        view.leverProps.lit(item.uid, lever);
      }
    },
    onBlock: (jolt) => view.block(jolt),
    onAcidImpact: (position, type) => view.acidEffects.splash(position, type.acidSpit!.presentation),
    debug: () => debugTools,
    // Presentation only: what the simulation decided (a part severed, a zombie dead) drawn as debris and a
    // corpse, and blood for every wound. Only MobActorMeshes implements the zombie hooks; ZombieMeshes leaves
    // them undefined.
    zombieEffects: {
      onWound: (_id, _zombie, hit, damage) => view.gore.spray(hit, damage),
      onSever: (id, zombie, part, hit) => zombieMeshes.zombieSevered?.(id, part, hit, zombie),
      onCarve: (id, zombie, cells, hit) => {
        zombieMeshes.zombieCarved?.(id, zombie, cells, hit);
        view.gore.carved(hit, cells.length);
      },
      onIncapacitated: (id, zombie) => zombieMeshes.zombieIncapacitated?.(id, zombie),
      onDeath: (id, zombie) => zombieMeshes.zombieDied?.(id, zombie, [...body.pos]),
      ...(config.debug ? { onMeleeResult: (result) => debugTools?.recordMeleeResult(result) } : {}),
      onMeleeContact: (impulse) => view.recoil(impulse),
    },
  });
  audio = new GameAudio({
    registry,
    blockSize: s,
    isSolid: session.isSoundBlocking,
    tuning: playerSenseTuning,
    report: (message) => {
      const errors = $('errors');
      errors.textContent = [errors.textContent, message].filter(Boolean).join('\n');
    },
  });
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

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
  const playHalted = { value: false };
  const opticZoom = new OpticZoom(registry);
  const zoomFirearm = () => {
    const selected = selectPrimaryAction(inventory);
    return selected.kind === 'firearm' ? selected.item : undefined;
  };
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
  const unpacking = new Unpacking(inventory, queue, feet, {
    calendar: () => sim.calendar,
    opened: (type) => tutorial?.opened(type),
    unpacked: (type) => tutorial?.weapons.unpackedAmmo(type),
  });
  const sharpening = new Sharpening(inventory, queue, {
    character: session.character,
    reach: () => session.reach(),
    clockRatio: sim.clock.ratio,
  });
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
      debug: config.debug,
      source: engine.site,
    });
  }
  const { load: applyColumnLoad, unload: applyColumnUnload } = columnArrival(session, engine);
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
  const view = createPlayView(
    engine,
    inventory,
    (message) => {
      const box = $('errors');
      box.textContent = [box.textContent, message].filter(Boolean).join('\n');
    },
    { poweredLights: () => session.power?.lights() ?? [], physicalSolid: session.physicalSolid },
  );
  input.setMouseLookOverride((movementX, movementY) =>
    thirdPersonOrbit.rotate(movementX, movementY, isPlayerThirdPersonView(thirdPersonViewEnabled, spectator.enabled)),
  );
  const { weather, caseEffects, itemThrows, impactEffects, flashlight, zombieMeshes } = view;
  const damageEvents = sim.events.reader();

  // ---- UI ----

  const overlay = $('overlay');
  const gameCursor = mountGameCursor($('game-cursor-root'));
  const inventoryPanel = $('inventory');
  let stopReadingOnClose: () => void = () => undefined;
  const { screenText } = registry.ui.get(CORE_CONTENT_IDS.coreUi)!;
  const reading = mountReading(
    $('reading'),
    screenText.reading,
    () => syncMenuState(),
    () => stopReadingOnClose(),
  );
  const isBookComplete = (bookUid: number): boolean => {
    const book = inventory.itemByUid(bookUid);
    const definition = book && registry.items.get(book.type);
    return Boolean(definition?.book?.recipes.every((recipe) => session.character.knownRecipes.has(recipe)));
  };
  const hud = $('hud');
  const hudOptions = readHudOptions();
  const hudOptionsText = {
    labels: screenText.hudOptionLabels,
    heading: screenText.options.hudHeading,
    showHud: screenText.options.showHud,
  };
  const drawHudOptions = () =>
    renderHudOptions($('hud-options'), hudOptionsText, hudOptions, (key, value) => {
      hudOptions[key] = value;
      writeHudOptions(hudOptions);
      drawHudOptions();
    });
  drawHudOptions();
  const prompt = $('prompt');
  const itemActionList = $('item-action-list');
  const quickbarBox = $('quickbar');
  const handlingBox = $('handling');
  const restBox = $('rest');
  $('errors').textContent = [$('errors').textContent, engine.contentErrors].filter(Boolean).join('\n');
  renderAudioOptions(
    $('audio-options'),
    {
      labels: screenText.audioVolumeLabels,
      heading: screenText.options.audioHeading,
      volume: screenText.options.volume,
    },
    audio.settings,
    (category, value) => audio.setVolume(category, value),
  );
  renderGraphicsOptions($('graphics-options'), engine.graphics, screenText.options);

  /** A message that isn't an interruption, such as why a move was refused. */
  let notice = '';
  let noticeUntil = 0;
  const bleedingNotice = new TierNotice(sim.body.worstBleedingTier);
  const painNotice = new TierNotice(sim.body.pain.tier);
  const showNotice = (text: string) => {
    notice = text;
    noticeUntil = realNow() + 3000;
  };
  const updateBodyNotices = (): void => {
    painNotice.update(sim.body.pain.tier, sim.body.tuning.pain.tiers, showNotice);
    // Bleeding speaks last, so on a shared frame its line, which asks for treatment, is the one shown.
    bleedingNotice.update(sim.body.worstBleedingTier, sim.body.tuning.bleeding.tiers, showNotice);
  };
  const painTierDef = (): BodyTuningDef['pain']['tiers'][number] | undefined => {
    const { tier } = sim.body.pain;
    return tier === undefined ? undefined : sim.body.tuning.pain.tiers[tier];
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
      showRefusal(fillText(restRefusals[kind], { reason }), sim.time);
    }
  };

  // ---- furniture: searching and doors ----

  const toggleDoor = (entity: BlockEntity) => {
    if (entity.lock?.locked && Object.keys(entities.defOf(entity).door?.methods ?? {}).length > 0) {
      const plan = pryPlan(inventory, entity, undefined, session.character);
      if (!plan.ok) {
        showRefusal(plan.reason, sim.time);
        return;
      }
      queue.cancel();
      const reason = session.forceDoor(entity, plan.tool.uid, plan.method);
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
    const label = fillText(lines.doors.operate, { action: option.label, door: nameOf(entity) });
    queue.enqueueAction(DOOR_ACTION, label, option.plan.time, {
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
    const label = fillText(operation === 'lock' ? lines.doors.lock : lines.doors.unlock, { door: nameOf(entity) });
    queue.enqueueAction(DOOR_ACTION, label, plan.time, {
      entityUid: entity.uid,
      locked: operation === 'lock',
    });
  };

  /** Sets a held bar across the door or lifts the bar off it, from the side the player stands on. */
  const enqueueDoorBar = (entity: BlockEntity, barring: boolean): string | undefined => {
    const plan = doorPlan(inventory, entity, barring ? 'bar' : 'unbar');
    if (!plan.ok) {
      return plan.reason;
    }
    const label = barring
      ? fillScreenText(screenText.interaction.barDoor, { name: nameOf(entity) })
      : screenText.interaction.liftBar;
    queue.enqueueAction(DOOR_ACTION, label, plan.time, { entityUid: entity.uid, barring });
    return undefined;
  };

  const activateBar = () => {
    const entity = lookedAt();
    const reason = entity && entities.defOf(entity).door ? enqueueDoorBar(entity, true) : undefined;
    if (reason) {
      showRefusal(reason, sim.time);
    }
  };

  const hooks: ScreenHooks = {
    charger: (entity) => chargerPanel(entity, session.power, session.reach()),
    chargerRevision: () => Math.floor(sim.time),
    openedVehicle,
    pictures: view.pictures,
    itemView: view.pictures,
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
    describe: (item) => {
      tutorial?.weapons.inspected(item, registry);
      return [
        ...survival.describe(item),
        ...firearms.describe(item),
        ...magazines.describe(item),
        ...pinDescription(session.fuses.state(item)),
      ];
    },
    workOptions: (uid) => session.crafting.options(uid),
    character: () => session.character,
    body: () => sim.body,
    slotLabels: registry.ui.get(CORE_CONTENT_IDS.coreUi)!.wearSlotLabels,
    needs: () => needsText(),
    wakeGameHour: () => (rest.canSetWakeTime ? { gameHour: rest.wakeGameHour } : undefined),
    actionRefusal: () => sim.body.actionRefusal,
    attachmentCandidates: (firearmUid, slotId) => session.firearmAttachments.candidates(firearmUid, slotId),
  };
  const screen = new InventoryScreen(inventoryPanel, inventory, queue, hooks);

  const craftPanel = mountCraftPanel($('crafting'), $('craft-status'), session, {
    notice: (text) => showRefusal(text, sim.time),
    dispatch: dispatchScreenCommand,
  });

  let revealZombies = false;
  const storedMetrics = (() => {
    try {
      return engine.scenario ? null : loadMetrics(config.seed, localStorage);
    } catch {
      // Storage can be disabled; metrics start fresh for this run.
      return null;
    }
  })();
  const metrics = new SessionMetrics(config.seed, storedMetrics);
  playtestObserver = new PlaytestObserver(metrics, engine.site?.playtestMarks);
  const saveMetrics = (): void => {
    if (engine.scenario || options.tutorial) {
      return;
    }
    try {
      persistMetrics(metrics, localStorage);
    } catch {
      /* Storage can be disabled; gameplay remains available. */
    }
  };
  const attemptMetricsFile = (): HandBackFile => {
    if (!session.scenarioRun) {
      return metricsFile(metrics);
    }
    const snapshot = captureSnapshot();
    return {
      name: `deadvox-attempt-${snapshot.character.id}.json`,
      blob: new Blob(
        [
          JSON.stringify(
            {
              build: getBuildRevision(),
              saveIdentity: options.saveController?.namespace || null,
              site: config.site,
              seed: sim.seed,
              worldId: snapshot.world.id,
              characterId: snapshot.character.id,
              outcome: (sim.dead && 'dead') || (session.won && 'won') || 'running',
              death: sim.dead ?? null,
              run: session.scenarioRun,
              elapsedGameSeconds: sim.calendar - session.scenarioRun.startedAtGameTimestamp,
              searched: snapshot.character.inventory.entities.entities.filter((entity) => entity.searched).length,
              looted: snapshot.character.inventory.looted,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    };
  };
  const exportMetrics = (): void => downloadFile(attemptMetricsFile());
  const measureSnapshot = () => playtestObserver!.measureSnapshot(captureSnapshot, session);
  const openInventoryScreen = (): void => {
    screen.open();
  };
  const closeInventoryScreen = (): void => {
    openedVehicleId = undefined;
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
  bindPlayErrorReport({
    config,
    sim,
    input,
    metricsFile: attemptMetricsFile,
    exportReplay: inputReplayHooks.export,
    halted: playHalted,
    saveController: options.saveController,
  });
  const handBackStatus = $('playtest-export-status');
  const handBack = async (file: () => HandBackFile | Promise<HandBackFile>): Promise<void> => {
    try {
      const saved = await file();
      downloadFile(saved);
      handBackStatus.textContent = `Saved ${saved.name}`;
    } catch (error) {
      handBackStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  };
  // Assigned, not added: a later world on this page must not save each file twice.
  $('playtest-metrics-export').onclick = () => handBack(attemptMetricsFile);
  $('playtest-replay-export').onclick = () =>
    handBack(async () => replayFile(await inputReplayHooks.export(), new Date()));
  $('playtest-export').hidden = false;
  let reviewMapOpen = false;
  const reviewMapFrame = createReviewMapFrame(config.debug);
  const toggleReviewMap = (open = !reviewMapOpen): void => {
    if (open === reviewMapOpen || !reviewMapFrame) {
      return;
    }
    reviewMapOpen = open;
    reviewMapFrame.hidden = !open;
    if (open) {
      debugTools?.closeMenus();
      const mapUrl = new URL('map.html', globalThis.location.href);
      mapUrl.searchParams.set('overlay', '1');
      mapUrl.searchParams.set('debug', '1');
      mapUrl.searchParams.set('seed', String(config.seed));
      mapUrl.searchParams.set('site', config.site);
      mapUrl.searchParams.set('storeys', String(config.storeys));
      if (config.density !== null) {
        mapUrl.searchParams.set('density', String(config.density));
      }
      const x = body.pos[0] * s;
      const z = body.pos[2] * s;
      mapUrl.searchParams.set('centerX', String(x));
      mapUrl.searchParams.set('centerZ', String(z));
      mapUrl.searchParams.set('playerX', String(x));
      mapUrl.searchParams.set('playerZ', String(z));
      mapUrl.searchParams.set('playerYaw', String(input.yaw));
      reviewMapFrame.src = mapUrl.href;
      input.unlock();
      input.cancel();
    } else {
      reviewMapFrame.src = 'about:blank';
    }
    syncMenuState();
    if (!open && started && !input.locked) {
      resume();
    }
    keyboardInput.sync();
  };
  const routeReviewMapKey = (message: Record<string, unknown>) => {
    if (typeof message.code !== 'string' || (message.phase !== 'down' && message.phase !== 'up')) {
      return;
    }
    const keyEvent = {
      code: message.code,
      shiftKey: message.shiftKey === true,
      altKey: message.altKey === true,
      ctrlKey: message.ctrlKey === true,
      metaKey: message.metaKey === true,
      repeat: message.repeat === true,
      isComposing: message.isComposing === true,
    };
    if (message.phase === 'down') {
      keyboardInput.pressForwarded(keyEvent);
    } else {
      keyboardInput.releaseForwarded(keyEvent);
    }
  };
  installReviewMapMessageListener(reviewMapFrame, routeReviewMapKey, () => toggleReviewMap(false));
  const thirdPerson = {
    enabled: () => thirdPersonViewEnabled,
    toggle: () => {
      thirdPersonViewEnabled = !thirdPersonViewEnabled;
      thirdPersonOrbit.reset();
      cancelBackquoteGesture(backquoteGesture);
    },
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
    reviewMap: { isOpen: () => reviewMapOpen, toggle: () => toggleReviewMap() },
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
      enabled: () => spectator.enabled,
      toggle: () => {
        cancelHeldInput();
        spectator.toggle(body, eye(), input.yaw, input.pitch);
      },
      teleport: () => spectator.teleport(body, session.playerEyeHeightMetres / s, engine.isSolid),
    },
    thirdPerson,
    mannequin: view.avatarMannequin,
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
  globalThis.addEventListener('beforeunload', (event) => {
    if (
      shouldConfirmPageLeave({
        gameRunning: started,
        gameDead: sim.dead !== undefined,
        saveAvailable: options.saveController?.canSaveCurrentGame ?? false,
        lastSaveCompletedAtRealTimestamp: options.saveController?.lastCompletedSaveRealTimestamp,
        nowRealTimestamp: realTimestamp(performance.now() / 1000),
        confirmationWindowRealSeconds: autosave.leaveConfirmationRealSeconds,
      })
    ) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  let mainMenuOpen = !options.replay;
  let resumeRequested = false;
  const titleMenuOptions = () =>
    started || !options.saveController ? {} : { titleNewWorldLabel: options.saveController.titleNewWorldLabel };
  const syncMenuState = (pointerLockChanged = false) => {
    const state = computeMenuState({
      started,
      mainMenuOpen,
      inventoryOpen: screen.isOpen,
      readingOpen: reading.isOpen,
      debugMenuOpen: debugTools?.menuOpen ?? false,
      reviewMapOpen,
      pointerLocked: input.locked || Boolean(options.replay),
      dead: sim.dead !== undefined || session.won,
      pointerLockChanged,
      resumeRequested,
      ...titleMenuOptions(),
      goLabels: screenText.menu,
      titleActive: Boolean(options.saveController && !options.saveController.isEntered),
    });
    ({ started, mainMenuOpen } = state);
    if (state.paused) {
      furnitureActionSelection.sync(undefined, true);
    }
    if (pointerLockChanged || state.closeOtherMenus) {
      resumeRequested = false;
    }
    if (state.closeOtherMenus) {
      reading.close();
      closeInventoryScreen();
      debugTools?.closeMenus();
    }
    input.menuPointer = state.menuPointer || !worldLoading.ready;
    keyboardInput.sync();
    overlay.hidden = state.overlayHidden;
    $('go').hidden = state.showGo === false;
    if (options.saveController) {
      options.saveController.setGoLabel(state.goLabel);
    } else {
      $('go').textContent = state.goLabel;
    }
    return state;
  };
  const updateWorldLoading = (now: RealTimestamp) => {
    const wasReady = worldLoading.ready;
    worldLoading.check(body.pos, now, [camera.position.x / s, camera.position.y / s, camera.position.z / s]);
    drawWorldLoading();
    if (worldLoading.state === 'failed') {
      input.unlock();
    } else if (worldLoading.ready && !wasReady) {
      input.cancel();
      keyboardInput.cancel();
      sim.paused = syncMenuState().paused || (debugTools?.frozen ?? false);
      replayPlayState.restore(options.replay?.startState);
      inputRecorder = createInputReplayRecorder(
        Boolean(options.replay),
        captureSnapshot,
        streamer.generatedColumns(),
        captureReplayStartState,
      );
    }
  };
  const resume = () => {
    if (replayPlayer || sim.dead || session.won || playHalted.value) {
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
      showRefusal(fillText(lines.play.restRefused, { reason: result.reason }), sim.time);
    }
  };

  /** Debug time skip: the simulation time it runs to, while one is running. */
  let skipUntil: number | undefined;
  /** Ends the skip exactly on target: snapping c to 1 keeps the ramp-down from running past it. */
  const endSkip = (): void => {
    skipUntil = undefined;
    compression.stop();
    compression.snap();
  };

  /**
   * Debug: fast-forwards the real clock by `hours` game hours through the same compressed
   * stepping as rest (needs, scheduler and shamblers all run). Another call
   * during a skip pushes the target out. It replaces a rest/sleep in progress.
   */
  const skipGameHours = (hours: number): void => {
    if (sim.actions.job?.jobType === 'forceDoor' || sim.actions.job?.jobType === 'wait') {
      sim.actions.stop();
    } else {
      rest.stop();
    }
    queue.cancel();
    skipUntil = skipTarget(sim.clock, skipUntil ?? sim.time, hours);
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
      showRefusal(fillText(lines.play.continueRefused, { reason }), sim.time);
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
    if (rest.action || continueActionResumesJob(sim.actions.job?.jobType)) {
      const reason = rest.action ? rest.resume() : sim.actions.resume();
      if (reason) {
        showRefusal(fillText(lines.play.continueRefused, { reason }), sim.time);
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
      sim.actions.job?.jobType === 'wait' ||
      sim.actions.job?.jobType === 'reading' ||
      sim.actions.job?.jobType === 'forceDoor' ||
      sim.actions.job?.jobType === 'treatment' ||
      sim.actions.job?.jobType === 'vehicleWork'
    ) {
      sim.actions.stop();
    } else if (rest.action) {
      rest.stop();
    } else {
      compression.stop();
    }
  };
  stopReadingOnClose = () => stopReadingPageOnClose(sim);

  const replayCommandOwners: ReplayCommandOwners = {
    pour: (sourceUid, receiverUid) => survival.pour(sourceUid, receiverUid),
    charger: session.chargerControl,
    power: session.powerControl,
    inventory,
    queue,
    quickbar,
    search: (uid) => {
      const entity = entities.byUid(uid);
      if (!entity) {
        return lines.common.gone;
      }
      playtestObserver?.beginSearch(entity, nameOf(entity));
      return search(entity);
    },
    work: actOnWork,
    vehicleWork: session.beginVehicleWork,
    fitAttachment: (firearmUid, slotId, attachmentUid) =>
      session.firearmAttachments.fit(firearmUid, slotId, attachmentUid),
    removeAttachment: (firearmUid, slotId) => session.firearmAttachments.remove(firearmUid, slotId),
    loadBattery: (lightUid, batteryUid) => survival.loadBattery(lightUid, batteryUid),
    toHands: (uid, feetPosition) => {
      const item = inventory.itemByUid(uid);
      return item ? toHands(inventory, queue, item, feetPosition) : lines.common.gone;
    },
    pickup: pickupGroundItem,
    interact: interactFurniture,
    lift: (uid, floorLocked) => {
      const entity = entities.byUid(uid);
      return entity?.bar ? enqueueDoorBar(entity, false) : session.liftFurniture(uid, floorLocked);
    },
    useFurniture: (uid): string | undefined => {
      const entity = entities.byUid(uid);
      if (!entity) {
        return 'It is no longer there';
      }
      useTarget(entity);
      return undefined;
    },
    slide: (uid, way) => session.slideFurniture(uid, way),
    place: (pos) => session.placeFurniture(pos),
    turn: () => session.turnFurniture(),
    tip: () => session.tipFurniture(),
    clearDownedBody: (id, way) => session.clearDownedBody(id, way),
    craftStart: (recipeId, preference) => session.crafting.start(recipeId, preference),
    craftContinue: () => {
      continueAction();
    },
    craftStop: () => {
      stopAction();
    },
    wait: () => sim.actions.startWait(),
    setWakeGameHour: (gameHour) => {
      rest.wakeGameHour = gameHour;
    },
    cancelItemThrow,
    throwItem: throwRecordedItem,
  };
  const applyScreenCommand = (payload: ReplayActionPayload): string | undefined => {
    const reason = applyReplayActionPayload(payload, replayCommandOwners);
    if (reason) {
      return reason;
    }
    if (payload.kind === 'craft.start' || payload.kind === 'action.wait' || payload.kind === 'vehicle.work') {
      closeInventoryScreen();
      syncMenuState();
    }
    return undefined;
  };
  const dispatchScreenCommandWithCompletion = createScreenCommandDispatcher({
    isReplaying: () => replayPlayer !== undefined,
    inputRecorder: () => inputRecorder,
    inputContext: () => inputContext(),
    pendingPlayerTickActions,
    apply: applyScreenCommand,
    inventory,
    notice: hooks.notice,
    refusal: (reason) => showRefusal(reason, sim.time),
  });
  function dispatchScreenCommand(payload: ReplayActionPayload): string | undefined {
    return dispatchScreenCommandWithCompletion(payload);
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
      showRefusal(fillText(lines.play.quickbarEmpty, { slot: slot + 1 }), sim.time);
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
  const wornLightInput = new PressHoldInput<string>({
    holdRealMs: () => wornLightToggleHoldRealSeconds * 1000,
    tap: () => undefined,
    hold: () => toggleWornLights(),
  });
  const toggleHud = (): void => {
    hudOptions.shown = !hudOptions.shown;
    writeHudOptions(hudOptions);
    drawHudOptions();
  };
  backquoteGesture = new BackquoteOrbitGesture({
    holdRealMs: keyboardInput.registry.binding('hud.toggle')?.holdMs ?? 0,
    orbit: thirdPersonOrbit,
    canToggleHud: () => sim.body.actionRefusal === undefined,
    toggleHud,
    toggleDebugPanel: () => toggleBackquoteDebugPanel(debugTools, syncMenuState),
  });
  globalThis.addEventListener('blur', () => {
    quickbarInput.cancel();
    throwStanceInput.cancel();
    interactInput.cancel();
    wornLightInput.cancel();
    interactionPressTarget = undefined;
    cancelBackquoteGesture(backquoteGesture);
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
      session.throwCharge.startedAt !== undefined
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
    const target = reloadTarget(firearms, magazines, lines.play.notHoldingGun);
    if (!target) {
      return;
    }
    // A reload works the firearm with both hands, so a hand on a ladder refuses it.
    const ladder = (): string | undefined => {
      const hand = session.ladderHold.hand();
      return hand && session.ladderHold.refusal(hand);
    };
    return {
      uid: target.uid,
      busy: () => queue.busy || firearms.busy,
      oneAction: target.oneAction,
      load: () => admit('firearm.load', ladder() ?? target.load(sim.time)),
      rack: () => admit('firearm.rack', ladder() ?? target.rack(sim.time)),
      remove: () => admit('firearm.remove', ladder() ?? target.remove(sim.time)),
      ...(target.stillLoaded ? { stillLoaded: target.stillLoaded } : {}),
      cancelLoad: target.cancelLoad,
      ...(target.releaseLoad ? { releaseLoad: () => target.releaseLoad!(sim.time) } : {}),
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
    return debugTools?.noclip || spectator.enabled ? 'noclip' : footContext();
  };
  const footContext = (): InputContext => (entities.carrying() ? 'carrying' : 'play');
  const inputContext = (): InputContext => {
    if (!worldLoading.ready) {
      return 'title';
    }
    if (reviewMapOpen) {
      return 'review-map';
    }
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
    cancelBackquoteGesture(backquoteGesture);
    cancelItemThrow();
    throwStanceInput.cancel();
    quickbarInput.cancel();
  };
  keyboardInput.escape = () => {
    if (sim.dead) {
      if (reviewMapOpen) {
        toggleReviewMap(false);
      }
      modalCommand('ui.main-menu-toggle');
    } else if (reviewMapOpen) {
      toggleReviewMap(false);
    } else {
      reading.close();
    }
  };
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
        withUnlockedInput(() => input.requestStanceToggle('crouch'));
        break;
      case 'player.prone-toggle':
        withUnlockedInput(() => input.requestStanceToggle('prone'));
        break;
      case 'player.throw':
        withUnlockedInput(() => throwStanceInput.keyDown(action, at));
        break;
      case 'light.worn-toggle':
        withUnlockedInput(() => wornLightInput.keyDown(action, at));
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
        carryCommand(action);
        break;
    }
    assignQuickbarIfUnlocked(slot, at);
  };
  const CarryCommands: Readonly<Record<string, 'furniture.turn' | 'furniture.tip'>> = {
    'carry.turn': 'furniture.turn',
    'carry.tip': 'furniture.tip',
  };
  const carryCommand = (action: string): void => {
    const kind = CarryCommands[action];
    const reason = kind && dispatchScreenCommand({ kind });
    if (reason) {
      showRefusal(reason, sim.time);
    }
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
    if (action === 'light.worn-toggle') {
      wornLightInput.keyUp(action, at);
    }
    if (slot !== undefined) {
      quickbarInput.keyUp(slot, at);
    }
  };
  const quickbarSlotFor = (action: string): number | undefined =>
    action.startsWith('quickbar.use.') ? Number(action.slice('quickbar.use.'.length)) - 1 : undefined;
  const handleDebugCommand = (action: string, at: number): boolean =>
    dispatchDebugCommand(action, at, {
      backquoteGesture,
      debugTools,
      facingYaw: input.yaw,
      thirdPerson: isPlayerThirdPersonView(thirdPersonViewEnabled, spectator.enabled),
      toggleReviewMap,
      syncMenuState,
    });
  const handleHintCommand = (action: string, phase: InputCommand['phase'], at: number): boolean =>
    routeBackquoteInput(backquoteGesture, action, {
      phase,
      at,
      thirdPerson: isPlayerThirdPersonView(thirdPersonViewEnabled, spectator.enabled),
      debugPanelAvailable: keyboardInput.held('debug.gate'),
      facingYaw: input.yaw,
    });
  const cancelHeldInput = (): void => {
    input.reload.cancel();
    throwStanceInput.cancel();
    cancelItemThrow();
    quickbarInput.cancel();
    interactInput.cancel();
    wornLightInput.cancel();
    interactionPressTarget = undefined;
    cancelBackquoteGesture(backquoteGesture);
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
    resetOrbitOnLocomotion(action, thirdPersonOrbit);
    sim.actions.cancelWaitForMovement(action);
    if (action === 'ui.main-menu-toggle') {
      modalCommand(action);
      return;
    }
    if (handleDebugCommand(action, at)) {
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
    if (!worldLoading.ready || (replayPlayer && !fromReplay) || !spectator.allowsCommand(action)) {
      return;
    }
    const context = inputContext();
    const payloadBackedScreenAction =
      (context === 'inventory' &&
        ((action.startsWith('inventory.') && !['inventory.previous', 'inventory.next'].includes(action)) ||
          action.startsWith('quickbar.assign.') ||
          action === 'handling.stop')) ||
      action === 'craft.continue' ||
      action.startsWith('carry.');
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
      case 'light.worn-toggle':
        toggleWornLights();
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
  const cycleFurnitureAction = (deltaY: number): boolean => {
    const target = interactionTargetAt();
    return (
      target?.kind === 'furniture' &&
      furnitureActionSelection.isOpen(target.entity) &&
      furnitureActionSelection.step(target.entity, furnitureActions(), Math.sign(deltaY))
    );
  };
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
      } else if (input.locked && !input.menuPointer && !spectator.enabled) {
        if (cycleFurnitureAction(e.deltaY) || opticZoom.wheel(zoomFirearm(), isAimingDownSights(), e.deltaY)) {
          e.preventDefault();
        } else if (debugTools?.buildOn || !cycleWieldedAction(e.deltaY)) {
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

  /** Part boxes for picking: the same projection vehicle reach measures to. */
  const currentVehicleParts = () => session.vehicleParts.all();

  /** The nearest visible furniture panel, cell or vehicle part in the crosshair. */
  const interactionTargetAt = (): InteractionTarget | undefined =>
    pickInteractionTarget({
      inventory,
      entities,
      origin: eye(),
      direction: lookDir(),
      maxDistance: reachTuning(registry).useReachMetres / s,
      blockSize: s,
      worldSeed: config.seed,
      // Vehicles take part through their part boxes, so the cell queries leave them out.
      isSolid: engine.isSolid,
      isOpaque: engine.isOpaque,
      vehicleParts: currentVehicleParts(),
      throughLadders: session.ladderHold.on,
      hasModel: (id) => view.models.has(id),
      downedBodies: [...session.zombieStore.entries()]
        .filter(([, zombie]) => zombie.incapacitated)
        .map(([id, zombie]) => ({ id, body: zombie.body })),
    });
  const lookedAt = (): BlockEntity | undefined => {
    const target = interactionTargetAt();
    return target?.kind === 'furniture' ? target.entity : undefined;
  };

  /** The open cell in front of the surface in the crosshair, or at the end of reach when none is near. */
  const aimedCell = (): [number, number, number] => {
    const origin = eye();
    const direction = lookDir();
    const reach = reachTuning(registry).useReachMetres / s;
    const hit = raycast(origin, direction, reach, session.physicalSolid);
    const cell = hit
      ? hit.block.map((coordinate, axis) => coordinate + hit.normal[axis]!)
      : origin.map((coordinate, axis) => Math.floor(coordinate + direction[axis]! * reach));
    return [cell[0]!, cell[1]!, cell[2]!];
  };
  const liftable = (entity: BlockEntity): boolean => movableRefusal(inventory, entity, s) === undefined;

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
    const hint = operation === 'lock' ? lines.doors.lockHint : lines.doors.unlockHint;
    return plan.ok ? hint : fillText(lines.doors.refusedHint, { hint, reason: plan.reason });
  };

  const barHint = (entity: BlockEntity): string | undefined => {
    if (!heldDoorBar(inventory)) {
      return undefined;
    }
    const plan = doorPlan(inventory, entity, 'bar');
    return plan.ok
      ? screenText.interaction.bar
      : fillScreenText(screenText.interaction.blocked, { action: screenText.interaction.bar, reason: plan.reason });
  };

  const pryHint = (entity: BlockEntity): string | undefined => {
    if (!(entity.lock?.locked && Object.keys(entities.defOf(entity).door?.methods ?? {}).length > 0)) {
      return undefined;
    }
    const plan = pryPlan(inventory, entity, undefined, session.character);
    const { doors } = lines;
    if (plan.ok) {
      return fillText(doors.pryWith, { tool: inventory.name(plan.tool).toLowerCase() });
    }
    const tools = plan.toolNames.map((name) => name.toLowerCase()).join(doors.toolSeparator) || doors.anyTool;
    return fillText(doors.pryWithAny, { tools, reason: plan.reason });
  };

  const downedBodyHint = (id: EntityId): HintText => {
    const finish = session.downedBodyPlan(id, 'finish-off');
    if (!finish.ok) {
      return finish.reason;
    }
    const dismember = session.downedBodyPlan(id, 'dismember');
    const values = { key: keyCap('world.interact'), finish: finish.label.toLowerCase() };
    return html`${
      dismember.ok
        ? fillParts(lines.hints.downedBody, values)
        : fillParts(lines.hints.downedBodyRefused, { ...values, reason: dismember.reason.toLowerCase() })
    }`;
  };

  /** Describes the displayed action for the selected target. */
  const useText = (entity: BlockEntity): HintText => {
    if (session.isObjective(entity)) {
      return html`${fillParts(lines.hints.activate, { key: keyCap('world.interact'), name: nameOf(entity) })}`;
    }
    const door = entities.defOf(entity).door ? doorOptions(inventory, entity)[0] : undefined;
    const prying = pryHint(entity);
    const doorReason = !prying && door?.plan.ok === false ? door.plan.reason : undefined;
    return playInteractionText(
      {
        doorReason,
        lock: keyLockHint(entity) ?? (entities.defOf(entity).door ? barHint(entity) : undefined),
        prying,
        door: Boolean(entities.defOf(entity).door),
        open: entity.open,
        container: Boolean(entity.pockets),
        readable: Boolean(entities.defOf(entity).readable),
        climbable: Boolean(entities.defOf(entity).climbable),
        restAction: restKindForFurniture(entities.defOf(entity)),
        searched: entity.searched,
        name: nameOf(entity),
        fullName: entities.defOf(entity).name,
        damage: damageWord(entities.registry, entities.conditionOf(entity)),
      },
      screenText.interaction,
    );
  };

  const furniturePayload = (entity: BlockEntity, mode: 'pocket' | 'wield'): ReplayActionPayload => {
    const control = session.power?.control(entity);
    if (control) {
      return { kind: 'power.set', entityUid: entity.uid, enabled: !control.enabled };
    }
    if (slidableFurniture(inventory, entity, s) && furnitureActionSelection.isOpen(entity)) {
      const selected = furnitureActionSelection.confirm(entity, furnitureActions())!;
      return selected.id === 'drag'
        ? { kind: 'furniture.lift', entityUid: entity.uid, floorLocked: true }
        : { kind: 'furniture.slide', entityUid: entity.uid, way: 'push' };
    }
    if (mode === 'wield' && slidableFurniture(inventory, entity, s)) {
      return { kind: 'furniture.interact', entityUid: entity.uid, alternatives: true };
    }
    return mode === 'wield' && liftable(entity)
      ? { kind: 'furniture.lift', entityUid: entity.uid }
      : { kind: 'furniture.interact', entityUid: entity.uid };
  };

  /**
   * A tap pockets an item or finishes off a downed body; a hold wields the item, dismembers
   * the body or lifts a piece small enough to carry.
   */
  function interactionPayload(
    target: Exclude<InteractionTarget, { kind: 'vehicle' }>,
    mode: 'pocket' | 'wield',
  ): ReplayActionPayload {
    switch (target.kind) {
      case 'item':
        return { kind: 'item.pickup', itemUid: target.item.uid, mode, feet: feet() };
      case 'body':
        return { kind: 'zombie.downed', zombieId: target.id, way: mode === 'pocket' ? 'finish-off' : 'dismember' };
      default:
        return mode === 'wield' && target.entity.bar
          ? { kind: 'furniture.lift', entityUid: target.entity.uid }
          : furniturePayload(target.entity, mode);
    }
  }

  /** Opening a vehicle shows its parts and service work with the rest of what is in reach. */
  function openVehicle(vehicleId: number): void {
    if (sim.body.actionRefusal) {
      showRefusal(sim.body.actionRefusal, sim.time);
      return;
    }
    openInventory('items');
    openedVehicleId = vehicleId;
  }

  /** The opened vehicle's section; walking out of reach closes it. */
  function openedVehicle(): ReturnType<NonNullable<ScreenHooks['openedVehicle']>> {
    if (openedVehicleId === undefined || !inventory.canReachVehicle(openedVehicleId)) {
      openedVehicleId = undefined;
      return undefined;
    }
    const inspection = vehicleInspectionViewModel(
      { inventory, reach: session.reach(), refusal: session.vehicleWorkRefusal },
      openedVehicleId,
    );
    return inspection && { view: inspection, distanceMetres: session.vehicleDistance(openedVehicleId) };
  }

  /** While a piece is carried, either press sets it down wherever the crosshair points. */
  function completeWorldInteraction(mode: 'pocket' | 'wield'): void {
    const target = interactionPressTarget;
    interactionPressTarget = undefined;
    let payload: ReplayActionPayload | undefined;
    if (entities.carrying()) {
      payload = { kind: 'furniture.place', pos: aimedCell() };
    } else if (target?.kind === 'vehicle') {
      openVehicle(target.vehicleId);
    } else if (target) {
      payload = interactionPayload(target, mode);
    }
    if (!payload) {
      return;
    }
    const reason = dispatchScreenCommand(payload);
    if (reason) {
      showRefusal(reason, sim.time);
    }
  }

  function pickupGroundItem(uid: number, mode: 'pocket' | 'wield', feetPosition: Vec3): string | undefined {
    const item = inventory.itemByUid(uid);
    if (!item) {
      return lines.common.gone;
    }
    return mode === 'wield' ? toHands(inventory, queue, item, feetPosition) : pocketGroundItem(inventory, queue, item);
  }

  function interactFurniture(uid: number, alternatives?: true): string | undefined {
    const entity = entities.byUid(uid);
    if (!entity) {
      return lines.common.gone;
    }
    if (session.isObjective(entity)) {
      return session.activateGoal(entity);
    }
    if (compression.locksInput && rest.action?.furnitureUid !== entity.uid) {
      return undefined;
    }
    if (alternatives && slidableFurniture(inventory, entity, s)) {
      furnitureActionSelection.open(entity, furnitureActions());
    } else {
      useTarget(entity);
    }
    return undefined;
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

  function toggleWornLights(): void {
    if (!replayPlayer) {
      inputRecorder?.queueAction('light.worn-toggle', 'down', inputContext());
      pendingPlayerTickActions.enqueue(toggleWornLightsNow);
      return;
    }
    toggleWornLightsNow();
  }

  function toggleWornLightsNow(): void {
    refusalReason(survival.toggleWornLights());
  }

  function dropHeldItemForThrowingStance(): void {
    if (!replayPlayer) {
      if (sim.body.actionRefusal) {
        showRefusal(sim.body.actionRefusal, sim.time);
        return;
      }
      if (!inventory.hands[session.throwCharge.throwHand()]) {
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
    const hand = session.throwCharge.throwHand();
    const item = inventory.hands[hand];
    if (!item) {
      return;
    }
    const drop = dropTarget(inventory, item, feet());
    const result = drop.plan.ok ? inventory.move(item, drop.target) : drop.plan;
    if (!result.ok) {
      showRefusal(fillText(lines.play.dropRefused, { reason: result.reason }), sim.time);
      return;
    }
    if (session.throwCharge.itemUid === item.uid) {
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
    const begun = session.throwCharge.begin(sim.time, queue.busy || firearms.busy);
    if (begun.kind === 'refused') {
      showRefusal(begun.reason, sim.time);
    } else if (begun.kind === 'waiting') {
      showNotice(lines.play.waitingForHandling);
    }
  }

  /** A replay charges as the live game did, so a climber holds still alike, but throws from the recording. */
  function releaseItemThrow(): void {
    if (!session.throwCharge.active) {
      return;
    }
    if (replayPlayer) {
      session.throwCharge.cancel();
    } else {
      finishItemThrow();
    }
  }

  function finishItemThrow(): void {
    const released = session.throwCharge.release(sim.time);
    if (!released) {
      return;
    }
    if (input.consumeRightMousePressed() || input.rightMouseHeld) {
      dispatchScreenCommand({ kind: 'item.throw.cancel' });
      input.suppressRightMouseUntilRelease();
      return;
    }
    const { itemUid: uid, hand, heldSimSeconds } = released;
    if (!hasMetThrowMinimumHold(heldSimSeconds, throwMinimumHoldSimSeconds)) {
      return;
    }
    const item = inventory.itemByUid(uid);
    if (!(item && inventory.hands[hand] === item)) {
      return;
    }
    const distance = throwDistanceForItem(item, registry, itemThrowTuning, heldSimSeconds);
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
          throwHeldItem(heldItem, hand, distance);
          syncThrowingStance();
        });
      });
    }
  }

  function cancelItemThrow(): void {
    session.throwCharge.cancel();
  }

  function advancePendingItemThrow(): void {
    const charge = session.throwCharge;
    if (!charge.active || charge.startedAt !== undefined) {
      return;
    }
    if (!(replaySample?.intent.useDominantHeld ?? input.dominantUseHeld)) {
      cancelItemThrow();
      return;
    }
    if (sim.paused || queue.busy || firearms.busy) {
      return;
    }
    if (!charge.start(sim.time)) {
      showRefusal(lines.play.throwLostItem, sim.time);
      return;
    }
    showNotice('');
  }

  function throwRecordedItem(itemUid: number, hand: HandSide, distanceMetres: number): void {
    applyToHeldItem(inventory.hands, hand, itemUid, (item) => {
      throwHeldItem(item, hand, distanceMetres);
      syncThrowingStance();
    });
  }

  function itemThrowFlight(item: Item, hand: HandSide, distanceMetres: number) {
    const fullStrength = throwDistanceForItem(item, registry, itemThrowTuning, itemThrowTuning.chargeSimSeconds);
    const chargeProgress = fullStrength > 0 ? Math.max(0, Math.min(1, distanceMetres / fullStrength)) : 0;
    const offset: Vec3 = throwingStance
      ? throwStanceWorldOffset(hand, input.yaw, input.pitch, chargeProgress)
      : [0, 0, 0];
    const origin: Vec3 = [
      body.pos[0] * s + offset[0],
      body.pos[1] * s + session.playerEyeHeightMetres + offset[1],
      body.pos[2] * s + offset[2],
    ];
    return flightForItem(item, registry, {
      from: origin,
      direction: lookDir(),
      distanceMetres,
      blockSize: s,
      minY: scale.minCy * CHUNK,
      isSolid: session.physicalSolid,
    });
  }

  function throwHeldItem(item: Item, hand: HandSide, distanceMetres: number): void {
    if (inventory.hands[hand] !== item) {
      return;
    }
    const flight = itemThrowFlight(item, hand, distanceMetres);
    const origin = flight.points[0]!;
    const target = flight.landing ? { kind: 'pile' as const, pos: flight.landing } : undefined;
    if (!target) {
      showRefusal(coreMessage(registry, 'noLanding'), sim.time);
      return;
    }
    const startedAtSimSeconds = sim.time;
    const landingAt = startedAtSimSeconds + flight.durationSimSeconds;
    const landed = session.throwCharge.place(item, hand, target);
    if (!landed.landed) {
      if (landed.reason) {
        showRefusal(landed.reason, sim.time);
      }
      return;
    }
    itemThrows.spawn({ item, itemUid: landed.item.uid, origin, startedAtSimSeconds, landingAt, flight }, inventory);
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
    if (def.climbable) {
      refusalReason(session.grabLadder(entity));
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
    openInventory('items');
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
          weapon: meleeWeaponFromContent(weapon),
          profile: weapon.type,
          hand,
          twoHanded: registry.items.get(item.type)?.twoHanded ?? false,
          item,
        };
      }
    }
    return {
      weapon: unarmedMeleeWeapon(registry.meleeClasses),
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
    const classTuning = registry.meleeClasses.get(selected.profile);
    if (classTuning === undefined) {
      throw new Error(`Missing melee class tuning for ${selected.profile}`);
    }
    const swingWeapon = resolvePlayerMeleeWeapon(
      selected.weapon,
      classTuning,
      session.sim.body.consequences.swingSlowdown * session.sim.body.pain.effects.handlingSlowdown,
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
      showRefusal(lines.melee.tooTired, sim.time);
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
    return true;
  };

  const triggerWeapon = (weapon: Item | undefined, pressed: boolean) => {
    if (!weapon) {
      return;
    }
    const reason = firearms.fireReason(weapon.uid);
    if (reason) {
      if (pressed) {
        fireWeapon(weapon, sim.time);
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
    showRefusal(lines.common.busy, sim.time);
    return true;
  };

  const shouldPlayerBlock = (): boolean =>
    shouldEnterMeleeReady({
      rightMouseHeld: input.rightMouseActionHeld && input.locked && !input.menuPointer,
      meleeWeaponHeld: selectPrimaryAction(inventory).kind === 'melee',
      handsEmpty: !(inventory.hands.right || inventory.hands.left),
      debugBuild: debugTools?.buildOn ?? false,
      inputLocked: compression.locksInput,
    });

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
    showRefusal(firearms.fireReason(item.uid) ?? lines.play.gunNotReady, sim.time);
  };
  const togglePin = (item: Item): void => {
    const state = session.fuses.togglePin(item);
    if (state === 'pulled') {
      showNotice(lines.play.pinPulled);
    } else if (state === 'in') {
      showNotice(lines.play.pinIn);
    } else if (state === 'burning') {
      showRefusal(lines.play.fuseBurning, sim.time);
    }
  };
  const openHeldCan = (hand: HandSide): void => {
    const target = openingTargetForHand(inventory, hand);
    refusalReason(target ? unpacking.activate(target) : lines.unpacking.noCan);
  };
  const sharpenAtWheel = (hand: HandSide): boolean => {
    const held = inventory.hands[hand];
    const station = lookedAt();
    if (!(held && sharpening.wheelMethod(held, station))) {
      return false;
    }
    refusalReason(sharpening.activate(hand, station));
    return true;
  };
  performHandUse = (hand: 'right' | 'left') => {
    if (sim.body.actionRefusal) {
      showRefusal(sim.body.actionRefusal, sim.time);
      return;
    }
    if (refusePrimaryUseWhileHandling()) {
      return;
    }
    if (sharpenAtWheel(hand)) {
      return;
    }
    const held = inventory.hands[hand];
    const action = selectPrimaryAction(inventory, hand, held && survival.selectedItemAction(held)?.id);
    switch (action.kind) {
      case 'sharpen':
        refusalReason(sharpening.activate(hand));
        return;
      case 'open-can':
        openHeldCan(hand);
        return;
      case 'unpack':
        refusalReason(unpacking.activate(action.item));
        return;
      case 'pin':
        togglePin(action.item);
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
            ? magazines.strip(action.item.uid, sim.time, replaySample?.intent.useDominantHeld ?? input.dominantUseHeld)
            : lines.magazine.empty,
        );
        return;
      case 'fists':
        // On a ladder only the free hand swings.
        swing(session.ladderHold.freeHand(action.hand));
        return;
      case 'noop':
        return;
      case 'key':
        activateKey(action.item);
        return;
      case 'bar':
        activateBar();
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
    if (!input.locked || input.menuPointer || compression.locksInput || spectator.enabled || debugTools?.buildOn) {
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
    if (!input.locked || input.menuPointer || compression.locksInput || spectator.enabled || !debugTools?.buildOn) {
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
  const throwStanceCueVisible = (interactionVisible: boolean): boolean =>
    throwingStance && interactionVisible && input.locked && !screen.isOpen && !reading.isOpen && !mainMenuOpen;

  const statusView = (): PlayStatus => {
    const { pain } = sim.body;
    return {
      calendar: displayCalendar(),
      speed: compression.c,
      paused: sim.paused,
      needs: sim.needs,
      pain,
      painTier: pain.tier === undefined ? undefined : sim.body.tuning.pain.tiers[pain.tier]?.id,
      health: sim.body.health,
      blood: sim.body.blood,
      bleeding: bleedingStatusRows((region) => sim.body.bleedingTier(region)),
      sprinting: session.sprinting,
      lightCharge: survival.lit ? (chargeShare(registry, survival.lit) ?? 0) : undefined,
    };
  };
  const needsText = (): string => playNeedsText(statusView(), screenText.stats);
  const hudText = (looking: string, visible: Readonly<HudOptionsState>) =>
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
          ...(visible.interaction && session.throwCharge.startedAt !== undefined
            ? ['Mouse-1 held · right-click cancels']
            : []),
        ]
          .filter(Boolean)
          .join(' · '),
      },
      visible,
      screenText.stats,
    );
  /** Where the carried piece would stand if set down now, for the ghost and the prompt. */
  const carryPreview = () => {
    const entity = entities.carrying();
    return entity && { entity, spot: session.furniturePlacement(aimedCell()) };
  };
  const carryFloorPlacement = (): Readonly<Vec3> | undefined => {
    const carry = carryPreview();
    return carry && 'pos' in carry.spot ? carry.spot.pos : undefined;
  };
  /** Outlines the crosshair target, or, while carrying, where the piece would be set down. */
  const markOutline = (
    target: InteractionTarget | undefined,
    carry: ReturnType<typeof carryPreview>,
    outline: boolean,
  ): void => {
    if (!carry) {
      markInteractionTarget(target, outline, markerServices);
    } else if (outline && 'pos' in carry.spot) {
      const [x, y, z] = carry.spot.pos;
      const [w, h, d] = carry.entity.size;
      view.furniture.markBounds(
        `carry:${carry.entity.uid}`,
        [(x + w / 2) * s, (y + h / 2) * s, (z + d / 2) * s],
        [w * s, h * s, d * s],
      );
    } else {
      view.furniture.markBounds(undefined, [0, 0, 0], [0, 0, 0]);
    }
  };
  const furnitureInteractionHint = (entity: BlockEntity): HintText => {
    const key = keyCap('world.interact');
    if (furnitureActionSelection.isOpen(entity)) {
      return html`${key}: ${furnitureActionSelection.forItem(entity, furnitureActions())?.label} ${nameOf(entity)}`;
    }
    if (entity.bar) {
      const lift = doorPlan(inventory, entity, 'unbar');
      const action = lift.ok
        ? screenText.interaction.liftBar
        : fillScreenText(screenText.interaction.blocked, {
            action: screenText.interaction.liftBar,
            reason: lift.reason,
          });
      return html`${useText(entity)} · ${fillHint(screenText.interaction.hold, { key, action })}`;
    }
    if (slidableFurniture(inventory, entity, s)) {
      return html`${useText(entity)} · ${key} (hold): actions`;
    }
    return liftable(entity) ? html`${useText(entity)} · ${key} (hold): lift` : useText(entity);
  };
  const powerControlHint = (entity: BlockEntity): HintText | undefined => {
    const control = session.power?.control(entity);
    return control
      ? html`${keyCap('world.interact')}: ${screenText.powerControl[control.enabled ? 'off' : 'on']} ${nameOf(entity)}`
      : undefined;
  };
  const interactionHintFor = (
    target: InteractionTarget | undefined,
    carry: ReturnType<typeof carryPreview>,
  ): HintText | undefined => {
    const key = keyCap('world.interact');
    if (carry) {
      return playCarryText(
        'refusal' in carry.spot
          ? carry.spot.refusal
          : html`${fillParts(lines.hints.setDown, { key, name: nameOf(carry.entity) })}`,
        screenText.interaction,
      );
    }
    switch (target?.kind) {
      case 'item':
        return html`${fillParts(lines.hints.groundItem, { key, item: inventory.name(target.item) })}`;
      case 'furniture':
        return powerControlHint(target.entity) ?? furnitureInteractionHint(target.entity);
      case 'body':
        return downedBodyHint(target.id);
      case 'vehicle': {
        const vehicle = session.vehicles.get(target.vehicleId);
        const name = vehicle && registry.vehicleBlueprints.get(vehicle.blueprint)?.name;
        return name ? fillHint(screenText.vehicle.inspect, { key, vehicle: name }) : undefined;
      }
      default:
        return undefined;
    }
  };
  const promptText = (
    now: number,
    visible: Readonly<HudOptionsState>,
    target: InteractionTarget | undefined,
    carry: ReturnType<typeof carryPreview>,
  ) => {
    furnitureActionSelection.sync(target?.kind === 'furniture' && !carry ? target.entity.uid : undefined, sim.paused);
    const interactionHint = interactionHintFor(target, carry);
    const furnitureList =
      target?.kind === 'furniture' && furnitureActionSelection.isOpen(target.entity)
        ? [
            `${nameOf(target.entity)}:`,
            ...furnitureActions().map(
              (action) =>
                `${action.id === furnitureActionSelection.forItem(target.entity, furnitureActions())?.id ? '›' : ' '} ${action.label}`,
            ),
          ].join('\n')
        : undefined;
    const actions =
      visible.interaction && input.locked && !debugTools?.buildOn
        ? (furnitureList ?? survival.wieldedItemActionHint())
        : undefined;
    itemActionList.textContent = actions ?? '';
    itemActionList.hidden = !actions;
    return playPromptText(
      {
        now,
        notice,
        noticeUntil,
        interactionHint,
        itemActionHint: undefined,
        interruption: compression.interruption,
        resting: rest.action !== undefined,
      },
      visible,
      screenText.prompt,
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
    const orbitAngle = thirdPersonOrbit.angle(isPlayerThirdPersonView(thirdPersonViewEnabled, spectator.enabled));
    view.updateCamera(
      {
        dt,
        body,
        paused: sim.paused,
        noclip: debugTools?.noclip ?? false,
        yaw: spectator.avatarYaw(input.yaw),
        pitch: input.pitch,
        stridePhase: session.playerStridePhase,
        stance: session.stance,
        eye: eye(),
        ...(spectator.body
          ? { spectator: { position: [...spectator.body.pos], yaw: input.yaw, pitch: input.pitch } }
          : {}),
        thirdPerson: isPlayerThirdPersonView(thirdPersonViewEnabled, spectator.enabled),
        ...thirdPersonOrbitFrame(orbitAngle),
        sightImpaired: sim.body.consequences.sightImpaired,
        drugVignette: sim.body.drugVignette,
        nightVision: wornNightVision(inventory),
        painTier: painTierDef(),
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
          drawSubmission: view.drawSubmission,
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
    return { job, progress: worldGrabProgress(inventory, job) };
  };

  const throwingPresentation = () => {
    if (!throwingStance) {
      return {};
    }
    const { startedAt } = session.throwCharge;
    return {
      throwing: {
        chargeProgress:
          startedAt === undefined
            ? 0
            : Math.max(0, Math.min(1, (sim.time - startedAt) / itemThrowTuning.chargeSimSeconds)),
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
    const pose = renderMeleePose(action, elapsed, ready, {
      leading: dominantSide(inventory.character),
      holds: registry.figures.get(CORE_CONTENT_IDS.player)!.holds,
    });
    const { job: handlingJob, progress: grabProgress } = handlingPresentation();
    view.updateHeld(dt, pose, spectator.enabled ? undefined : survival.lit, {
      floorPlacement: carryFloorPlacement(),
      firearms: firearms.frames(),
      opticZoom: opticZoom.frame(zoomFirearm(), isAimingDownSights()),
      ...(readiness === undefined ? {} : { readiness }),
      aim: aim.frame,
      job: handlingJob,
      ...(grabProgress === undefined ? {} : { grab: { progress: grabProgress } }),
      ...throwingPresentation(),
      dt,
    });
  };

  const heldFirearmBore = (readiness = firearmReadiness()) => {
    const selected = selectPrimaryAction(inventory);
    if (selected.kind !== 'firearm') {
      return;
    }
    const tuning = registry.skills.get(CORE_CONTENT_IDS.firearmsCombat)?.combat?.firearms;
    if (!tuning) {
      throw new Error('Missing firearms-combat pose tuning');
    }
    const { item } = selected;
    const firearmPose = readiness?.uid === item.uid ? readiness : undefined;
    const model = sightedFirearmModel(registry, item) ?? firearmHandlingFor(item, registry).model;
    const side = inventory.hands.right?.uid === item.uid ? ('right' as const) : ('left' as const);
    const progress = firearmPose?.progress ?? 0;
    const viewpoint = { eye: eye(), yaw: input.yaw, pitch: input.pitch };
    const leadingSide = dominantSide(inventory.character);
    const twoHanded = Boolean(registry.items.get(item.type)?.twoHanded);
    const aimingDownSights = firearmPose?.aimingDownSights ?? false;
    const poseInput = {
      holds: registry.figures.get(CORE_CONTENT_IDS.player)!.holds,
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
      isSolid: session.physicalSolid,
    });
  };

  const targetAlongBore = (bore: ReturnType<typeof firearmBoreRay>) => {
    const rangeBlocks = firearmsCombatTuning(registry).shotTraceRangeBlocks;
    const surface = crosshairTarget(
      { world: engine.world, registry, entities, isSolid: session.physicalSolid, blockSize: s },
      bore.origin,
      bore.direction,
      rangeBlocks,
    );
    return firearmBoreTarget({
      eye: bore.origin,
      direction: bore.direction,
      surface,
      zombies: zombieSystem,
      blockSize: s,
      weapon: unarmedMeleeWeapon(registry.meleeClasses),
      rangeBlocks,
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
        !spectator.enabled &&
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
    if (sim.body.actionRefusal && session.throwCharge.active) {
      cancelItemThrow();
      return;
    }
    if (!replayPlayer && input.consumeRightMousePressed() && session.throwCharge.active) {
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
    if (!worldLoading.ready) {
      sim.paused = true;
      return false;
    }
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
    if (spectator.body && input.locked && !input.menuPointer) {
      debugTools?.stepNoclip({
        body: spectator.body,
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

  const updateDebugTargets = (bore: ReturnType<typeof firearmBoreRay> | undefined, nowMs: number) => {
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
    const interactionDistanceBlocks = debugTools.interactionRayEnabled
      ? interactionTargetAt()?.distanceBlocks
      : undefined;
    debugTools.drawInteractionRay({
      origin: eye(),
      direction: lookDir(),
      reachMetres: reachTuning(registry).useReachMetres,
      frame: nowMs,
      ...(interactionDistanceBlocks === undefined ? {} : { interactionDistanceBlocks }),
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
      wornLightInput.cancel();
      interactionPressTarget = undefined;
    } else {
      quickbarInput.update(now);
      interactInput.update(now);
      wornLightInput.update(now);
    }
    throwStanceInput.update(now);
    updateBackquoteGesture(backquoteGesture, now);
  };

  const playerDrip = (region: BodyRegion) => sim.body.bleedingTier(region)?.drip;
  // Blood holds still while the game is paused.
  const updateGore = (dt: RealSeconds): void => {
    view.gore.update(sim.paused ? 0 : dt, session.physicalSolid, {
      zombies: zombieStore,
      listener: body.pos,
      player: {
        pos: body.pos,
        yaw: spectator.avatarYaw(input.yaw),
        drip: playerDrip,
        thirdPerson: isPlayerFigureWhole(thirdPersonViewEnabled, spectator.enabled),
      },
    });
  };
  const waitViewAction = (): WaitViewAction | undefined => {
    const { job } = sim.actions;
    if (job?.jobType !== 'wait' || (job.stopped && compression.interruption === undefined)) {
      return undefined;
    }
    return { label: screenText.rest.waiting };
  };
  const renderRestAndWait = (messagesVisible: boolean): void => {
    const waitAction = waitViewAction();
    document.body.classList.toggle('resting', rest.action !== undefined);
    renderRest({
      root: restBox,
      action: rest.action ?? waitAction,
      canStop: rest.canStop || waitAction !== undefined,
      sim,
      messagesVisible,
      restLabels: registry.ui.get(CORE_CONTENT_IDS.coreUi)!.restLabels,
      text: screenText,
    });
  };

  const showFocusNotice = focusNoticeOnce(lines, playerStart.unknownFocus);
  const observeScenarioFrame = (seconds: number): void => {
    const live = worldLoading.ready && started && !mainMenuOpen && document.visibilityState === 'visible';
    showFocusNotice(live, showNotice);
    session.observeRunFrame(seconds, live);
  };

  const prepareStreaming = (now: RealTimestamp): void => {
    streamer.update(body.pos[0], body.pos[2]);
    if (!worldLoading.ready && replayDriver && !replayDriver.initializeColumns()) {
      worldLoading.fail('Recorded terrain could not be initialized. Reload and choose another replay.');
    }
    if (worldLoading.ready) {
      updateActionInputs(now);
    }
  };

  const updateTutorial = () => {
    for (const item of Object.values(inventory.hands)) {
      if (item) {
        tutorial?.weapons.wielded(item, registry);
      }
    }
    tutorial?.observe({
      position: body.pos,
      yaw: input.yaw,
      crouching: session.stance === 'crouching',
      doorOpen: [...entities.all].some((entity) => entity.type === 'wood_door' && entity.open),
      searched: [...entities.all].some((entity) => entity.type === 'tutorial_cabinet' && entity.searched),
      looted: inventory.looted.size > 0,
      wielded:
        Object.values(inventory.hands).some((item) => item?.type === 'canned_beans') &&
        Object.values(inventory.hands).some((item) => item?.type === 'can_opener'),
      lightOn: survival.lit?.type === 'flashlight' && survival.lit.on === true,
      litType: survival.lit?.on === true ? survival.lit.type : undefined,
      paused: mainMenuOpen && started,
    });
    drawTutorial?.({
      inventory,
      inventoryOpen: screen.isOpen,
      lightOn: survival.lit?.type === 'flashlight' && survival.lit.on === true,
    });
  };

  const affordanceForFrame = (visible: Readonly<HudOptionsState>) =>
    interactionAffordance(
      interactionTargetAt,
      visible.interaction || visible.interactionOutline,
      input.locked,
      Boolean(debugTools?.buildOn),
    );
  const markerServices = {
    furniture: view.furniture,
    piles: view.piles,
    definition: (entity: BlockEntity) => entities.defOf(entity),
    body: (id: EntityId) => zombieStore.get(id)?.body,
    vehiclePart: (vehicleId: number, fittingId: string) =>
      currentVehicleParts().find((part) => part.vehicleId === vehicleId && part.fittingId === fittingId)?.boxes,
    blockSize: s,
  };

  const observePlaytestFrame = (elapsedReal: number, now: RealTimestamp): void => {
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
  };

  const finishDraw = (sky: Parameters<typeof view.prepareLighting>[0], now: RealTimestamp): boolean => {
    finishLoadingFrame(worldLoading, () => updateWorldLoading(now), {
      worldFeedsSkylight: Boolean(renderer),
      skylight: () =>
        engine.skylight?.update(engine.scene, [camera.position.x / s, camera.position.y / s, camera.position.z / s]),
      world: () => {
        view.prepareLighting(sky);
        view.updateShadows(sky);
        renderMs = view.render();
      },
    });
    if (worldLoading.state === 'failed') {
      return false;
    }
    if (sim.dead) {
      die(sim.dead);
      return false;
    }
    return true;
  };

  const closeReadingInDarkness = () => {
    const tooDark = reading.isOpen ? session.readingLight(reading.lightAt) : undefined;
    if (tooDark) {
      reading.close();
      // A skip stopped by the same darkness already names the reason.
      if (compression.interruption === undefined) {
        showRefusal(tooDark, sim.time);
      }
    }
  };

  const updateFrame = (now: RealTimestamp) => {
    const workStart = realNow();
    const elapsedReal = Math.max(0, (now - last) / 1000);
    const dt = realDuration(Math.min(0.1, elapsedReal));
    frameInterval.record(now, now - last);
    last = now;
    observeScenarioFrame(elapsedReal);
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    const menuState = syncMenuState();
    const visible = hudVisibility(hudOptions, false, menuState.menuPointer);
    let mark = realNow();
    prepareStreaming(now);
    meshingQueueMs = realNow() - mark;
    playtestObserver?.beforeFrame(queue, inventory);
    mark = realNow();
    const gameFrozen = stepSimulation(dt, menuState.paused);
    updateBodyNotices();
    advancePendingItemThrow();
    syncThrowingStance();
    caseEffects.update(sim.time);
    updateGore(dt);
    impactEffects.update(dt, config.debug && debugLaserEnabled);
    simulationMs = realNow() - mark;
    options.saveController?.afterFrame();
    updateTutorial();
    observePlaytestFrame(elapsedReal, now);
    const { sky } = view.syncWorld({
      calendar: sim.calendar,
      time: sim.time,
      playerEye: eye().map((coordinate) => coordinate * s) as Vec3,
      playerChest: [body.pos[0] * s, body.pos[1] * s + PLAYER_CHEST_METRES, body.pos[2] * s],
      lastZombieStep: session.lastZombieStep,
      acidGlobs: zombieSystem.acidGlobs,
      acidPuddles: zombieSystem.acidPuddles,
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
    updateDebugTargets(bore, now);
    debugTools?.updateTransientDraw(now);
    updateDebugReadout(now);
    mark = realNow();

    updateVisualFeedback(dt);
    const unconsciousPresentation = sim.body.unconscious && !sim.dead;
    document.body.classList.toggle('unconscious', unconsciousPresentation);
    audio.setOutputMuted(unconsciousPresentation);
    audio.updateHeartbeat(sim.needs.stamina);
    audio.updateListener([camera.position.x, camera.position.y, camera.position.z], lookDir());
    menuPointer.update();

    const affordance = affordanceForFrame(visible);
    const carry = carryPreview();
    markOutline(affordance.target, carry, visible.interactionOutline);
    const crosshair = playCrosshairFrame(visible.crosshair, bore !== undefined, crosshairScreenPosition(bore));
    debugTools?.setCrosshairVisible(visible.crosshair);
    $('throw-stance').hidden = !throwStanceCueVisible(visible.interaction);
    renderPlayHud(
      { hud, prompt, crosshair: $('crosshair') },
      {
        hud: hudText(debugTools?.target(eye(), lookDir(), input.locked) ?? '', visible),
        crosshairVisible: crosshair.visible,
        crosshairScreenPosition: crosshair.screenPosition,
        prompt: promptText(now, visible, affordance.target, carry),
      },
    );
    renderRestAndWait(visible.messages);
    const currentPresentation = handlingPresentationFor({
      job: sim.actions.job,
      queue,
      inventory,
      simSeconds: sim.time,
      clockRatio: sim.clock.ratio,
      compressionActive: compression.active,
      throwCharge:
        session.throwCharge.startedAt === undefined
          ? undefined
          : {
              elapsedSimSeconds: Math.max(0, sim.time - session.throwCharge.startedAt),
              chargeSimSeconds: throwChargeSimSeconds,
              minimumHoldSimSeconds: throwMinimumHoldSimSeconds,
            },
    });
    screen.update();
    reading.revalidate((ownerUid) => Object.values(inventory.hands).some((item) => item?.uid === ownerUid));
    closeReadingInDarkness();
    syncReadingProgress(reading.bookUid, currentPresentation.longAction, reading.setProgress, isBookComplete);
    craftPanel.update(screen.isOpen && !sim.dead, visible.messages);
    drawQuickbar();
    quickbarBox.hidden = (debugTools?.buildOn ?? false) || !visible.quickbar;
    renderPlayHandling(handlingBox, currentPresentation, !screen.isOpen && visible.handling, screenText.handling);
    const continuing = finishDraw(sky, now);
    frameWork.record(now, realNow() - workStart);
    return continuing;
  };
  const skyRoute = options.skyRoute?.({
    engine,
    session,
    debug: debugTools!,
    active: () =>
      started &&
      !mainMenuOpen &&
      input.locked &&
      !screen.isOpen &&
      !reading.isOpen &&
      !debugTools!.menuOpen &&
      !debugTools!.frozen &&
      !sim.dead,
  });
  const frame = guardDebugErrorFrame(
    observeRealFrame(
      (now) => {
        try {
          if (playHalted.value) {
            return false;
          }
          if (session.won) {
            win();
            return true;
          }
          return updateFrame(now);
        } catch (error) {
          if (worldLoading.ready) {
            throw error;
          }
          worldLoading.fail(error);
          drawWorldLoading();
          input.unlock();
          return false;
        }
      },
      () => skyRoute,
    ),
    debugErrorEnabled(config.debug, location.search),
    () => input.locked,
  );

  let winPresented = false;
  const win = (): void => {
    if (!winPresented) {
      winPresented = true;
      input.unlock();
      mainMenuOpen = false;
      debugTools?.closeMenus();
      reading.close();
      closeInventoryScreen();
      inventoryPanel.hidden = true;
      syncMenuState();
      prompt.hidden = true;
      itemActionList.hidden = true;
      if (!options.restore || options.restore.character.scenarioRun?.completedAtGameTimestamp === null) {
        options.saveController?.finishWin();
      }
    }
    showWin($('death'), {
      seed: sim.seed,
      run: session.scenarioRun!,
      checkpoint: options.saveController?.winCheckpointStatus ?? 'unavailable',
      checkpointMessages: screenText.winCheckpointMessages,
      text: screenText.win,
      newWorld: () => location.assign(newWorldQuery(location.search, config.seed)),
      freshAttempt: () => location.assign(newWorldQuery(location.search, config.seed - 1)),
      exportRun: exportMetrics,
    });
  };

  /** Stops play and shows what happened; "New world" reloads with the next seed. */
  const die = ({ cause, time }: { cause: string; time: number }) => {
    options.saveController?.finishDeath();
    input.unlock();
    metrics.recordDeath(cause, time * sim.clock.ratio);
    saveMetrics();
    mainMenuOpen = false;
    debugTools?.closeMenus();
    reading.close();
    closeInventoryScreen();
    inventoryPanel.hidden = true;
    syncMenuState();
    prompt.hidden = true;
    itemActionList.hidden = true;
    const summary = {
      cause,
      worldSeed: sim.seed,
      survived: time * sim.clock.ratio,
      looted: inventory.looted,
      searched: [...entities.all].filter((e) => e.searched).length,
    };
    showDeath(
      $('death'),
      registry,
      summary,
      options.tutorial ? leaveTutorial : () => location.assign(newWorldQuery(location.search, config.seed)),
    );
  };
  if (options.saveController) {
    snapshotIds = options.saveController.bindSession(
      captureSnapshot,
      () => sim.time,
      { blockSize: s, site: config.site, storeys: config.storeys, density: config.density },
      {
        checkpointSimSeconds: autosave.checkpointSimSeconds,
        recordSnapshotDuration: (durationMs) => snapshotHistory.add(durationMs),
      },
    );
  }
  // Shaders compile while the world streams in behind the main menu: started now, not awaited, so
  // nothing waits for it.
  view.warmUp().catch((error: unknown) => showNotice(`Shader warm-up failed: ${String(error)}`));
  startRealFrames(frame);
  return {
    enter: () => {
      audio.unlock();
      resume();
    },
  };
};
