// Stage pages share one global scope, so each global a stage installs or reads is declared once here,
// where two stages reusing one name with different shapes fail the typecheck.
import type { FurnitureDef, Registry } from '@skelly/engine/content';
import type { figureVariantOf } from '@skelly/engine/internal/core/actorModels.ts';
import type { doorPanel } from '@skelly/engine/internal/core/blockEntities.ts';
import type { BODY_REGIONS } from '@skelly/engine/internal/core/body.ts';
import type { Inventory } from '@skelly/engine/internal/core/inventory.ts';
import type { visibleGridName } from '@skelly/engine/internal/core/inventoryGridName.ts';
import type * as reach from '@skelly/engine/internal/core/reach.ts';
import type { stageMarkArea } from '@skelly/engine/internal/core/stageMarks.ts';
import type { WEATHERING_STRENGTH_MAX } from '@skelly/engine/internal/core/weather.ts';
import type { CommandRouter } from '@skelly/engine/internal/game/commandRouter.ts';
import type { PlayerControls } from '@skelly/engine/internal/game/playerControls.ts';
import type { ignitionTargetForHand, selectPrimaryAction } from '@skelly/engine/internal/game/primaryAction.ts';
import type { QuickbarActions } from '@skelly/engine/internal/game/quickbarActions.ts';
import type { HandSide, Item, ItemFlight } from '@skelly/engine/inventory';
import type { InputRecording, Session } from '@skelly/engine/session';
import type { InteractionTarget, nextTimeOfDay, RealTimestamp } from '@skelly/engine/sim';
import type { BlockEntity, Vec3 } from '@skelly/engine/world';
import type { GameAudio } from '@skelly/presentation/internal/presentation/audio.ts';
import type { DebugGunPose } from '@skelly/presentation/internal/presentation/debugGunPose.ts';
import type { DebugHooks, DebugRuntime } from '@skelly/presentation/internal/presentation/debugInterface.ts';
import type { GuidedSteps } from '@skelly/presentation/internal/presentation/guidedSteps.ts';
import type { Input } from '@skelly/presentation/internal/presentation/input.ts';
import type { OpticZoom } from '@skelly/presentation/internal/presentation/opticZoom.ts';
import type { StartPlayOptions } from '@skelly/presentation/internal/presentation/play.ts';
import type { createAttemptRecording } from '@skelly/presentation/internal/presentation/playtestObserver.ts';
import type { SnapshotMeasurement } from '@skelly/presentation/internal/presentation/playtestTools.ts';
import type { ActorAnimator } from '@skelly/presentation/internal/render/actorAnimator.ts';
import type { ChunkMeshes } from '@skelly/presentation/internal/render/chunks.ts';
import type { FrameSummary } from '@skelly/presentation/internal/render/frameTimes.ts';
import type { HeldItems } from '@skelly/presentation/internal/render/hands.ts';
import type { ItemPictures } from '@skelly/presentation/internal/render/itemPictures.ts';
import type { MobActorMeshes } from '@skelly/presentation/internal/render/mobActors.ts';
import type { Mood } from '@skelly/presentation/internal/render/mood.ts';
import type { OpticLensRenderer } from '@skelly/presentation/internal/render/opticLens.ts';
import type { PlayerMeshes } from '@skelly/presentation/internal/render/playerFigure.ts';
import type { createPlayView } from '@skelly/presentation/internal/render/playView.ts';
import type { HudSettings } from '@skelly/presentation/internal/ui/hudOptions.ts';
import type { InventoryScreen, ScreenHooks } from '@skelly/presentation/internal/ui/inventoryScreen.ts';
import type { HintText } from '@skelly/presentation/internal/ui/keyCap.ts';
import type { MenuPointer } from '@skelly/presentation/internal/ui/menuPointer.ts';
import type { mountReading } from '@skelly/presentation/internal/ui/reading.ts';
import type { restViewModel } from '@skelly/presentation/internal/ui/rest.ts';
import type { SaveController } from '@skelly/presentation/internal/ui/saveController.ts';
import type { Engine, RenderedEngine, WorldLoading } from '@skelly/presentation/play';
import type * as Three from 'three';
import type { LookControls } from '../../src/debug/look.ts';
import type { inputBindings } from '../../src/product/input.ts';
import type { SaveTestHandle } from '../../src/saveTestHandle.ts';
import type { mountChargerFlow } from './charger-flow.ts';
import type { BrowserFailureFrame, BrowserFailureFrames } from './failure-diagnostics.mjs';
import type { GateEvent, StartGesture } from './firefox-first-click.mjs';
import type { FirefoxUiStartupSample } from './firefox-ui.mjs';
import type { FullAutoProbe } from './full-auto.mjs';
import type { statePixelFixture } from './item-state-pixels.ts';
import type { mountRecoveryProbe } from './liquid-recovery-ui.ts';
import type { LakeLook } from './primary-action-pixel.mjs';
import type { SaveStatusTrace } from './save-lock-diagnostics.mjs';
import type { ScopedGunHooks } from './scoped-gun.mjs';
import type { SkyTiming } from './sky-timing.mjs';

