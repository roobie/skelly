// Stage pages share one global scope, so each global a stage installs or reads is declared once here,
// where two stages reusing one name with different shapes fail the typecheck.
import type { Registry } from '@skelly/engine/content';
import type { BODY_REGIONS } from '@skelly/engine/internal/core/body.ts';
import type { Inventory } from '@skelly/engine/internal/core/inventory.ts';
import type { visibleGridName } from '@skelly/engine/internal/core/inventoryGridName.ts';
import type * as reach from '@skelly/engine/internal/core/reach.ts';
import type { stageMarkArea } from '@skelly/engine/internal/core/stageMarks.ts';
import type { Item } from '@skelly/engine/inventory';
import type { Session } from '@skelly/engine/session';
import type { Vec3 } from '@skelly/engine/world';
import type { DebugHooks, DebugReadout, SnapshotMeasurement } from '@skelly/presentation/debug';
import type { GuidedSteps } from '@skelly/presentation/internal/presentation/guidedSteps.ts';
import type { ItemPictures } from '@skelly/presentation/internal/render/itemPictures.ts';
import type { InventoryScreen, ScreenHooks } from '@skelly/presentation/internal/ui/inventoryScreen.ts';
import type { MenuPointer } from '@skelly/presentation/internal/ui/menuPointer.ts';
import type { restViewModel } from '@skelly/presentation/internal/ui/rest.ts';
import type { Engine, RenderedEngine } from '@skelly/presentation/play';
import type { inputBindings } from '../../src/product/input.ts';
import type { saveTestHandle } from '../../src/saveTestHandle.ts';
import type { mountChargerFlow } from './charger-flow.ts';
import type { BrowserFailureFrame, BrowserFailureFrames } from './failure-diagnostics.mjs';
import type { GateEvent, StartGesture } from './firefox-first-click.mjs';
import type { FirefoxUiStartupSample } from './firefox-ui.mjs';
import type * as FirefoxUiActors from './firefox-ui-actors.ts';
import type { FullAutoProbe } from './full-auto.mjs';
import type { statePixelFixture } from './item-state-pixels.ts';
import type { mountRecoveryProbe } from './liquid-recovery-ui.ts';
import type { PlayTestHandle } from './playTestHandle.ts';
import type { LakeLook } from './primary-action-pixel.mjs';
import type { primaryActionProof } from './primaryActionProof.ts';
import type { SaveStatusTrace } from './save-lock-diagnostics.mjs';
import type { ScopedGunHooks } from './scoped-gun.mjs';
import type { MainArrival } from './sky-main-arrival.mjs';
import type { SkyTiming } from './sky-timing.mjs';

type ScreenDispatch = Parameters<ScreenHooks['dispatch']>[0];

/** The exit-lesson observer `save-controller-regressions.mjs` builds in the page. */
interface TutorialExitFixture {
  readonly tutorial: GuidedSteps;
  readonly exit: ReturnType<typeof stageMarkArea>;
  readonly observe: () => string;
  readonly exitStage: string;
  readonly pauseStage: string;
}

