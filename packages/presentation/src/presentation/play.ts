// Normal play: walk, look, loot, manage what you carry, eat, drink and light your way.
// The simulation core runs the clock, the player's physics, needs and the handling
// queue; Esc pauses it. When health runs out, the death screen offers a new world.

import { type ActorFigureFiles, type BodyTuningDef, loadActorFigureFiles } from '@skelly/engine/content';
import {
  type ActionText,
  actionText,
  CrouchProneInput,
  createReplayPlayStateBinding,
  encodeInputReplay,
  ForwardReleaseWatch,
  fillText,
  type InputContext,
  InputReplayDriver,
  type InputReplayDriverPorts,
  InputReplayPlayer,
  InputReplayRecorder,
  type inventoryTabForAction,
  isForwardButton,
  joinInputReplayWindows,
  PressDedupe,
  PressHoldInput,
  RELOAD_GESTURE_MS,
  type ReplayAction,
  type ReplayActionPayload,
  type ReplayControlSample,
  type ReplayGeneratedColumn,
  type ReplayInputData,
  type ReplayStartState,
  stashInputReplay,
  withReplayExportGuard,
} from '@skelly/engine/input';
import {
  chargeShare,
  claimed,
  damageWord,
  defOf,
  doorOptions,
  doorPlan,
  firearmHandlingFor,
  type HandSide,
  heldDoorBar,
  type Inventory,
  type Item,
  type ItemAction,
  isPressCheck,
  offHandUse,
  type Pile,
  pileScatterPlacements,
  wornNightVision,
} from '@skelly/engine/inventory';
import { getBuildRevision } from '@skelly/engine/packs';
import {
  aimDirection,
  heldFirearmTransform,
  NEUTRAL_AIM,
  playerAdsPose,
  playerEyePosition,
  playerHeldSeatFrame,
  playerLookPose,
  sightedFirearmModel,
} from '@skelly/engine/pose';
import type { SaveSnapshot } from '@skelly/engine/save';
import {
  createCommandRouter,
  createSession,
  createSimulationStepper,
  type InputRecording,
  type InputReplayVerification,
  inputReplayStoppedStatus,
  observeRealFrame,
  requireStart,
} from '@skelly/engine/session';
import {
  ActionMenu,
  type Actor,
  applyStartState,
  type BodyRegion,
  crosshairTarget,
  discoveryForPlan,
  dominantSide,
  type EntityId,
  firearmBoreRay,
  firearmBoreTarget,
  firearmsCombatTuning,
  formatClock,
  furnitureActionsFor,
  HeldActionPress,
  type HeldActionTrigger,
  heldRadialEntries,
  heldUsePressTaken,
  type InteractionTarget,
  interactionAffordance,
  type LongJob,
  nextTimeOfDay,
  offSide,
  type PinState,
  PLAYER_CHEST_METRES,
  PlayerTickActions,
  playerTuning,
  pryPlan,
  type RadialAction,
  type RealSeconds,
  type RealTimestamp,
  radialEntries,
  reachTuning,
  realSeconds as realDuration,
  realTimestamp,
  restKindForFurniture,
  selectPrimaryAction,
  stageMarkArea,
  unarmedMeleeWeapon,
} from '@skelly/engine/sim';
import {
  createRefusalPresenter,
  handlingMoveCompleteCue,
  handlingMoveStartCue,
  type SoundEmission,
  soundVariantKey,
} from '@skelly/engine/sound';
import { fillText as fillScreenText } from '@skelly/engine/text';
import {
  type BlockEntity,
  CitySite,
  columnArrival,
  playerStartFromWorld,
  raycast,
  registerLayoutVehicles,
  type Vec3,
} from '@skelly/engine/world';
import { FrameTimes } from '../render/frameTimes.ts';
import { worldGrabProgress } from '../render/grabPose.ts';
import { handlingLook, handlingRotation, handlingShift } from '../render/handlingTurn.ts';
import { markInteractionTarget } from '../render/interactionMarker.ts';
import { renderMeleePose } from '../render/meleePose.ts';
import { createPlayView, type ViewProbes } from '../render/playView.ts';
import type { RagdollConfig } from '../render/ragdoll.ts';
import { mountActionRadial } from '../ui/actionRadial.ts';
import { renderAudioOptions } from '../ui/audioOptions.ts';
import { chargerPanel } from '../ui/chargerPanel.ts';
import { mountCraftPanel } from '../ui/craftController.ts';
import { runningCraftPresentation } from '../ui/craftReadout.ts';
import { showDeath } from '../ui/death.ts';
import { appendError } from '../ui/errorLog.ts';
import { type ErrorReportContext, setErrorReportContext } from '../ui/errorReport.ts';
import { mountGameCursor } from '../ui/gameCursor.ts';
import { renderGraphicsOptions } from '../ui/graphicsOptions.ts';
import { mountGuidance } from '../ui/guidedSteps.ts';
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
import { fillHint, type HintText, hintHtml as html, type KeyLabels, keyCap } from '../ui/keyCap.ts';
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
import { contentLookup, type SaveController } from '../ui/saveController.ts';
import { vehicleInspectionViewModel } from '../ui/vehicleInspection.ts';
import { showWin } from '../ui/win.ts';
import { mountWorldLoading } from '../ui/worldLoading.ts';
import { GameAudio } from './audio.ts';
import { BackquoteOrbitGesture } from './backquoteOrbitGesture.ts';
import { bundledAssetUrl, type PackAssetFiles, type PresentationAssets } from './bundledAssets.ts';
import { DebugGunPose } from './debugGunPose.ts';
import type {
  DebugHooks,
  DebugModule,
  DebugRuntime,
  InputReplayStatusState,
  SkyRouteAttachment,
} from './debugInterface.ts';
import { debugTargetRay } from './debugTargetRay.ts';
import type { Engine } from './engine.ts';
import { GuidedSteps } from './guidedSteps.ts';
import { Input } from './input.ts';
import {
  type InputCancellationReason,
  type InputCommand,
  type KeyboardInput,
  shouldCancelInputForViewerFocus,
} from './inputBindings.ts';
import { OpticZoom } from './opticZoom.ts';
import { bleedingStatusRows } from './playStatus.ts';
import { createAttemptRecording, type PlaytestObserver } from './playtestObserver.ts';
import { createSnapshotHistory, downloadFile, type HandBackFile, replayFile } from './playtestTools.ts';
import { QuickbarInput } from './quickbarInput.ts';
import { realNow, startRealFrames } from './realFrames.ts';
import { SpectatorCamera } from './spectatorCamera.ts';
import {
  isOrbitResetMovementAction,
  isPlayerFigureWhole,
  isPlayerThirdPersonView,
  ThirdPersonOrbit,
  type ThirdPersonOrbitAngle,
} from './thirdPersonOrbit.ts';
import { TierNotice } from './tierNotice.ts';
import { finishLoadingFrame, WorldLoading } from './worldLoading.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const bindMetricsExport = (
  file: (() => HandBackFile) | undefined,
  handBack: (file: () => HandBackFile) => Promise<void>,
): (() => void) => {
  const button = $<HTMLButtonElement>('playtest-metrics-export');
  button.disabled = !file;
  button.onclick = file ? () => handBack(file) : null;
  return () => {
    if (file) {
      downloadFile(file());
    }
  };
};

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
  readonly metricsFile: (() => HandBackFile) | undefined;
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
  input.controls.cancel();
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
    ...(exportMetricsFile ? { metricsFile: exportMetricsFile } : {}),
    replayFile: async () => replayFile(await exportReplay(), new Date()),
  };
  setErrorReportContext(context);
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
const PIN_LINES: Readonly<Record<PinState, string>> = {
  in: 'Pin: in',
  pulled: 'Pin: pulled',
  burning: 'Fuse: burning',
};
const pinDescription = (state: PinState | undefined): string[] => (state ? [PIN_LINES[state]] : []);
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
    if (message.type === 'skelly-review-map-key') {
      onKey(message as Record<string, unknown>);
    } else if (message.type === 'skelly-review-map-close') {
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
  { startState, registry }: { readonly startState: () => ReplayStartState; readonly registry: Engine['registry'] },
): InputReplayRecorder | undefined => {
  if (replaying) {
    return undefined;
  }
  return new InputReplayRecorder(snapshot(), undefined, generatedColumns, {
    startState: startState(),
    nowRealMilliseconds: () => performance.now(),
    contentLookup: (kind, id) => contentLookup(registry, kind, id),
  });
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
    setProgress({ value: action.elapsedGameSeconds, max: action.durationGameSeconds });
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
  readonly keys: KeyLabels;
}

const screenTextOf = (registry: Engine['registry']) => claimed(registry.ui, 'interface')!.screenText;