type PlayView = ReturnType<typeof createPlayView>;

// Indexed access reads a private member and Pick over keyof keeps the public ones, so each view
// below is the class plus the private state the stages observe.
type ActorAnimatorView = Pick<ActorAnimator, keyof ActorAnimator> & {
  readonly firearmParts: ActorAnimator['firearmParts'];
};
type HeldItemsView = Pick<HeldItems, keyof HeldItems> & {
  readonly animator: ActorAnimatorView;
  readonly scene: HeldItems['scene'];
};
type PlayerMeshesView = Pick<PlayerMeshes, keyof PlayerMeshes> & { readonly animator: PlayerMeshes['animator'] };
type PlayViewView = Omit<PlayView, 'held' | 'playerMeshes'> & {
  readonly held: HeldItemsView;
  readonly playerMeshes: PlayerMeshesView;
};
type PlayerControlsView = Pick<PlayerControls, keyof PlayerControls> & {
  readonly rightMousePressed: PlayerControls['rightMousePressed'];
  readonly rightMouseSuppressed: PlayerControls['rightMouseSuppressed'];
  readonly dominantUseDown: PlayerControls['dominantUseDown'];
};
type InputView = Omit<Input, 'controls'> & { readonly controls: PlayerControlsView };
type OpticLensRendererView = Pick<OpticLensRenderer, keyof OpticLensRenderer> & {
  readonly zoomCamera: OpticLensRenderer['zoomCamera'];
};
type MoodView = Pick<Mood, keyof Mood> & {
  readonly opticLens: OpticLensRendererView;
  readonly opticPass: Mood['opticPass'];
  readonly bloomPass: Mood['bloomPass'];
  readonly outputPass: Mood['outputPass'];
};
/** The stage installs `ItemPictures` as the screen's pictures hook. */
type InventoryScreenView = Pick<InventoryScreen, keyof InventoryScreen> & {
  order: InventoryScreen['order'];
  hooks: Omit<InventoryScreen['hooks'], 'pictures'> & { pictures?: ItemPictures | undefined };
};
type ChunkMeshesView = Pick<ChunkMeshes, keyof ChunkMeshes> & { weathering: ChunkMeshes['weathering'] };
/** The firefox-ui stage starts the detailed renderer and checks the figures it draws. */
type MobActorMeshesView = Pick<MobActorMeshes, keyof MobActorMeshes> & {
  states: MobActorMeshes['states'];
  variants: MobActorMeshes['variants'];
};
type GameAudioView = Pick<GameAudio, keyof GameAudio> & { context: GameAudio['context'] };

// Deadvox's main starts play on a rendering engine, so every stage page has one.
type StageEngine = Omit<RenderedEngine, 'mood'> & { mood: MoodView };

type ScreenDispatch = Parameters<ScreenHooks['dispatch']>[0];

/** The play-loop locals `save-controller-fixture.mjs` exposes once a world starts. */
interface WorldLoadWitness {
  readonly engine: Engine;
  readonly session: Session;
  readonly worldLoading: WorldLoading;
  readonly frame: (now: RealTimestamp) => boolean;
}