/** What `reading.mjs` adds to play's handle; see `reading.mjs`, `observeReading`. */
interface ReadingWitness {
  readonly readCalls: number;
  /** Makes play's next real frame throw outside play's own frame. */
  readonly triggerGameLoopError: () => void;
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
  selectFilledHolder: () => string;
  dropFilledHolder: () => void;
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

/** What `inventory-scroll.mjs` observes of its game page's play, from the play-test handle's publish on. */
interface ForegripFitTest {
  /** The item pictures the stage installed, held so the stage can dispose of them. */
  pictures?: ItemPictures | undefined;
  dispatches: ScreenDispatch[];
  /** Not-ready to ready transitions of the world loading gate. */
  readyFlips: number;
  closes: number;
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

type DisassemblyWork = Extract<NonNullable<Item['work']>, { kind: 'disassembly' }>;

/** One model-load audit beacon; see `model-load-audit.mjs`, `auditModelLoads`. */
type ModelLoadAuditRecord = { event: string } & Record<string, unknown>;

type PrimaryActionHook = ReturnType<typeof primaryActionProof>;

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

type PrimaryActionTest = PrimaryActionHook & PrimaryActionStageMembers;

/** Where the UI contract's hit-test stub last looked. */
interface UiContractHitTest {
  x: number;
  y: number;
  insideGo: boolean;
  insideSaveNote: boolean;
  buttonText: string;
}

/** The drawn cursor just before the UI contract's last menu-pointer click. */
interface UiContractCursor {
  left: number;
  top: number;
  hand: boolean;
  hitTest: UiContractHitTest | undefined;
  mask: string;
  background: string;
  blend: string;
  rootBlend: string;
}

type QueuedJob = Extract<ReturnType<Session['queue']['enqueue']>, { ok: true }>['job'];

/** What `tools/ui-browser-contract.mjs` observes and stubs in its page; its init script installs it. */
interface UiContractPage {
  /** The element `selector` names, which must exist and be an HTML element. */
  element: (selector: string) => HTMLElement;
  /** The input `selector` names, which must exist. */
  input: (selector: string) => HTMLInputElement;
  frames: number;
  simulationResumes: number;
  queuedMoves: QueuedJob[];
  debugReadout: DebugReadout | undefined;
  webglContextRequests: string[];
  /** The surface the pointer-lock stub locks; set once the stage installs the stub. */
  inputSurface: HTMLElement | undefined;
  pointerCalls: { request: number; exit: number };
  pointerLockErrors: number;
  rejectNextPointerLock: boolean;
  setPointerLocked: (locked: boolean) => void;
  keyEvents: { code: string; defaultPrevented: boolean }[];
  lastHitTest: UiContractHitTest | undefined;
  lastForwardedClick: { x: number; y: number; hitTest: UiContractHitTest | undefined } | null;
  cursorBeforeClick: UiContractCursor | undefined;
  f4Prevented: boolean;
  metricsBlob: Blob | undefined;
  metricsFilename: string | undefined;
  snapshotMeasurement: SnapshotMeasurement | undefined;
  copiedSnapshot: string | undefined;
  windowBlurs: number;
}

declare global {
  /** Chromium-only, so absent from TypeScript's DOM lib; the save stage reads why Back missed the page cache. */
  interface PerformanceNavigationTiming {
    readonly notRestoredReasons?: { toJSON: () => unknown } | null;
  }

  var skellySaveTest: ReturnType<typeof saveTestHandle>;
  var skellyPlayTest: PlayTestHandle;

  var tutorialExitFixture: TutorialExitFixture;
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
  var camoArrival: CamoArrival;
  var camoPointerRequests: { active: boolean; playMounted: boolean }[];
  var camoPointerEvents: CamoPointerEvent[];
  var nativeGateEvents: NativeGateEvent[];
  var skyProofControl: { value: number };
  var skyTiming: SkyTiming;
  var d7Observed: MeleeSwingObservation;
  var postFrameObserved: PostFrameObservation;
  /** The stairs stage's play engine, published by its pixel modes once `playTestHandle.ts`, `renderedEngine` checks it. */
  var stairsEngine: RenderedEngine;
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
  var pumpManualFrames: PumpManualFrames;
  var pumpDecoded: PumpDecodedSource[];
  var pumpRDownAt: number;
  var pumpRDowns: number[];
  var pumpWebGLRequests: string[];
  var reportReader: ReturnType<Session['sim']['events']['reader']>;
  var __casePoolWaiting: boolean;
  var __casePoolResult: CasePoolResult;
  var recordModelLoadAudit: (record: ModelLoadAuditRecord) => void;

  var firefoxUiActors: typeof FirefoxUiActors;
  var firefoxUiFrames: number;
  var firefoxUiStartupSample: FirefoxUiStartupSample | undefined;
  var firefoxGateEvents: GateEvent[];
  var firefoxF10Prevented: boolean;
  var firefoxNativeInitialTime: number;
  var firefoxNativeGateEvents: GateEvent[];
  var __startGesture: StartGesture;
  var fullAutoProbe: FullAutoProbe;
  /** The page half of `simulation-wait.mjs`, `waitForSimulation`, keyed by wait id. */
  var simulationWaits:
    | Record<string, { down: boolean; listening?: boolean; start?: number; onKeyDown?: (event: KeyboardEvent) => void }>
    | undefined;

  var uiContract: UiContractPage;
  /**
   * Spliced into the debug module by the UI contract, which reaches no other way to the hooks play hands it.
   * The contract wraps the snapshot measurement to observe what the debug panel shows.
   */
  var uiContractDebug: {
    readonly hooks: { measureSnapshot: DebugHooks['measureSnapshot'] };
    readonly spawnStatus: string;
  };

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