const handlingPresentationFor = ({
  job,
  queue,
  inventory,
  simSeconds,
  clockRatio,
  compressionActive,
  throwCharge,
  keys,
}: HandlingPresentationOptions): HandlingPresentationSource => {
  if (throwCharge) {
    return { jobs: [], throwCharge };
  }
  const { cancel } = actionText(inventory.registry).hints;
  const inactive = {
    ...queue,
    cancelLabel: queue.cancelLabel ?? fillHint(cancel, { key: keyCap(keys, 'handling.stop') }),
  };
  const craft = runningCraftPresentation(inventory, job, { simSeconds, clockRatio, compressionActive });
  if (craft) {
    return timedActionHandlingPresentation(craft, screenTextOf(inventory.registry).handling, keys);
  }
  if (!job || job.stopped || !isTimedLongJob(job)) {
    return inactive;
  }
  const accrued = elapsedForPresentation(job, simSeconds, clockRatio, compressionActive);
  const progress =
    job.jobType === 'reading'
      ? { kind: job.jobType, durationGameSeconds: job.duration, elapsedGameSeconds: accrued }
      : { kind: job.jobType, durationSimSeconds: job.duration, elapsedSimSeconds: accrued };
  const action: TimedActionPresentation = {
    ...progress,
    ...(job.jobType === 'reading' ? { ownerUid: job.bookUid } : {}),
    label: timedActionLabel(job, inventory),
    stopped: job.stopped,
  };
  return timedActionHandlingPresentation(action, screenTextOf(inventory.registry).handling, keys);
};

const createPlayRefusalPresenter = (
  registry: Engine['registry'],
  audio: GameAudio,
  showNotice: (text: string) => void,
) => {
  const event = claimed(registry.ui, 'interface')!.refusalSound;
  const nope = registry.sounds.get(event)!;
  return createRefusalPresenter(
    showNotice,
    () => audio.preview(event, soundVariantKey(event, nope.variants[0]!)),
    nope.minIntervalSimSeconds,
  );
};

/**
 * What play asks of the page it runs in. The product owns the page URL, so presentation never reads it; see
 * `docs/decisions/0006-url-mods-and-hash-state.md`, "Decision".
 */
export interface PlayPage {
  /** A debug run's harness asked for the deliberate error frame. */
  readonly debugError: boolean;
  /** Loads a new world from `seed`, keeping the page's content and developer state. */
  readonly newWorld: (seed: number) => void;
  /** Reloads in debug so the stashed input replay starts. */
  readonly reloadForReplay: () => void;
  /** The review map page, which the debug overlay opens with its own parameters. */
  readonly reviewMapHref: string;
  readonly probes: ViewProbes;
}

export interface StartPlayOptions {
  readonly assets: PresentationAssets;
  readonly page: PlayPage;
  /** The page's keyboard, which play drives and whose keys its hints show. */
  readonly keyboard: KeyboardInput;
  /** The product's corpse physics tuning. */
  readonly ragdoll: RagdollConfig;
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
  const autosave = claimed(registry.saves, 'autosave');
  if (!autosave) {
    throw new Error('Missing autosave tuning');
  }
  return autosave;
};

/** A replay restores its own recorded world without a save, so it is the one restore practice admits. */
const assertPracticeIsolation = (options: StartPlayOptions, guided: boolean): void => {
  if (guided && (options.saveController || (options.restore && !options.replay))) {
    throw new Error('Practice cannot bind a save or restore a world');
  }
};

/**
 * Practice is its own page, which the player leaves with the browser, so its only end control loads the page again;
 * why: `packages/deadvox/docs/tutorial.md`, "Disposable practice".
 */
const restartPractice = () => location.reload();