/** The play locals `save-controller-fixture.mjs` exposes for driving a session by hand. */
interface GauntletWitness {
  readonly engine: Engine;
  readonly session: Session;
  readonly recording: ReturnType<typeof createAttemptRecording>;
  readonly measureSnapshot: () => SnapshotMeasurement;
  readonly input: Input;
  readonly eye: () => Vec3;
  readonly lookedAt: () => BlockEntity | undefined;
  /** While set, the fixture's frame loop yields to the stage's own ticks. */
  manual: boolean;
  readonly rollReplay: () => void;
  /** The light `gauntlet-flow.mjs` hands the reader. */
  lampUid?: Item['uid'];
}

/** The exit-lesson observer `save-controller-regressions.mjs` builds in the page. */
interface TutorialExitFixture {
  readonly tutorial: GuidedSteps;
  readonly exit: ReturnType<typeof stageMarkArea>;
  readonly observe: () => string;
  readonly exitStage: string;
  readonly pauseStage: string;
}

/** The play locals `reading.mjs` exposes from `play.ts`. */
interface ReadingWitness {
  readonly engine: StageEngine;
  readonly session: Session;
  readonly input: Input;
  readonly body: Session['body'];
  readonly screen: InventoryScreenView;
  readonly reading: ReturnType<typeof mountReading>;
  readonly eye: () => Vec3;
  readonly lookedAt: () => Extract<InteractionTarget, { kind: 'furniture' }>['entity'] | undefined;
  readonly useTarget: CommandRouter['useTarget'];
  readonly saveController: SaveController | undefined;
  readonly readCalls: number;
  readonly mainMenuOpen: boolean;
  readonly requestResume: () => void;
  readonly playFrame: (now: RealTimestamp) => boolean;
  readonly triggerGameLoopError: () => void;
  readonly handsBusy: boolean;
  /** Imported by the rest check before its predicate reads them. */
  restViewModel?: typeof restViewModel;
  keys?: typeof inputBindings;
}

/** The camo stage's record of when the witness wall first drew and when its sky fields were current. */
interface CamoArrival {
  firstMeshRealMs: number | null;
  readyRealMs: number | null;
  renderedFrames: number;
  pendingFrames: number;
}

/** The play locals `stairs.mjs` exposes from `play.ts`. */
interface StairsWitness {
  readonly engine: StageEngine;
  readonly session: Session;
  readonly input: Input;
  readonly body: Session['body'];
  readonly entities: Session['entities'];
  readonly queue: Session['queue'];
  readonly doorPanel: typeof doorPanel;
  readonly performHandUse: CommandRouter['performHandUse'];
  readonly getNotice: () => string;
  readonly noclip: boolean;
  camoArrival: CamoArrival;
}

/** The play locals the melee and lighting stages expose from `play.ts`. */
interface D7Review {
  readonly input: Input;
  readonly session: Session;
  readonly held: HeldItemsView;
  readonly engine: StageEngine;
  readonly camera: Engine['camera'];
  readonly debugTools: DebugRuntime | undefined;
  readonly inventory: Session['inventory'];
}

/** Melee swings the melee stage saw start, with the stamina it read around them. */
interface MeleeSwingObservation {
  starts: { result: ReturnType<Session['playerCombat']['beginMeleeSwing']>; build: boolean; armed: boolean }[];
  initialAim: { yaw: number; pitch: number };
  buildStaminaBefore?: number;
  combatStaminaBefore?: number;
}

/** One Mood render the lighting-residents stage observed. */
interface PostFrame {
  post: boolean;
  hands: number;
  targets: boolean[];
  sequence: string[];
}

/** The lighting-residents stage's record of held-hand draws inside Mood renders. */
interface PostFrameObservation {
  frames: PostFrame[];
  outsideMood: number;
  initialPost: boolean;
  post: boolean | null;
  setPostRealMs: number | null;
  renderFrameAtSetPost: number | null;
  renderEntries: number;
  renderExits: number;
}

type BlockDamageEntry = ReturnType<Engine['simulationWorld']['blockDamage']['snapshotState']>['entries'][number];

/** The window the melee stage opens, closes and breaks, and what it read before. */
interface WindowReview {
  readyAt: number;
  initialZ: number;
  standingHeight: number;
  yaw: number;
  uid: Parameters<Session['entities']['byUid']>[0];
  floorBefore: number;
}

/** Main's startup mesh arrival, which the main overlay records. */
interface MainArrival {
  firstMeshRealMs: number | null;
  engineReadyRealMs?: number;
  key?: string;
  workerComputeRealMs?: number;
}

type CamoPointerEvent =
  | { type: 'pointerlockchange' | 'pointerlockerror'; locked: boolean }
  | { type: 'exit'; stack: string | undefined };

interface NativeGateEvent {
  type: 'keydown' | 'keyup';
  code: string;
  trusted: boolean;
  prevented: boolean;
  repeat: boolean;
  locked: boolean;
}

/** The pointer-mode stand-in `inventory-scroll.mjs` gives its fixture's menu pointer. */
interface ScrollFixtureInput {
  readonly locked: boolean;
  readonly menuPointer: boolean;
  setPointerModeForTest: (locked: boolean) => void;
  cursorX: number;
  cursorY: number;
  moveMenuCursor: (x: number, y: number) => void;
}

/** What the inventory-scroll fixture page exposes; see `inventory-scroll.mjs`, `fixture`. */
interface ScrollFixture {
  input: ScrollFixtureInput;
  screen: InventoryScreen;
  inventory: Inventory;
  dispatches: ScreenDispatch[];
  target: HTMLElement;
  menu: MenuPointer;
  bodyRegions: typeof BODY_REGIONS;
  bundledRegistry: Registry;
  containerMaxWidthCells: number | undefined;
  populatePiles: () => void;
  populateFloorWrapPiles: () => void;
  floorWrapTargets: Vec3[];
  gridNames: { name: string; w: number; h: number; visible: ReturnType<typeof visibleGridName> }[];
  readonly capTokenUid: number | undefined;
  useUiTuning: (tuning: Record<string, unknown>) => void;
  addCapRack: () => void;
  readonly gameplayWheels: number;
  resetWheels: () => void;
  redraw: () => void;
  mountCardFact: () => void;
  redrawAfterNeedsChange: () => void;
}

/** The play.ts locals `inventory-scroll.mjs` exposes to its game page. */
interface ForegripFitTest {
  session: Session;
  screen: InventoryScreenView;
  input: Input;
  dispatches: ScreenDispatch[];
  eye: () => Vec3;
  lookedAt: () => InteractionTarget | undefined;
  readyFlips: number;
  worldReady: () => boolean;
  blockSize: number;
  /** Counted from the first close only. */
  closes?: number;
}

/** The play.ts locals `pump-handling.mjs` exposes. */
interface PumpHandlingTest {
  engine: Engine;
  session: Session;
  input: Input;
  camera: Engine['camera'];
  audio: GameAudio;
  screen: InventoryScreenView;
  getNotice: () => string;
  getFramePacing: () => FrameSummary;
}

type ManualFrameWait<T> = { reached: true; frames: number; value: T } | { reached: false; frames: number };

/** The manual animation-frame clock `pump-handling.mjs` installs. */
interface PumpManualFrames {
  enable: () => Promise<void>;
  step: (seconds: number) => void;
  until: <T>(predicate: () => T, maxFrames?: number) => ManualFrameWait<T>;
  disable: () => void;
}

interface PumpDecodedSource {
  event: string | undefined;
  rate: number | undefined;
  contextRate: number;
  channels: number | undefined;
  duration: number | undefined;
}

interface CaseResourceCounts {
  bufferCreate: number;
  bufferDelete: number;
  vaoCreate: number;
  vaoDelete: number;
}

/** What the case pool probe reports; see `case-visual-pool.mjs`, `probeSource`. */
interface CasePoolResult {
  mode: string | null;
  modelReady: boolean;
  modelErrors: string[];
  cap: number;
  flyingCap: number;
  warmup: CaseResourceCounts;
  dirtyUpdates: CaseResourceCounts;
  pileClones: number;
  sameInstances: boolean;
  reducedCount: number | undefined;
  cappedCount: number | undefined;
  countChanges: CaseResourceCounts;
  upgrade: CaseResourceCounts | undefined;
  flight: { clones: number; active: number; visuals: number };
  meshesOnRemoval: number;
  removal: CaseResourceCounts;
  childrenAfterRemoval: number;
  meshesOnTeardown: number;
  teardown: CaseResourceCounts;
}