const createPlayGuidance = (engine: Engine, keys: KeyLabels) => {
  const definition = engine.site?.guidance;
  if (!definition) {
    return {};
  }
  const marks = engine.site?.playtestMarks;
  const exitMark = engine.site?.practiceExitMark;
  if (!(marks && exitMark)) {
    throw new Error('Guidance requires authored stage marks');
  }
  const guide = new GuidedSteps(
    engine.spawn.pos.map((coordinate) => coordinate / engine.config.scale.blockSize) as Vec3,
    engine.spawn.yaw,
    stageMarkArea(marks.beats, exitMark),
    definition,
  );
  const drawGuidance = mountGuidance(guide, restartPractice, keys);
  return { guide, drawGuidance };
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

/** The figure files the stack's rows name, fetched before the session exists so no tick ever waits on a fetch. */
export const fetchActorFigureFiles = (
  registry: Engine['registry'],
  figures: PackAssetFiles,
): Promise<ActorFigureFiles> =>
  loadActorFigureFiles(registry, async (contentFile, path) => {
    const url = bundledAssetUrl(figures, contentFile, path);
    if (url === undefined) {
      throw new Error(`No bundled figure file ${path} for ${contentFile}`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Figure file ${path}: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  });

export const startPlay = async (
  engine: Engine,
  debugModule: DebugModule | undefined,
  options: StartPlayOptions,
): Promise<{ enter: () => void }> => {
  assertPracticeIsolation(options, Boolean(engine.site?.guidance));
  const actorFigureFiles = await fetchActorFigureFiles(engine.registry, options.assets.figures);
  return startPlayWith(engine, debugModule, options, actorFigureFiles);
};

/**
 * Calls `release` when the forward button lets go. Cancelling the side button's pointerdown suppresses its mouseup,
 * so pointer events are read too, and a release under another held button arrives only as a pointermove.
 */
const listenForwardRelease = (release: (at: number) => void): void => {
  const watch = new ForwardReleaseWatch();
  for (const type of ['pointerdown', 'mousedown', 'pointermove', 'pointerup', 'mouseup']) {
    document.addEventListener(
      type,
      (e) => {
        if (watch.released(e as MouseEvent)) {
          release(e.timeStamp);
        }
      },
      true,
    );
  }
};

const startPlayWith = (
  engine: Engine,
  debugModule: DebugModule | undefined,
  options: StartPlayOptions,
  actorFigureFiles: ActorFigureFiles,
): { enter: () => void } => {
  const keyboardInput = options.keyboard;
  const inputBindings = keyboardInput.registry;
  const { config, registry, streamer, renderer, camera, meshes } = engine;
  const lines = actionText(registry);
  const autosave = autosaveTuning(registry);
  const inputTarget = renderer?.domElement ?? $('view');
  const { owner: worldLoading, draw: drawWorldLoading } = playLoadingFor(engine, options);
  configureRestoreFailure(streamer, options.saveController);
  configureReplayStreaming(engine, options.replay);
  const { scale } = config;
  const s = scale.blockSize;
  const { guide, drawGuidance } = createPlayGuidance(engine, inputBindings);

  const playerStart = playerStartFromWorld(engine, scale, config.debugStart, {
    restoring: options.restore !== undefined,
    focus: config.focus,
  });
  let debugTools: DebugRuntime | undefined;
  let replayPlayer: InputReplayPlayer | undefined;
  const shouldCancelForViewerFocus = (reason: InputCancellationReason): boolean =>
    shouldCancelInputForViewerFocus(reason, replayPlayer !== undefined);
  const input = new Input(inputTarget, keyboardInput, {
    dominantUseAllowed: () => !debugTools?.buildOn,
    cancelOnBlurAllowed: () => shouldCancelForViewerFocus('window-blur'),
    viewerInputAllowed: () => worldLoading.ready && replayPlayer === undefined,
  });
  input.controls.yaw = playerStart.yaw;
  const playerSenseTuning = claimed(registry.senses, 'player');
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
  const pendingPlayerTickActions = new PlayerTickActions();
  let interactionPressTarget: InteractionTarget | undefined;
  /** The vehicle opened by interacting with it; presentation only, so it is neither saved nor replayed. */
  let openedVehicleId: number | undefined;
  const actionMenu = new ActionMenu();
  const furnitureActions = (entity: BlockEntity): ItemAction[] => furnitureActionsFor(inventory, entity, s);
  const actionMenuTuning = claimed(registry.ui, 'interface')!.actionMenu;
  const furnitureMenuEntries = (entity: BlockEntity): RadialAction[] =>
    radialEntries(furnitureActions(entity), actionMenuTuning.directions.furniture);
  const heldMenuEntries = (item: Item): RadialAction[] =>
    heldRadialEntries(survival.availableItemActions(item), screenText.actionMenu.treat, actionMenuTuning.directions);
  const openTarget = (source: 'furniture' | 'held'): number | undefined => {
    const { opened } = actionMenu;
    return opened?.source === source ? opened.uid : undefined;
  };
  const openHeldItem = (): Item | undefined => {
    const uid = openTarget('held');
    return uid === undefined ? undefined : inventory.itemByUid(uid);
  };
  /** The open menu's entries, or nothing once its target has gone. */
  const openMenuEntries = (): RadialAction[] | undefined => {
    const item = openHeldItem();
    if (item) {
      return heldMenuEntries(item);
    }
    const uid = openTarget('furniture');
    const entity = uid === undefined ? undefined : entities.byUid(uid);
    return entity && furnitureMenuEntries(entity);
  };
  let audio: GameAudio;
  const playSessionSound = (sound: Readonly<SoundEmission>): void =>
    audio.play(sound, sound.position.map((v) => v * s) as Vec3);

  // ---- simulation ----

  let playtestObserver: PlaytestObserver | undefined;
  let debugLaserEnabled = true;
  const inputRecording: InputRecording = { recorder: undefined, previous: undefined, stoppedReason: undefined };
  let replaySample: ReplayControlSample | undefined;
  let dispatchReplayAction: (action: ReplayAction, sample: ReplayControlSample) => void = () => undefined;
  replayPlayer = createInputReplayPlayer(options.replay?.inputs, (action, sample) =>
    dispatchReplayAction(action, sample),
  );
  const spectator = new SpectatorCamera();
  const debugGunPose = new DebugGunPose(config.debug);
  let thirdPersonViewEnabled = false;
  const thirdPersonOrbit = new ThirdPersonOrbit();
  let backquoteGesture: BackquoteOrbitGesture | undefined;
  let perceptionLabelsEnabled = false;
  const router = createCommandRouter({
    controls: input.controls,
    registry,
    session: () => session,
    inventory: () => inventory,
    sim: () => sim,
    presentation: {
      refusal: (reason, atSimSeconds) => showRefusal(reason, atSimSeconds),
      noPrimaryAction: (item, atSimSeconds) => showRefusal(primaryActionHint(registry, item), atSimSeconds),
      notice: (text) => showNotice(text),
      closeInventoryScreen: () => closeInventoryScreen(),
      syncMenuState: () => syncMenuState(),
      openInventory: (tab) => openInventory(tab),
      openFurnitureChoices: (entity, actions) => {
        const direct = actionMenu.open(
          'furniture',
          entity,
          radialEntries(actions, actionMenuTuning.directions.furniture),
        );
        const payload = direct && furnitureChoicePayload(entity, direct);
        if (payload) {
          const reason = router.dispatchScreenCommand(payload);
          if (reason) {
            showRefusal(reason, sim.time);
          }
        }
      },
      beginSearch: (entity) => playtestObserver?.beginSearch(entity, nameOf(entity)),
      weaponInspected: (item) => guide?.weapons.inspected(item, registry),
      throwVisual: (launch, owner) => itemThrows.spawn(launch, owner),
      spectatorAllows: (action) => spectator.allowsCommand(action),
      screenInputCommand: (command) => screen.onInputCommand(command),
      locomotionPressed: (action) => resetOrbitOnLocomotion(action, thirdPersonOrbit),
      modal: {
        toggleMainMenu: () => {
          mainMenuOpen = !mainMenuOpen;
          syncMenuState();
        },
        mainMenuOpen: () => mainMenuOpen,
        readingOpen: () => reading.isOpen,
        readingAction: (command) => reading.onAction(command),
        readingMovementAction: () => {
          if (reading.bookUid === undefined) {
            return false;
          }
          reading.close();
          return true;
        },
        toggleInventory: () => toggleInventory(),
        screenOpen: () => screen.isOpen,
        screenAction: (command) => screen.onAction(command),
      },
      debugCommand: (action, at) => handleDebugCommand(action, at),
      hintCommand: (action, phase, at) => handleHintCommand(action, phase, at),
    },
    active: () => worldLoading.ready && (Boolean(options.replay) || (input.locked && !input.menuPointer)),
    worldReady: () => worldLoading.ready,
    pointerLocked: () => input.locked,
    menuPointer: () => input.menuPointer,
    beforeSleep: () => options.saveController?.beforeSleep(),
    replaying: () => replayPlayer !== undefined,
    replayPlayer: () => replayPlayer,
    replaySample: () => replaySample,
    setReplaySample: (sample) => {
      replaySample = sample;
    },
    recorder: () => inputRecording.recorder,
    stopRecordingForColumnOverflow: () => stepper.stopRecordingForColumnOverflow(),
    inputContext: () => inputContext(),
    pendingPlayerTickActions,
    gunPose: debugGunPose,
    buildMode: () => Boolean(debugTools?.buildOn),
    handlingBusy: () => queue.busy,
    sprinting: () => session.sprinting,
    itemThrowTuning,
    throwMinimumHoldSimSeconds,
    scale,
    pick: {
      worldSeed: config.seed,
      isSolid: engine.isSolid,
      isOpaque: engine.isOpaque,
    },
    advanceHeldStrip: (uid, time, held) => magazines.advanceHeldStrip(uid, time, held),
    selectedMagazineAction: (item) => survival.selectedItemAction(item)?.magazine,
    firearmShotInput: (uid, atSimSeconds) => session.firearmShotInput(uid, atSimSeconds),
    fire: (shot) => firearms.fire(shot),
    fireReason: (uid) => firearms.fireReason(uid),
    descending: () => keyboardInput.held('noclip.descend'),
    liveGestures: {
      crouchProne: {
        keyDown: (action, at) => crouchProneInput.keyDown(action, at),
        keyUp: (action, at) => crouchProneInput.keyUp(action, at),
      },
      throwStance: {
        keyDown: (action, at) => throwStanceInput.keyDown(action, at),
        keyUp: (action, at) => throwStanceInput.keyUp(action, at),
      },
      wornLight: {
        keyDown: (action, at) => wornLightInput.keyDown(action, at),
        keyUp: (action, at) => wornLightInput.keyUp(action, at),
      },
      interact: {
        keyDown: (action, at) => {
          actionMenu.sync('furniture', undefined);
          interactionPressTarget = interactionTargetAt();
          interactInput.keyDown(action, at);
        },
        keyUp: (action, at) => {
          // The press that held the furniture menu open confirms what it points at on release.
          const confirming = openTarget('furniture') !== undefined;
          interactInput.keyUp(action, at);
          if (confirming) {
            interactionPressTarget = interactionTargetAt();
            completeWorldInteraction('pocket');
          }
          interactionPressTarget = undefined;
        },
      },
      offHandUse: {
        keyDown: (at) => pressHeldUse('off', at),
        keyUp: (at) => heldActionPress.release('off', at),
      },
      quickbar: {
        keyDown: (slot, at) => quickbarInput.keyDown(slot, at),
        keyUp: (slot, at) => quickbarInput.keyUp(slot, at),
      },
      cancelHeld: () => cancelHeldInput(),
    },
  });
  const session = createSession({
    registry,
    actorFigureFiles,
    scenario: engine.scenario,
    powerDevices: engine.powerDevices,
    objective: scenarioObjective(engine.site),
    discovery: scenarioDiscovery(engine.site),
    handedness: options.handedness,
    world: engine.world,
    terrainDestruction: { terrain: engine.canonicalTerrain, source: engine },
    isSolid: engine.isSolid,
    isOpaque: engine.isOpaque,
    scale,
    seed: config.seed,
    voicePitchOverrides: config.debugVoicePitch,
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
    actorReady: (x, z) => replayPlayer?.isReady(x, z) ?? streamer.isReady(x, z),
    controls: debugGunPose.guard(spectator.guard(router.controls)),
    // The session works in blocks; playback is in metres.
    audio: {
      play: playSessionSound,
      onMoveStart: (move, ownerLocation, position, time) => {
        const takeSound =
          move.from.kind === 'pocket' ? defOf(registry, move.from.owner.type).container?.takeSound : undefined;
        const cue = handlingMoveStartCue(move, ownerLocation, position, takeSound);
        if (cue) {
          session.playPlayerSound(cue.event, time);
        }
      },
      onMoveComplete: (move, time) => {
        const cue = handlingMoveCompleteCue(move, registry, {
          blockIdAt: (x, y, z) => engine.world.getBlock(x, y, z),
          entities: inventory.entities,
          vehicles: inventory.vehicles,
          blockSize: s,
        });
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
    onConsumed: (type) => guide?.consumed(type),
    onHandlingOutcome: (item, outcome) => guide?.weapons.handling(item, outcome, registry),
    onDischarge: (item, sighted) => guide?.weapons.discharged(item, sighted, registry),
    onCompletedSwing: (isFist) => {
      if (isFist) {
        guide?.unarmedHit();
      }
    },
    onBatterySwapped: (lightType) => guide?.batterySwapped(lightType),
    onOpened: (type) => guide?.opened(type),
    onUnpacked: (type) => guide?.weapons.unpackedAmmo(type),
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
    onTerrainEdited: (chunks) => streamer.markEdited(chunks),
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
    // Presentation only: what the simulation decided (a part severed, an actor dead) drawn as debris and a
    // corpse, blood for every wound, and flesh chunks for a carve or a hard hit. Only MobActorMeshes implements the actor-effect hooks; ActorMeshes leaves
    // them undefined.
    actorEffects: {
      onWound: (id, _actor, hit, damage) => {
        actorMeshes.actorWounded?.(id, hit);
        view.gore.spray(hit, damage);
        view.gore.wounded(hit, damage);
      },
      onSever: (id, actor, part, hit) => {
        const launchVelocity = actorMeshes.actorSevered?.(id, part, hit, actor);
        view.gore.severed(hit, launchVelocity, actor.type.severedSpurt);
      },
      onCarve: (id, actor, cells, hit) => {
        actorMeshes.actorCarved?.(id, actor);
        view.gore.carved(hit, cells.length);
      },
      onIncapacitated: (id, actor) => actorMeshes.actorIncapacitated?.(id, actor),
      onDeath: (id, actor) => actorMeshes.actorDied?.(id, actor, [...body.pos]),
      ...(config.debug ? { onMeleeResult: (result) => debugTools?.recordMeleeResult(result) } : {}),
      onMeleeContact: (impulse) => view.recoil(impulse),
    },
  });
  audio = new GameAudio({
    registry,
    blockSize: s,
    isSolid: session.isSoundBlocking,
    tuning: playerSenseTuning,
    files: options.assets.audio,
    report: appendError,
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
  } = session;
  const playHalted = { value: false };
  const opticZoom = new OpticZoom(registry);
  const zoomFirearm = () => {
    const selected = selectPrimaryAction(inventory);
    return selected.kind === 'firearm' ? selected.item : undefined;
  };
  const { hasGunPoseInput, isFirearmReady, isAimingDownSights, shouldPlayerBlock } = router.readiness;
  /** Effective ADS: wanted and, for a long gun, acquired through its Combat-owned acquisition time. */
  const isAimedDownSights = (): boolean => {
    const action = selectPrimaryAction(inventory);
    return action.kind === 'firearm' && isAimingDownSights() && firearms.isAdsAcquired(action.item.uid);
  };
  /**
   * The view's share of the aim from hip to sights: it rides the sim's acquisition progress while the
   * sights are wanted and settles back over the content blend once they are not. Presentation state
   * only; it reads the simulation and never writes it (`packages/deadvox/DESIGN.md`, "Combat and noise").
   */
  const adsViewBlend = claimed(registry.figures, 'player')!.aimPose.ads.viewBlend;
  let adsAimShown = 0;
  const adsAimTarget = (): number => {
    const action = selectPrimaryAction(inventory);
    if (!(action.kind === 'firearm' && isAimingDownSights())) {
      return 0;
    }
    const progress = firearms.adsAcquisitionProgress(action.item.uid);
    const eased = adsViewBlend.easing === 'smoothstep' ? progress * progress * (3 - 2 * progress) : progress;
    return eased;
  };
  const advanceAdsAim = (dt: number): void => {
    const target = adsAimTarget();
    adsAimShown =
      target >= adsAimShown
        ? target
        : Math.max(target, adsAimShown - dt / Math.max(adsViewBlend.blendBackRealSeconds, Number.EPSILON));
  };
  /** The aim is in view while it is wanted or still settling back; the pose blends by the share shown. */
  const adsViewActive = (): boolean => isAimingDownSights() || adsAimShown > 0;
  const adsViewPose = () => playerAdsPose(inventory, adsViewActive(), aim.frame, adsAimShown);
  const { lookSensitivityRadiansPerPixel, freeLook } = playerTuning(registry).aim;
  input.controls.setFreeLook(freeLook, () => spectator.enabled || isAimingDownSights());
  input.setLookSensitivity(
    lookSensitivityRadiansPerPixel,
    () => 1 + (opticZoom.appliedPower(zoomFirearm(), adsViewActive()) - 1) * adsAimShown,
  );
  const { compression } = sim;
  if (session.restoredLook) {
    input.controls.yaw = session.restoredLook.yaw;
    input.controls.pitch = session.restoredLook.pitch;
    input.controls.walking = session.restoredLook.walk;
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
  const { actors: actorSystem, playerCombat, actorStore } = session;
  if (!options.restore) {
    applyStartState(inventory, requireStart(config.content, config.startId, config.debug), {
      fresh: true,
      character: session.character,
      body: sim.body,
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
    if (inputRecording.recorder) {
      inputRecording.recorder.queueColumnChange(cx, cz, true);
    }
  };
  streamer.onColumnUnload = (cx, cz) => {
    if (replayPlayer) {
      return;
    }
    applyColumnUnload(cx, cz);
    if (inputRecording.recorder) {
      inputRecording.recorder.queueColumnChange(cx, cz, false);
    }
  };
  const view = createPlayView(engine, inventory, appendError, {
    models: options.assets.models,
    actorFigureFiles,
    ragdoll: options.ragdoll,
    probes: options.page.probes,
    poweredLights: () => session.power?.lights() ?? [],
    physicalSolid: session.physicalSolid,
  });
  input.setMouseLookOverride((movementX, movementY) => {
    // Look holds while a menu is open, so choosing cannot lose its target.
    const entries = openMenuEntries();
    if (entries) {
      actionMenu.point(entries, { x: movementX, y: movementY }, actionMenuTuning);
      return true;
    }
    return thirdPersonOrbit.rotate(
      movementX,
      movementY,
      isPlayerThirdPersonView(thirdPersonViewEnabled, spectator.enabled),
    );
  });
  input.setHeldUseOverride({
    press: (at) => pressHeldUse('dominant', at),
    release: (at) => heldActionPress.release('dominant', at),
  });
  const { weather, caseEffects, itemThrows, impactEffects, flashlight, actorMeshes } = view;
  const damageEvents = sim.events.reader();

  // ---- UI ----

  const overlay = $('overlay');
  const gameCursor = mountGameCursor($('game-cursor-root'));
  const inventoryPanel = $('inventory');
  const { screenText } = claimed(registry.ui, 'interface')!;
  const reading = mountReading($('reading'), screenText.reading, inputBindings, {
    changed: () => syncMenuState(),
    closing: () => router.readingClosed(),
  });
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
    renderHudOptions($('hud-options'), { text: hudOptionsText, keys: inputBindings }, hudOptions, (key, value) => {
      hudOptions[key] = value;
      writeHudOptions(hudOptions);
      drawHudOptions();
    });
  drawHudOptions();
  const prompt = $('prompt');
  const actionRadialRoot = $('action-radial');
  const drawActionRadial = mountActionRadial(actionRadialRoot, actionMenuTuning);
  /**
   * Draws the open menu's ring, which follows the interaction hints' visibility, or its child ring, which owns input
   * like any other menu and so always shows.
   */
  const drawActionMenu = (ringVisible: boolean): void => {
    const entries = openMenuEntries() ?? [];
    const ring = ringVisible || actionMenu.childOpen ? (actionMenu.ring(entries) ?? []) : [];
    const centre = actionMenu.canReturn(entries) ? screenText.actionMenu.back : undefined;
    drawActionRadial(ring, actionMenu.choice(entries)?.id, actionMenu.pull, centre);
  };
  /** Closes the held menu once its item leaves the hands or its child ring has nothing left to offer. */
  const syncHeldActionMenu = (paused: boolean): void => {
    const item = openHeldItem();
    const inHand = item && survival.handOf(item) !== undefined ? item : undefined;
    actionMenu.sync('held', inHand?.uid, paused);
    if (actionMenu.childOpen && inHand) {
      actionMenu.ring(heldMenuEntries(inHand));
    }
  };
  const quickbarBox = $('quickbar');
  const handlingBox = $('handling');
  const restBox = $('rest');
  appendError(engine.contentErrors);
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

  const hooks: ScreenHooks = {
    bindings: inputBindings,
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
    dispatch: router.dispatchScreenCommand,

    searching: session.searching,
    notice: showNotice,
    refusal: (text) => showRefusal(text, sim.time),
    describe: (item) => [
      ...survival.describe(item),
      ...firearms.describe(item),
      ...magazines.describe(item),
      ...pinDescription(session.fuses.state(item)),
    ],
    workOptions: (uid) => session.crafting.options(uid),
    recovery: (uid, choices) => session.crafting.recovery(uid, choices),
    character: () => session.character,
    body: () => sim.body,
    slotLabels: claimed(registry.ui, 'interface')!.wearSlotLabels,
    needs: () => needsText(),
    wakeGameHour: () => (rest.canSetWakeTime ? { gameHour: rest.wakeGameHour } : undefined),
    actionRefusal: () => sim.body.actionRefusal,
    attachmentCandidates: (firearmUid, slotId) => session.firearmAttachments.offers(firearmUid, slotId),
  };
  const screen = new InventoryScreen(inventoryPanel, inventory, queue, hooks);

  const craftPanel = mountCraftPanel($('crafting'), session, {
    notice: (text) => showRefusal(text, sim.time),
    dispatch: router.dispatchScreenCommand,
  });

  let revealActors = false;
  const recording = createAttemptRecording(
    engine.attemptPolicy,
    config.seed,
    () => localStorage,
    engine.site?.playtestMarks,
  );
  playtestObserver = recording?.observer;
  const scenarioAttemptFile = (): HandBackFile => {
    if (!session.scenarioRun) {
      throw new Error('Attempt reports require scenario run state');
    }
    const snapshot = captureSnapshot();
    return {
      name: `skelly-attempt-${snapshot.character.id}.json`,
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
  const attemptMetricsFile = recording?.file.bind(null, scenarioAttemptFile);
  const measureSnapshot = () => debugModule!.measureSnapshotForSession(captureSnapshot, session);
  const openInventoryScreen = (): void => {
    screen.open();
  };
  const closeInventoryScreen = (): void => {
    openedVehicleId = undefined;
    screen.close();
  };
  const replayPlayState = createReplayPlayStateBinding({
    getLeanAmount: () => session.leanAmount,
    setLeanAmount: (value) => session.restoreLean(value),
    getThrowingStance: () => router.throwingStance(),
    setThrowingStance: (value) => {
      router.setThrowingStance(value);
    },
    getReadyHeld: () => input.controls.rightMouseHeld,
    setReadyHeld: (value) => {
      input.controls.rightMouseHeld = value;
    },
    getAimingDownSights: () => input.controls.aimingDownSights,
    setAimingDownSights: (value) => {
      input.controls.aimingDownSights = value;
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
  const stepper = createSimulationStepper({
    sim,
    advance: (simDt, until) => session.frame(simDt, until),
    worldReady: () => worldLoading.ready,
    gameFrozen: () => debugTools?.frozen ?? false,
    replayPlayer,
    replayDriver,
    replay: options.replay,
    recording: inputRecording,
    captureSnapshot,
    generatedColumns: () => streamer.generatedColumns(),
    captureReplayStartState,
  });

  const importReplay = (bytes: Uint8Array): void => {
    stashInputReplay(() => sessionStorage, bytes);
    options.page.reloadForReplay();
  };
  const inputReplayHooks: DebugHooks['inputReplay'] = {
    state: (): InputReplayStatusState => {
      if (!replayPlayer) {
        if (inputRecording.recorder) {
          return 'recording';
        }
        return inputRecording.stoppedReason ? 'stopped' : 'idle';
      }
      const verification = stepper.replayVerification;
      switch (verification) {
        case 'matched':
          return 'verified';
        case 'diverged':
        case 'unavailable':
          return verification;
        default:
          return 'playing';
      }
    },
    status: () =>
      inputReplayStatus({
        replayPlayer,
        inputRecorder: inputRecording.recorder,
        previousRecorder: inputRecording.previous,
        total: options.replay?.inputs.frames.length ?? 0,
        verification: stepper.replayVerification,
        verificationTick: stepper.replayVerificationTick,
        stoppedReason: inputRecording.stoppedReason,
      }),
    export: () => {
      if (inputRecording.stoppedReason) {
        throw new Error(inputReplayStoppedStatus(inputRecording.stoppedReason));
      }
      return withReplayExportGuard(session.hasFirearmHandlingOverrides(), () =>
        encodeRecentInputReplay(
          {
            previousRecorder: inputRecording.previous,
            recorder: inputRecording.recorder,
            stoppedReason: inputRecording.stoppedReason,
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
  const exportMetrics = bindMetricsExport(attemptMetricsFile, handBack);
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
      const mapUrl = new URL(options.page.reviewMapHref);
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
      mapUrl.searchParams.set('playerYaw', String(input.controls.yaw));
      reviewMapFrame.src = mapUrl.href;
      input.unlock();
      input.controls.cancel();
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
    keyboard: keyboardInput,
    weather,
    flashlight,
    solidity: { isSolid: session.physicalSolid, isOpaque: session.isOpaque },
    body,
    inventory,
    character: session.character,
    newGame: options.restore === undefined,
    sim,
    input: input.controls,
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
    actors: () => actorSystem,
    actorRenderer: actorMeshes,
    spectatorCamera: {
      enabled: () => spectator.enabled,
      toggle: () => {
        cancelHeldInput();
        spectator.toggle(body, eye(), input.controls.yaw, input.controls.pitch);
      },
      teleport: () => spectator.teleport(body, session.playerEyeHeightMetres / s, session.physicalSolid),
    },
    thirdPerson,
    gunPose: { mode: () => debugGunPose.mode, toggle: (mode) => debugGunPose.toggle(mode) },
    mannequin: view.avatarMannequin,
    perceptionLabels: {
      enabled: () => perceptionLabelsEnabled,
      toggle: () => {
        perceptionLabelsEnabled = !perceptionLabelsEnabled;
      },
    },
    emitTestNoise: () =>
      !replayPlayer &&
      session.playPlayerSound(
        (engine.scenario ? registry.body.get(engine.scenario.body)! : claimed(registry.body, 'player')!).sounds.hurt
          .light,
        sim.time,
        { sourceLabel: 'debug test noise' },
      ),
    feet,
    showNotice,
    strikeTerrainCell: (cell, blow) => !replayPlayer && session.strikeTerrainCell(cell, blow),
    // A look reaches rubble clearing with no player-facing view: the trigger is the aimed rubble cell itself.
    takeApartCell: (cell) =>
      replayPlayer
        ? 'Input replay owns this run'
        : router.dispatchScreenCommand({ kind: 'craft.take-apart-cell', cell: [cell[0], cell[1], cell[2]] }),
    compress: () => router.compress(),
    skipGameHours: (hours) => skipGameHours(hours),
    setTimeOfDay: (hour, minute) => {
      const timeOfDay = hour * 3600 + minute * 60;
      sim.setDebugCalendarTime(nextTimeOfDay(sim.calendar, timeOfDay));
      options.saveController?.rearmAutosaveAfterTimeSeek();
    },
    revealActors: (enabled) => {
      revealActors = enabled;
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
  const closeMenusFor = ({ paused, closeOtherMenus }: { paused: boolean; closeOtherMenus: boolean }): void => {
    if (paused || closeOtherMenus) {
      actionMenu.close();
    }
    if (closeOtherMenus) {
      reading.close();
      closeInventoryScreen();
      debugTools?.closeMenus();
    }
  };
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
    if (pointerLockChanged || state.closeOtherMenus) {
      resumeRequested = false;
    }
    closeMenusFor(state);
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
      input.controls.cancel();
      keyboardInput.cancel();
      sim.paused = syncMenuState().paused || (debugTools?.frozen ?? false);
      replayPlayState.restore(options.replay?.startState);
      inputRecording.recorder = createInputReplayRecorder(
        Boolean(options.replay),
        captureSnapshot,
        streamer.generatedColumns(),
        { startState: captureReplayStartState, registry },
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

  /**
   * Debug: fast-forwards the real clock by `hours` game hours through the same compressed
   * stepping as rest (needs, scheduler and actors all run). Another call
   * during a skip pushes the target out. It replaces a rest/sleep in progress.
   */
  const skipGameHours = (hours: number): void => {
    if (sim.actions.job?.jobType === 'forceDoor' || sim.actions.job?.jobType === 'wait') {
      sim.actions.stop();
    } else {
      rest.stop();
    }
    queue.cancel();
    stepper.skipGameHours(hours);
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

  const quickbarInput = new QuickbarInput({ tap: router.quickbarTap, hold: router.quickbarHold });
  const crouchProneInput = new CrouchProneInput({
    holdRealMs: () => playerSenseTuning.crouchProneHoldRealSeconds * 1000,
    action: router.requestStanceAction,
  });
  const throwStanceInput = new PressHoldInput<string>({
    holdRealMs: () => throwStanceDropHoldRealSeconds * 1000,
    tap: () => router.toggleThrowingStance(),
    hold: () => router.dropHeldItemForThrowingStance(),
  });
  const interactInput = new PressHoldInput<string>({
    holdRealMs: () => RELOAD_GESTURE_MS.hold,
    tap: () => completeWorldInteraction('pocket'),
    hold: () => completeWorldInteraction('wield'),
  });
  const dispatchHeldAction = (item: Item, actionId: string): void => {
    const reason = router.dispatchScreenCommand({ kind: 'hand.action', itemUid: item.uid, actionId });
    if (reason) {
      showRefusal(reason, sim.time);
    }
  };
  const heldActionPress = new HeldActionPress({
    menu: actionMenu,
    item: (hand) => inventory.hands[hand],
    actions: (item) => survival.availableItemActions(item),
    menuActions: (item) => heldMenuEntries(item),
    holdRealMs: RELOAD_GESTURE_MS.hold,
    tap: (_hand, trigger) => {
      if (trigger === 'dominant') {
        input.controls.pressDominantUse();
        input.controls.releaseDominantUse();
      } else if (trigger === 'off') {
        input.controls.useOff();
      } else {
        router.useForwardButton();
      }
    },
    act: dispatchHeldAction,
  });
  /** Hands a use press to the held item's action press, unless something else owns the hands or the input. */
  const pressHeldUse = (trigger: HeldActionTrigger, at: number): boolean => {
    const taken = heldUsePressTaken(trigger, {
      replaying: Boolean(replayPlayer),
      throwingStance: router.throwingStance(),
      inputLocked: compression.locksInput,
      actionRefused: Boolean(sim.body.actionRefusal),
      building: Boolean(debugTools?.buildOn),
      enGarde: router.readiness.shouldPlayerBlock(),
      offHandUse: Boolean(offHandUse(registry, inventory)),
    });
    if (!taken) {
      return false;
    }
    const hand = trigger === 'dominant' ? dominantSide(inventory.character) : offSide(inventory.character);
    return heldActionPress.press(hand, trigger, at);
  };
  const wornLightInput = new PressHoldInput<string>({
    holdRealMs: () => wornLightToggleHoldRealSeconds * 1000,
    tap: () => undefined,
    hold: () => router.toggleWornLights(),
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
    crouchProneInput.cancel();
    throwStanceInput.cancel();
    interactInput.cancel();
    heldActionPress.cancel();
    wornLightInput.cancel();
    interactionPressTarget = undefined;
    cancelBackquoteGesture(backquoteGesture);
  });

  const activePlayContext = (): InputContext => {
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
  const playContext = (): InputContext => (mainMenuOpen || sim.dead ? 'menu' : activePlayContext());
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
  keyboardInput.pointerTarget = (event) => menuPointer.target(event.target);
  keyboardInput.cancelled = (preservePointer, reason) => {
    if (!shouldCancelForViewerFocus(reason ?? 'manual')) {
      return;
    }
    input.controls.cancel(preservePointer);
    screen.cancelInput();
    cancelBackquoteGesture(backquoteGesture);
    router.cancelItemThrow();
    throwStanceInput.cancel();
    crouchProneInput.cancel();
    quickbarInput.cancel();
    heldActionPress.cancel();
  };
  keyboardInput.escape = () => {
    if (actionMenu.opened) {
      heldActionPress.cancel();
      actionMenu.close();
    } else if (sim.dead) {
      if (reviewMapOpen) {
        toggleReviewMap(false);
      }
      router.modalCommand('ui.main-menu-toggle');
    } else if (reviewMapOpen) {
      toggleReviewMap(false);
    } else {
      reading.close();
    }
  };
  const handleDebugCommand = (action: string, at: number): boolean =>
    dispatchDebugCommand(action, at, {
      backquoteGesture,
      debugTools,
      facingYaw: input.controls.yaw,
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
      facingYaw: input.controls.yaw,
    });
  const cancelHeldInput = (): void => {
    screen.cancelInput();
    input.controls.reload.cancel();
    crouchProneInput.cancel();
    throwStanceInput.cancel();
    router.cancelItemThrow();
    quickbarInput.cancel();
    interactInput.cancel();
    heldActionPress.cancel();
    wornLightInput.cancel();
    interactionPressTarget = undefined;
    cancelBackquoteGesture(backquoteGesture);
  };
  keyboardInput.command = (command) => router.dispatchInputCommand(command);
  ({ dispatchReplayAction } = router);
  keyboardInput.install();
  keyboardInput.sync();
  const stepActionMenu = (direction: number): boolean => {
    const entries = openMenuEntries();
    return entries !== undefined && actionMenu.step(entries, Math.sign(direction));
  };
  keyboardInput.choiceStep = stepActionMenu;
  globalThis.addEventListener(
    'wheel',
    (e) => {
      if (input.locked && mainMenuOpen) {
        $('overlay').querySelector<HTMLElement>('.card')!.scrollTop += e.deltaY;
        e.preventDefault();
      } else if (input.locked && !input.menuPointer && !spectator.enabled) {
        if (stepActionMenu(e.deltaY) || opticZoom.wheel(zoomFirearm(), isAimedDownSights(), e.deltaY)) {
          e.preventDefault();
        } else {
          debugTools?.wheel(e.deltaY);
        }
      }
    },
    { passive: false },
  );

  const lookDir = (): Vec3 =>
    aimDirection(replaySample?.yaw ?? input.controls.yaw, replaySample?.pitch ?? input.controls.pitch, NEUTRAL_AIM);
  const eye = (): Vec3 =>
    playerEyePosition({
      feet: body.pos,
      blockSize: s,
      yaw: spectator.avatarYaw(input.controls.yaw),
      pitch: spectator.avatarPitch(input.controls.pitch),
      stance: session.stance,
      lean: session.lean,
      figure: claimed(registry.figures, 'player')!,
      models: registry.models,
      ads: adsViewPose(),
    });

  const heldBodyPose = () =>
    playerLookPose({
      figure: claimed(registry.figures, 'player')!,
      models: registry.models,
      pitch: spectator.avatarPitch(input.controls.pitch),
      stance: session.stance,
      lean: session.lean,
      ads: adsViewPose(),
    });
  /** The body's seats and eyes a held firearm is placed from, so the shot leaves the drawn gun. */
  const heldBodyInput = (side: HandSide) => {
    const pose = heldBodyPose();
    return {
      stockSeat: pose.stockSeats[side],
      seatFrame: playerHeldSeatFrame(pose, input.controls.pitch),
      leanRollRadians: session.lean.rollRadians,
      adsEyes: pose.eyes,
    };
  };

  /** Part boxes for picking: the same projection vehicle reach measures to. */
  const currentVehicleParts = () => session.vehicleParts.all();

  /** The view's pick for the affordance, the interact press and the debug ray; hand use picks from the session's eye. */
  const interactionTargetAt = (): InteractionTarget | undefined => router.interactionTargetAt(eye(), lookDir());

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
    const values = { key: keyCap(inputBindings, 'world.interact'), finish: finish.label.toLowerCase() };
    return dismember.ok
      ? fillHint(lines.hints.downedBody, values)
      : fillHint(lines.hints.downedBodyRefused, { ...values, reason: dismember.reason.toLowerCase() });
  };

  /** Describes the displayed action for the selected target. */
  const useText = (entity: BlockEntity): HintText => {
    if (session.isObjective(entity)) {
      return fillHint(lines.hints.activate, { key: keyCap(inputBindings, 'world.interact'), name: nameOf(entity) });
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
      inputBindings,
    );
  };

  const furnitureChoicePayload = (entity: BlockEntity, selected: ItemAction): ReplayActionPayload | undefined => {
    if (selected.id === 'repair') {
      quickbarInput.cancel();
      screen.openRepair(entity.uid);
      mainMenuOpen = false;
      syncMenuState();
      return undefined;
    }
    if (selected.workUid !== undefined) {
      return { kind: 'inventory.work', itemUid: selected.workUid, operation: 'continue' };
    }
    if (selected.id === 'lift') {
      return { kind: 'furniture.lift', entityUid: entity.uid };
    }
    return selected.id === 'drag'
      ? { kind: 'furniture.lift', entityUid: entity.uid, floorLocked: true }
      : { kind: 'furniture.slide', entityUid: entity.uid, way: 'push' };
  };
  const confirmFurnitureAction = (entity: BlockEntity): ReplayActionPayload | undefined => {
    const selected = actionMenu.confirm(furnitureMenuEntries(entity));
    return selected && furnitureChoicePayload(entity, selected);
  };
  const furniturePayload = (entity: BlockEntity, mode: 'pocket' | 'wield'): ReplayActionPayload | undefined => {
    if (actionMenu.isOpen('furniture', entity.uid)) {
      return confirmFurnitureAction(entity);
    }
    if (mode === 'wield' && furnitureActions(entity).length > 0) {
      return { kind: 'furniture.interact', entityUid: entity.uid, alternatives: true };
    }
    if (mode === 'wield' && entity.bar) {
      return { kind: 'furniture.lift', entityUid: entity.uid };
    }
    const control = session.power?.control(entity);
    return control
      ? { kind: 'power.set', entityUid: entity.uid, enabled: !control.enabled }
      : { kind: 'furniture.interact', entityUid: entity.uid };
  };

  /**
   * A tap pockets an item or finishes off a downed body; a hold wields the item, dismembers
   * the body or opens the movable piece's action list.
   */
  function interactionPayload(
    target: Exclude<InteractionTarget, { kind: 'vehicle' }>,
    mode: 'pocket' | 'wield',
  ): ReplayActionPayload | undefined {
    switch (target.kind) {
      case 'item':
        return { kind: 'item.pickup', itemUid: target.item.uid, mode, feet: feet() };
      case 'body':
        return { kind: 'actor.downed', actorId: target.id, way: mode === 'pocket' ? 'finish-off' : 'dismember' };
      default:
        return furniturePayload(target.entity, mode);
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
      {
        inventory,
        reach: session.reach(),
        refusal: (work, id, target, itemUid) => session.vehicleWorkRefusal(work, id, target, itemUid),
      },
      openedVehicleId,
    );
    return inspection && { view: inspection, distanceMetres: session.vehicleDistance(openedVehicleId) };
  }

  /** While a piece is carried, either press sets it down wherever the crosshair points. */
  function completeWorldInteraction(mode: 'pocket' | 'wield'): void {
    if (input.controls.freeLooking) {
      interactionPressTarget = undefined;
      return;
    }
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
    const reason = router.dispatchScreenCommand(payload);
    if (reason) {
      showRefusal(reason, sim.time);
    }
  }

  inputTarget.addEventListener('contextmenu', (e) => e.preventDefault());
  const meleeWeapon = () => router.meleeSelection().weapon;
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
    if (!input.locked || input.menuPointer || spectator.enabled || debugTools?.buildOn || !compression.admitKey()) {
      return;
    }
    if (router.refusePrimaryUseWhileHandling()) {
      return;
    }
    if (!pressHeldUse('forward', e.timeStamp)) {
      router.useForwardButton();
    }
  };
  document.addEventListener('pointerdown', onForwardPress, true);
  document.addEventListener('mousedown', onForwardPress, true);
  listenForwardRelease((at) => heldActionPress.release('forward', at));
  inputTarget.addEventListener('mousedown', (e) => {
    if (!input.locked || input.menuPointer || spectator.enabled || !debugTools?.buildOn || !compression.admitKey()) {
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
    router.throwingStance() && interactionVisible && input.locked && !screen.isOpen && !reading.isOpen && !mainMenuOpen;

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
        walking: input.controls.walking,
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
      inputBindings,
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
  const openFurnitureMenuHint = (entity: BlockEntity, key: HintText): HintText => {
    const selected = actionMenu.choice(furnitureMenuEntries(entity));
    return selected
      ? html`${key}: ${selected.label} ${selected.id === 'repair' ? '' : nameOf(entity)}`
      : useText(entity);
  };
  const furnitureInteractionHint = (entity: BlockEntity): HintText => {
    const key = keyCap(inputBindings, 'world.interact');
    if (actionMenu.isOpen('furniture', entity.uid)) {
      return openFurnitureMenuHint(entity, key);
    }
    if (furnitureActions(entity).length > 0) {
      return html`${useText(entity)} · ${fillHint(screenText.interaction.hold, { key, action: screenText.interaction.actions })}`;
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
    return useText(entity);
  };
  const powerControlHint = (entity: BlockEntity): HintText | undefined => {
    const control = session.power?.control(entity);
    return control
      ? html`${keyCap(inputBindings, 'world.interact')}: ${screenText.powerControl[control.enabled ? 'off' : 'on']} ${nameOf(entity)}`
      : undefined;
  };
  const interactionHintFor = (
    target: InteractionTarget | undefined,
    carry: ReturnType<typeof carryPreview>,
  ): HintText | undefined => {
    const key = keyCap(inputBindings, 'world.interact');
    if (carry) {
      return playCarryText(
        'refusal' in carry.spot
          ? carry.spot.refusal
          : fillHint(lines.hints.setDown, { key, name: nameOf(carry.entity) }),
        screenText.interaction,
        inputBindings,
      );
    }
    switch (target?.kind) {
      case 'item':
        return fillHint(lines.hints.groundItem, { key, item: inventory.name(target.item) });
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
    // The furniture menu lasts only as long as the press that opened it.
    const choosingFurniture =
      target?.kind === 'furniture' && !carry && (replayPlayer !== undefined || keyboardInput.held('world.interact'));
    actionMenu.sync('furniture', choosingFurniture ? target.entity.uid : undefined, sim.paused);
    syncHeldActionMenu(sim.paused);
    const interactionHint = interactionHintFor(target, carry);
    drawActionMenu(visible.interaction && input.locked && !debugTools?.buildOn);
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
      inputBindings,
    );
  };

  let quickbarDrawn = '';
  const drawQuickbar = () => {
    const key = quickbarKey(quickbar, inventory, inputBindings);
    if (key !== quickbarDrawn) {
      quickbarDrawn = key;
      renderQuickbar(quickbarBox, quickbar, inventory, inputBindings);
    }
    quickbarBox.hidden = debugTools?.buildOn ?? false;
  };

  const updateVisualFeedback = (dt: number): void => {
    input.controls.advanceFreeLook(dt);
    advanceAdsAim(dt);
    for (const event of damageEvents.read()) {
      if (event.kind === 'damage') {
        view.damage(event.amount);
      }
    }
    const orbitAngle = thirdPersonOrbit.angle(isPlayerThirdPersonView(thirdPersonViewEnabled, spectator.enabled));
    const look = heldLook();
    view.updateCamera(
      {
        dt,
        body,
        paused: sim.paused,
        noclip: debugTools?.noclip ?? false,
        yaw: spectator.avatarYaw(input.controls.yaw),
        pitch: spectator.avatarPitch(input.controls.pitch),
        headYaw: spectator.enabled ? 0 : input.controls.freeLook.yaw + look.yaw,
        headPitch: spectator.enabled ? 0 : input.controls.viewPitch - input.controls.pitch + look.pitch,
        stridePhase: session.playerStridePhase,
        stance: session.stance,
        lean: session.lean,
        ads: adsViewPose(),
        adsAim: adsAimShown,
        eye: eye(),
        ...(spectator.body
          ? { spectator: { position: [...spectator.body.pos], yaw: input.controls.yaw, pitch: input.controls.pitch } }
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
          actors: actorStore.size,
          sounds: audio.heardSounds,
          simulationMs,
          renderMs,
          meshingQueueMs,
          entities: actorStore.size + [...entities.all].length + inventory.piles.size,
          compression: compression.c,
          snapshotLastMs: snapshotHistory.lastMs ?? 0,
          snapshotP95Ms: snapshotHistory.p95Ms,
          snapshotCount: snapshotHistory.count,
        },
        walking: input.controls.walking,
        positionBlocks: body.pos,
        blockSize: s,
        calendar: displayCalendar(),
        chunks: engine.world.chunks.values(),
        drawn: [engine.meshes.batch],
        revealedPositions: revealActors
          ? [...actorStore.entries()].map(([, { body: actorBody }]) => actorBody.pos)
          : [],
      }),
    );
  };

  const firearmReadiness = () => {
    const selected = selectPrimaryAction(inventory);
    // The simulation raises the gun for a press check without the ready input; see
    // `packages/engine/src/game/session.ts`, `raisedFirearm`.
    const raised = debugGunPose.readyHeld(input.controls.rightMouseActionHeld) || pressChecking();
    if (selected.kind !== 'firearm' || !raised || !hasGunPoseInput()) {
      return;
    }
    return {
      uid: selected.item.uid,
      progress: firearms.readyProgress(selected.item.uid),
      aimingDownSights: isAimedDownSights(),
      adsAim: adsAimShown,
    };
  };

  const handlingPresentation = () => {
    const [job] = queue.jobs;
    return { job, progress: worldGrabProgress(inventory, job) };
  };

  const throwingPresentation = () => {
    if (!router.throwingStance()) {
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
    const ready = shouldPlayerBlock();
    const action = playerCombat.activeMeleeAction;
    const elapsed = action
      ? Math.min(action.cooldown, action.elapsed + (sim.paused ? 0 : Math.max(0, sim.time - session.lastPlayerStep)))
      : 0;
    const pose = renderMeleePose(action, elapsed, ready, {
      leading: dominantSide(inventory.character),
      holds: claimed(registry.figures, 'player')!.holds,
    });
    const { job: handlingJob, progress: grabProgress } = handlingPresentation();
    view.updateHeld(dt, pose, spectator.enabled ? undefined : survival.lit, {
      floorPlacement: carryFloorPlacement(),
      firearms: firearms.frames(),
      opticZoom: opticZoom.frame(zoomFirearm(), isAimedDownSights()),
      ...(readiness === undefined ? {} : { readiness }),
      aim: aim.frame,
      job: handlingJob,
      ...(grabProgress === undefined ? {} : { grab: { progress: grabProgress } }),
      ...throwingPresentation(),
      dt,
    });
  };

  /** The firearm the primary action uses, with the model it is drawn as and the hand holding it. */
  const heldFirearm = () => {
    const selected = selectPrimaryAction(inventory);
    if (selected.kind !== 'firearm') {
      return;
    }
    const { item } = selected;
    return {
      item,
      model: sightedFirearmModel(registry, item) ?? firearmHandlingFor(item, registry).model,
      side: inventory.hands.right?.uid === item.uid ? ('right' as const) : ('left' as const),
      frame: firearms.frames().find((entry) => entry.uid === item.uid),
    };
  };

  const heldLook = (): { readonly yaw: number; readonly pitch: number } => {
    const held = heldFirearm();
    return held ? handlingLook(held.model, held.side, held.frame) : { yaw: 0, pitch: 0 };
  };

  const pressChecking = (): boolean => {
    const [job] = queue.jobs;
    return job !== undefined && isPressCheck(job);
  };

  const heldFirearmBore = (readiness = firearmReadiness()) => {
    const held = heldFirearm();
    if (!held) {
      return;
    }
    const tuning = firearmsCombatTuning(registry);
    const { item, model, side, frame: heldFirearmFrame } = held;
    const firearmPose = readiness?.uid === item.uid ? readiness : undefined;
    const progress = firearmPose?.progress ?? 0;
    const viewpoint = { eye: eye(), yaw: input.controls.yaw, pitch: input.controls.pitch };
    const leadingSide = dominantSide(inventory.character);
    const twoHanded = Boolean(registry.items.get(item.type)?.twoHanded);
    const aimingDownSights = firearmPose?.aimingDownSights ?? false;
    const poseInput = {
      holds: claimed(registry.figures, 'player')!.holds,
      model,
      side,
      leadingSide,
      twoHanded,
      progress,
      aimingDownSights,
      ...heldBodyInput(side),
      aimFrame: aim.frame,
      lookPitchRadians: input.controls.pitch,
      loweredPitchRadians: tuning.loweredPitchRadians,
    };
    const basePose = heldFirearmTransform(poseInput);
    const handlingTurn = handlingRotation(model, side, heldFirearmFrame, {
      x: basePose.rootOffset[0],
      y: basePose.rootOffset[1],
    });
    return firearmBoreRay({
      ...poseInput,
      ...viewpoint,
      blockSize: s,
      handlingTurn,
      handlingShift: handlingShift(model, side, heldFirearmFrame),
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
      actors: actorSystem,
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
      yaw: input.controls.yaw,
      pitch: input.controls.pitch,
      intent: input.controls.intent(),
      descend: keyboardInput.held('noclip.descend'),
      dt,
    });
  };

  const cancelItemThrowOnRightClick = (): void => {
    if (sim.body.actionRefusal && session.throwCharge.active) {
      router.cancelItemThrow();
      return;
    }
    if (!replayPlayer && input.controls.consumeRightMousePressed() && session.throwCharge.active) {
      router.dispatchScreenCommand({ kind: 'item.throw.cancel' });
      input.controls.suppressRightMouseUntilRelease();
    }
  };

  /** Advances the simulation one frame; returns whether the debug game freeze (M) is on. */
  const stepSimulation = (realDt: RealSeconds, menuPaused: boolean): boolean => {
    const worldReady = worldLoading.ready;
    if (worldReady) {
      cancelItemThrowOnRightClick();
    }
    const { gameFrozen, events } = stepper.step(realDt, { menuPaused });
    for (const event of events) {
      showNotice(event.text);
    }
    if (!worldReady) {
      return false;
    }
    stepFrozenNoclip(realDt, gameFrozen && !menuPaused);
    if (spectator.body && input.locked && !input.menuPointer) {
      debugTools?.stepNoclip({
        body: spectator.body,
        scale,
        yaw: input.controls.yaw,
        pitch: input.controls.pitch,
        intent: input.controls.intent(),
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
      rightMouseHeld: input.controls.rightMouseActionHeld,
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
    const actorAim = debugTools.aimEnabled ? actorSystem.aimAt(ray.origin, ray.direction, meleeWeapon()) : undefined;
    debugTools.updateAim(actorAim);
    debugTools.updateLookedAt(ray.origin, ray.direction, input.locked);
  };

  const updateActionInputs = (now: number): void => {
    const actionRefusal = Boolean(sim.body.actionRefusal);
    const { freeLooking } = input.controls;
    if (freeLooking) {
      router.cancelItemThrow();
      throwStanceInput.cancel();
    }
    if (actionRefusal || freeLooking) {
      input.controls.reload.cancel();
      quickbarInput.cancel();
      interactInput.cancel();
      heldActionPress.cancel();
      interactionPressTarget = undefined;
    } else {
      input.controls.reload.advance(now, router.reloadBinding());
    }
    const inputLocked = replaySample?.inputLocked ?? compression.locksInput;
    if (screen.isOpen || mainMenuOpen || inputLocked || sim.dead || actionRefusal || freeLooking) {
      quickbarInput.cancel();
      interactInput.cancel();
      wornLightInput.cancel();
      interactionPressTarget = undefined;
      heldActionPress.cancel();
    } else {
      quickbarInput.update(now);
      interactInput.update(now);
      heldActionPress.update(now);
      wornLightInput.update(now);
    }
    crouchProneInput.update(now, actionRefusal);
    throwStanceInput.update(now);
    updateBackquoteGesture(backquoteGesture, now);
  };

  const playerDrip = (region: BodyRegion) => sim.body.bleedingTier(region)?.drip;
  const goreFusedMass = (actor: Actor) =>
    actor.type.model === 'fused-mass' ? actorSystem.figureFor(actor.type, actor.figureSeed).fusedMass : undefined;
  // Blood holds still while the game is paused.
  const updateGore = (dt: RealSeconds): void => {
    view.gore.update(sim.paused ? 0 : dt, session.physicalSolid, {
      actors: actorStore,
      listener: body.pos,
      player: {
        pos: body.pos,
        yaw: spectator.avatarYaw(input.controls.yaw),
        drip: playerDrip,
        thirdPerson: isPlayerFigureWhole(thirdPersonViewEnabled, spectator.enabled),
      },
      fusedMass: goreFusedMass,
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
      restLabels: claimed(registry.ui, 'interface')!.restLabels,
      text: screenText,
      keys: inputBindings,
    });
  };

  const showFocusNotice = focusNoticeOnce(lines, playerStart.unknownFocus);
  const observeScenarioFrame = (seconds: number): void => {
    const live = worldLoading.ready && started && !mainMenuOpen && document.visibilityState === 'visible';
    showFocusNotice(live, showNotice);
    session.observeRunFrame(seconds, live);
  };

  const prepareStreaming = (now: RealTimestamp): void => {
    keyboardInput.reconcileFocus();
    streamer.update(body.pos[0], body.pos[2]);
    if (!worldLoading.ready && replayDriver && !replayDriver.initializeColumns()) {
      worldLoading.fail('Recorded terrain could not be initialized. Reload and choose another replay.');
    }
    if (worldLoading.ready) {
      updateActionInputs(now);
    }
  };

  const updateGuidance = () => {
    if (!guide) {
      return;
    }
    const { observe } = guide.definition;
    for (const item of Object.values(inventory.hands)) {
      if (item) {
        guide.weapons.wielded(item, registry);
      }
    }
    guide.observe({
      position: body.pos,
      yaw: input.controls.yaw,
      crouching: session.stance === 'crouching',
      doorOpen: [...entities.all].some((entity) => entity.type === observe.door && entity.open),
      searched: [...entities.all].some((entity) => entity.type === observe.searched && entity.searched),
      looted: inventory.looted.size > 0,
      wielded:
        observe.hands?.every((type) => Object.values(inventory.hands).some((item) => item?.type === type)) === true,
      lightOn: survival.lit?.type === observe.light && survival.lit?.on === true,
      litType: survival.lit?.on === true ? survival.lit.type : undefined,
      paused: mainMenuOpen && started,
    });
    drawGuidance?.({
      inventory,
      inventoryOpen: screen.isOpen,
      lightOn: survival.lit?.type === observe.light && survival.lit?.on === true,
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
    body: (id: EntityId) => actorStore.get(id)?.body,
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
      recording?.save();
    }
  };

  const finishDraw = (sky: Parameters<typeof view.prepareLighting>[0], now: RealTimestamp): boolean => {
    finishLoadingFrame(worldLoading, () => updateWorldLoading(now), {
      worldFeedsSkylight: Boolean(renderer),
      skylight: () => engine.skylight?.update([camera.position.x / s, camera.position.y / s, camera.position.z / s]),
      world: () => {
        view.prepareLighting(sky, now);
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
    const visible = hudVisibility(hudOptions, false, input.menuPointer);
    let mark = realNow();
    prepareStreaming(now);
    meshingQueueMs = realNow() - mark;
    playtestObserver?.beforeFrame(queue, inventory);
    mark = realNow();
    const gameFrozen = stepSimulation(dt, menuState.paused);
    updateBodyNotices();
    router.advancePendingItemThrow();
    router.syncThrowingStance();
    caseEffects.update(sim.time);
    updateGore(dt);
    impactEffects.update(dt, config.debug && debugLaserEnabled);
    simulationMs = realNow() - mark;
    options.saveController?.afterFrame();
    updateGuidance();
    observePlaytestFrame(elapsedReal, now);
    debugTools?.advanceRagdollSweep(dt);
    const { sky } = view.syncWorld({
      calendar: sim.calendar,
      time: sim.time,
      playerEye: eye().map((coordinate) => coordinate * s) as Vec3,
      playerChest: [body.pos[0] * s, body.pos[1] * s + PLAYER_CHEST_METRES, body.pos[2] * s],
      lastActorStep: session.lastActorStep,
      acidGlobs: actorSystem.acidGlobs,
      acidPuddles: actorSystem.acidPuddles,
      lastBackgroundStep: session.lastBackgroundStep,
      dt,
      entities,
      actors: actorStore,
      frozen: debugTools !== undefined && (actorSystem.isFrozen || gameFrozen),
      perceptionLabels: perceptionLabelsEnabled,
    });
    updateVisualFeedback(dt);
    const readiness = firearmReadiness();
    updateHeldItems(dt, readiness);
    const bore = heldFirearmBore(readiness);
    updateDebugTargets(bore, now);
    debugTools?.updateTransientDraw(now);
    updateDebugReadout(now);
    mark = realNow();

    const unconsciousPresentation = sim.body.unconscious && !sim.dead;
    document.body.classList.toggle('unconscious', unconsciousPresentation);
    audio.setOutputMuted(unconsciousPresentation);
    audio.updateHeartbeat(sim.needs.stamina);
    audio.updateListener([camera.position.x, camera.position.y, camera.position.z], lookDir());
    menuPointer.update();

    const affordance = affordanceForFrame(visible);
    const carry = carryPreview();
    markOutline(affordance.target, carry, visible.interactionOutline);
    const opticReticleVisible =
      !isPlayerFigureWhole(thirdPersonViewEnabled, spectator.enabled) &&
      view.held.opticLensFrame?.reticle !== undefined;
    const crosshair = playCrosshairFrame(
      visible.crosshair,
      bore !== undefined,
      crosshairScreenPosition(bore),
      opticReticleVisible,
    );
    debugTools?.setCrosshairVisible(visible.crosshair && !opticReticleVisible);
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
      keys: inputBindings,
    });
    screen.update();
    reading.revalidate((ownerUid) => Object.values(inventory.hands).some((item) => item?.uid === ownerUid));
    closeReadingInDarkness();
    syncReadingProgress(reading.bookUid, currentPresentation.longAction, reading.setProgress, isBookComplete);
    craftPanel.update(screen.isOpen && !sim.dead, screen.activeTab === 'repair' ? screen.repairTarget : undefined);
    drawQuickbar();
    quickbarBox.hidden = (debugTools?.buildOn ?? false) || !visible.quickbar;
    // A press check shows its own progress, and the label would cover the ejection port it shows.
    renderPlayHandling(
      handlingBox,
      currentPresentation,
      !screen.isOpen && visible.handling && !pressChecking(),
      screenText.handling,
    );
    const continuing = finishDraw(sky, now);
    frameWork.record(now, realNow() - workStart);
    return continuing;
  };
  const skyRoute = options.skyRoute?.({
    engine,
    keyboard: keyboardInput,
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
    config.debug && options.page.debugError,
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
      actionMenu.close();
      drawActionMenu(false);
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
      newWorld: () => options.page.newWorld(config.seed + 1),
      freshAttempt: () => options.page.newWorld(config.seed),
      exportRun: exportMetrics,
    });
  };

  /** Stops play and shows what happened; "New world" reloads with the next seed. */
  const die = ({ cause, time }: { cause: string; time: number }) => {
    options.saveController?.finishDeath();
    input.unlock();
    recording?.metrics.recordDeath(cause, time * sim.clock.ratio);
    recording?.save();
    mainMenuOpen = false;
    debugTools?.closeMenus();
    reading.close();
    closeInventoryScreen();
    inventoryPanel.hidden = true;
    syncMenuState();
    prompt.hidden = true;
    actionMenu.close();
    drawActionMenu(false);
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
      guide
        ? { act: restartPractice, label: guide.definition.chrome.restart }
        : { act: () => options.page.newWorld(config.seed + 1) },
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