/** The play.ts locals `cell-repair-crack.mjs` exposes. */
interface CellRepairCrack {
  input: Input;
  session: Session;
  engine: Engine;
  debugTools: DebugRuntime | undefined;
  inventory: Inventory;
}

type DisassemblyWork = Extract<NonNullable<Item['work']>, { kind: 'disassembly' }>;

/** One model-load audit beacon; see `model-load-audit.mjs`, `auditModelLoads`. */
type ModelLoadAuditRecord = { event: string } & Record<string, unknown>;

type MeleeSwingStart = Parameters<Session['playerCombat']['beginMeleeSwing']>[0];

interface QuickbarTapObservation {
  readonly itemMoveQueued: boolean;
  readonly location: string | null;
}

/** The hook's members mirror the play locals of the same names; see `primary-action-observation.mjs`, `observationPlugin`. */
interface PrimaryActionHook {
  readonly input: InputView;
  readonly inputTarget: HTMLElement;
  readonly keyboardInput: StartPlayOptions['keyboard'];
  readonly inventory: Session['inventory'];
  readonly session: Session;
  readonly queue: Session['queue'];
  readonly view: PlayViewView;
  readonly streamer: Engine['streamer'];
  readonly simulationWorld: Engine['simulationWorld'];
  readonly survival: Session['survival'];
  readonly debugTools: DebugRuntime | undefined;
  readonly thirdPerson: DebugHooks['thirdPerson'];
  readonly engine: StageEngine;
  readonly debugGunPose: DebugGunPose;
  readonly opticZoom: OpticZoom;
  readonly caseEffects: PlayView['caseEffects'];
  readonly itemThrows: PlayView['itemThrows'];
  readonly audio: GameAudio;
  readonly feet: Session['feet'];
  readonly scale: Engine['config']['scale'];
  readonly performHandUse: CommandRouter['performHandUse'];
  readonly quickbarActions: QuickbarActions;
  readonly quickbar: Session['quickbar'];
  readonly screen: InventoryScreen;
  readonly dispatchScreenCommand: CommandRouter['dispatchScreenCommand'];
  readonly inputRecorder: InputRecording['recorder'];
  readonly captureSnapshot: () => ReturnType<Session['snapshot']>;
  dropAfterNextThrowCommit: boolean;
  quickbarTapAfterNextThrowCommit: number | undefined;
  quickbarTapItemUid: Session['quickbar']['slots'][number] | undefined;
  quickbarTapCommitObservation: QuickbarTapObservation | undefined;
  quickbarTapTickObservation: QuickbarTapObservation | undefined;
  readonly adsToggleObservations: { before: boolean; after: boolean; replaying: boolean; locked: boolean }[];
  readonly adsToggled: (before: boolean, after: boolean, replaying: boolean) => void;
  readonly throwSpawnObservations: Record<
    Item['uid'],
    { readonly active: boolean; readonly names: string[]; readonly durationSimSeconds: number }
  >;
  readonly afterThrowCommit: () => void;
  readonly startInputReplayRecording: () => void;
  readonly hudOptions: HudSettings;
  readonly beginItemThrow: CommandRouter['beginItemThrow'];
  readonly getItemThrowLanding: (
    itemUid: Item['uid'],
    heldSimSeconds: number,
  ) =>
    | {
        readonly target: { readonly kind: 'pile'; readonly pos: NonNullable<ItemFlight['landing']> } | undefined;
        readonly fits: boolean;
        readonly landingDistance: number | undefined;
        readonly distance: number;
      }
    | undefined;
  readonly getItemThrowState: () => Pick<Session['throwCharge'], 'startedAt' | 'itemUid' | 'hand'>;
  readonly selectPrimaryAction: typeof selectPrimaryAction;
  readonly nextTimeOfDay: typeof nextTimeOfDay;
  readonly ignitionTargetForHand: typeof ignitionTargetForHand;
  readonly liftsWhole: (def: FurnitureDef) => boolean;
  readonly interactionTargetAt: () => InteractionTarget | undefined;
  readonly useTarget: CommandRouter['useTarget'];
  readonly useText: (entity: BlockEntity) => HintText;
  dominant: HandSide;
  off: HandSide;
  frames: number;
  swings: {
    result: ReturnType<Session['playerCombat']['beginMeleeSwing']>;
    profile: MeleeSwingStart['profile'];
    hand: HandSide;
  }[];
  attachments: { gap: number; angle: number; torsoYaw: number; movedOff: boolean }[];
  trackAttachment: boolean;
  readonly initialPlayerPosition: number[];
  readonly getNotice: () => string;
  readonly isChargingItemThrow: () => boolean;
  readonly isThrowingStance: () => boolean;
  readonly clearNotice: () => void;
  readonly clearHand: (side: HandSide) => void;
  readonly setHand: (side: HandSide, item: Item) => void;
  readonly placePocketed: (item: Item) => void;
}

/** What stages add to the hook; each stage installs a member before it reads it. */
interface PrimaryActionStageMembers extends ScopedGunHooks {
  types: {
    light: string;
    tool: string;
    profile: string;
    inert: string;
    gun: string;
    optic: string;
    opticStation: string;
  };
  lightUid: Item['uid'];
  caseType: string;
  grabProgress: number[];
  aimAtSupport: () => void;
}

export type PrimaryActionTest = PrimaryActionHook & PrimaryActionStageMembers;

declare global {
  var skellySaveTest: SaveTestHandle;

  var worldLoadWitness: WorldLoadWitness;
  var gauntletWitness: GauntletWitness;
  /** The playing session of a practice run; undefined in an ordinary run. */
  var tutorialSession: Session | undefined;
  var tutorialExitFixture: TutorialExitFixture;
  var saveControllerConstructed: true | undefined;
  var saveControllerPlayStarted: boolean;
  var saveControllerFrames: number;
  var skellyRouteFixture: boolean;
  var holdWorldMeshes: boolean;
  var releaseWorldMeshes: () => void;
  var failWorldMesh: () => void;
  var metricsStorageCalls: string[];
  var persistenceQueries: number;
  var persistenceRequests: number;
  var releasePersistenceIdentity: () => Promise<void>;
  var skellyRetryRace: { readonly releaseSecond: () => void } | undefined;
  var browserFailureFrames: BrowserFailureFrames;
  var __reportBrowserFailureFrame: (frame: BrowserFailureFrame) => Promise<void>;
  /** Installed only by stages that trace save status. */
  var saveStatusTrace: SaveStatusTrace | undefined;
  var __lifecycleLockWarnings: unknown[][];
  var __saveNavigationTiming: ((entry: Record<string, unknown>) => void) | undefined;
  var __lifecycleEvent: string;
  var __lifecycleHoldNextSave: boolean;
  var __lifecycleReleaseOnAcquire: boolean;
  var __lifecycleReleaseWriter: (() => void) | undefined;
  var skellyHeldSaveLock: Promise<void>;
  var skellyReleaseSaveLock: () => void;

  var readingWitness: ReadingWitness;
  var pendingMapOwner: number;
  var resolvePendingMap: () => void;
  var resolveReplacedMap: () => void;
  var resolveWorldReplacedMap: () => void;
  var deathMenuPointerLockRequests: number;
  var stairsWitness: StairsWitness;
  var camoPointerRequests: { active: boolean; playMounted: boolean }[];
  var camoPointerEvents: CamoPointerEvent[];
  var nativeGateEvents: NativeGateEvent[];
  var skyProofControl: { value: number };
  var skyTiming: SkyTiming;
  var d7Review: D7Review;
  var d7Observed: MeleeSwingObservation;
  var postFrameObserved: PostFrameObservation;
  var d7ToolDamage: BlockDamageEntry & { text: string };
  var windowReview: WindowReview;
  var mainArrival: MainArrival;

  var scrollFixture: ScrollFixture;
  var foregripFitTest: ForegripFitTest;
  /** Set only on the page whose bundled content must refuse admission. */
  var skellyRefuseFixture: boolean | undefined;
  var itemStatePixels: Awaited<ReturnType<typeof statePixelFixture>>;
  var activationProbe: { clicks: string[]; actions: string[] };
  /** The stage adds the started work and its item once recovery work starts. */
  var recoveryProbe: ReturnType<typeof mountRecoveryProbe> & { startedWork: DisassemblyWork; workItem: Item };
  var chargerFlow: Awaited<ReturnType<typeof mountChargerFlow>>;
  /** Imported once per page, on first use. */
  var reachLib: typeof reach | undefined;
  var pumpHandlingTest: PumpHandlingTest;
  var pumpManualFrames: PumpManualFrames;
  var pumpCurrentAudioEvent: string | undefined;
  var pumpDecoded: PumpDecodedSource[];
  var pumpRDownAt: number;
  var pumpRDowns: number[];
  var pumpWebGLRequests: string[];
  var reportReader: ReturnType<Session['sim']['events']['reader']>;
  var __casePoolWaiting: boolean;
  var __casePoolResult: CasePoolResult;
  var cellRepairCrack: CellRepairCrack;
  var recordModelLoadAudit: (record: ModelLoadAuditRecord) => void;

  /** Installed by `firefox-ui.mjs` into play.ts; also read by `mods-startup.mjs` and `weatheringPixels.mjs`. */
  var firefoxUiTest: {
    engine: Omit<Engine, 'meshes'> & { meshes: ChunkMeshesView };
    session: Session;
    input: Input;
    registry: Engine['registry'];
    view: Omit<PlayView, 'actorMeshes'> & { actorMeshes: MobActorMeshesView };
    camera: Engine['camera'];
    worldLoading: WorldLoading;
    spectatorCameraEnabled: () => boolean;
    figureVariantOf: typeof figureVariantOf;
    three: typeof Three;
    weatheringStrengthMax: typeof WEATHERING_STRENGTH_MAX;
  };
  var firefoxUiLook: LookControls;
  var firefoxUiFrames: number;
  var firefoxUiStartupSample: FirefoxUiStartupSample | undefined;
  var firefoxGateEvents: GateEvent[];
  var firefoxF10Prevented: boolean;
  var firefoxNativeSim: Session['sim'];
  var firefoxNativeInitialTime: number;
  var firefoxNativeGateEvents: GateEvent[];
  var __startGesture: StartGesture;
  var fullAutoProbe: FullAutoProbe;
  /** Installed by `full-auto.mjs` into play.ts. */
  var fullAutoRuntime: {
    config: Engine['config'];
    sim: Session['sim'];
    input: Input;
    inventory: Session['inventory'];
    session: Session;
    audio: GameAudioView;
    caseEffects: PlayView['caseEffects'];
    view: PlayView;
    debugTools: DebugRuntime | undefined;
    eye: () => Vec3;
    /** The play-local bore readout; the stage reads only whether one is published. */
    heldFirearmBore: () => unknown;
    reportReader: () => ReturnType<Session['sim']['events']['reader']>;
  };
  /** The page half of `simulation-wait.mjs`, `waitForSimulation`, keyed by wait id. */
  var simulationWaits:
    | Record<string, { down: boolean; listening?: boolean; start?: number; onKeyDown?: (event: KeyboardEvent) => void }>
    | undefined;

  var primaryActionTest: PrimaryActionTest;
  var freeLookAltEdges: { type: string; prevented: boolean; trusted: boolean }[];
  var acceptedCreation: { trusted: boolean; actorExists: boolean }[];
  var renderFreeWitness: { webglRequests: string[] };
  var ownBodyDraws: { head: number; eyes: number; body: number };
  var lakeLook: LakeLook;
  var altReleaseEvents: {
    type: string;
    code: string | undefined;
    trusted: boolean;
    cancelable: boolean;
    prevented: boolean;
    alt: boolean | undefined;
    modifierAlt: boolean | undefined;
    focused: boolean;
    visible: DocumentVisibilityState;
    locked: boolean;
  }[];
  var altReleaseObservation: AbortController;
}
