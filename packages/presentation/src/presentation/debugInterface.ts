import type { Inventory } from '@skelly/engine/inventory';
import type { DebugNoclipStep, RealFrameObserver, Session } from '@skelly/engine/session';
import type {
  ActorAim,
  ActorSystem,
  Character,
  FirearmsSkillZeroHandling,
  MeleeResult,
  Simulation,
} from '@skelly/engine/sim';
import type { Weather } from '@skelly/engine/sky';
import type { HeardSound } from '@skelly/engine/sound';
import type { Body, SolidAt, Vec3 } from '@skelly/engine/world';
import type { DrawSubmission } from '../render/drawCounters.ts';
import type { FrameSummary } from '../render/frameTimes.ts';
import type { ActorRenderer } from '../render/mobActors.ts';
import type { DebugGunPoseMode } from './debugGunPose.ts';
import type { Engine } from './engine.ts';
import type { KeyboardInput } from './inputBindings.ts';

export type SkyRouteAttachment = (hooks: {
  engine: Engine;
  session: Session;
  debug: DebugRuntime;
  active: () => boolean;
  keyboard: KeyboardInput;
}) => RealFrameObserver | undefined;

import type { SnapshotMeasurement } from './playtestTools.ts';

export type InputReplayStatusState =
  | 'idle'
  | 'recording'
  | 'stopped'
  | 'playing'
  | 'verified'
  | 'diverged'
  | 'unavailable';

export interface DebugHooks {
  readonly engine: Engine;
  /** The page's keyboard; the panel shows its keys and traces its presses. */
  readonly keyboard: KeyboardInput;
  /** The weather play renders with; the debug look controls set all three levels from the hash. */
  readonly weather: Weather;
  /** The held light's beam; the debug look controls set its strength multiplier. */
  readonly flashlight: { strength: number };
  /** The session's solid and sight rule, which counts parked vehicles; the engine's own queries do not. */
  readonly solidity: { readonly isSolid: SolidAt; readonly isOpaque: SolidAt };
  readonly body: Body;
  readonly inventory: Inventory;
  readonly character: Character;
  readonly newGame: boolean;
  readonly sim: Simulation;
  /** Debug tools may set the look direction (hash `cam` restore, debug/camUrl.ts). */
  readonly input: { yaw: number; pitch: number };
  readonly debugModifierHeld: () => boolean;
  /** The camera's current roll in radians (damage feedback; 0 otherwise). */
  readonly roll: () => number;
  readonly actors: () => ActorSystem | undefined;
  readonly actorRenderer: ActorRenderer;
  readonly feet: () => Vec3;
  readonly showNotice: (text: string) => void;
  readonly strikeTerrainCell: Session['strikeTerrainCell'];
  /** Starts mending the damaged terrain cell with the player's known recipe that names its block; returns why not. */
  readonly repairCell: (cell: Vec3) => string | undefined;
  /** Starts clearing the aimed rubble cell; returns why not, so the panel can say it. */
  readonly takeApartCell: (cell: Vec3) => string | undefined;
  readonly compress: () => void;
  /** Fast-forwards through compression; real interruptions still end the skip. */
  readonly skipGameHours: (hours: number) => void;
  readonly setTimeOfDay: (hour: number, minute: number) => void;
  readonly revealActors: (enabled: boolean) => void;
  readonly measureSnapshot: () => SnapshotMeasurement;
  readonly impactLaser: { enabled: () => boolean; toggle: () => void };
  readonly reviewMap: { isOpen: () => boolean; toggle: () => void };
  readonly spectatorCamera: {
    enabled: () => boolean;
    toggle: () => void;
    /** Moves the avatar under the camera; `blocked` when that spot is inside solid terrain, undefined unless detached. */
    teleport: () => 'moved' | 'blocked' | undefined;
  };
  readonly thirdPerson: { enabled: () => boolean; toggle: () => void };
  readonly gunPose: { mode: () => DebugGunPoseMode | 'live'; toggle: (mode: DebugGunPoseMode) => void };
  /** The debug mannequin, present only when the page asked for one (`src/render/avatarMannequin.ts`). */
  readonly mannequin?:
    | { step: (delta: number) => void; place: () => void; readonly pose: { readonly name: string } }
    | undefined;
  readonly perceptionLabels: { enabled: () => boolean; toggle: () => void };
  /** Emits the existing `player_hurt_light` sound and its player-noise event; this debug action changes simulation state. */
  readonly emitTestNoise: () => boolean;
  /**
   * Starts taking the furniture piece under the crosshair apart through the recorded command. The command waits on
   * the #1469 crafting view for its player-facing entry; this is the debug stand-in for looks and fixtures.
   */
  readonly takeApartTarget: () => string;
  readonly exportMetrics: () => void;
  readonly inputReplay: {
    readonly status: () => string;
    readonly state: () => InputReplayStatusState;
    readonly export: () => Promise<Uint8Array>;
    readonly import: (bytes: Uint8Array) => void;
  };
  readonly firearmsSkillZeroHandling: () => FirearmsSkillZeroHandling;
  readonly firearmsSkillZeroTarget: () => string | undefined;
  readonly setFirearmsSkillZeroHandling: (value: FirearmsSkillZeroHandling) => void;
}

export interface DebugReadout {
  readonly drawSubmission: DrawSubmission | null;
  readonly fps: number;
  /** Time between frames, median and 95th percentile over the last couple of seconds. */
  readonly frame: FrameSummary;
  /** Time the frame callback itself took (CPU submit), same window. */
  readonly work: FrameSummary;
  readonly seed: number;
  readonly radius: number;
  readonly movement: string;
  readonly position: Vec3;
  readonly chunks: number;
  readonly pending: number;
  readonly holes: number;
  /** The whole view radius is meshed: `pending` never reaches zero because the preload rings stay queued, so scripts wait on this. */
  readonly meshingDone: boolean;
  readonly actors: number;
  readonly sounds: readonly HeardSound[];
  readonly simulationMs: number;
  readonly renderMs: number | null;
  readonly meshingQueueMs: number;
  readonly entities: number;
  readonly memoryBytes: number;
  readonly clock: string;
  readonly compression: number;
  readonly snapshotLastMs: number;
  readonly snapshotP95Ms: number;
  readonly snapshotCount: number;
  readonly revealedActors: readonly string[];
}

export interface DebugRuntime {
  readonly menuOpen: boolean;
  readonly aimEnabled: boolean;
  updateAim: (aim: ActorAim | undefined) => void;
  setCrosshairVisible: (visible: boolean) => void;
  /** Names the block or furniture under the crosshair in the aim readout; call after `updateAim`, which wins when an actor is aimed at. */
  updateLookedAt: (eye: Vec3, dir: Vec3, active: boolean) => void;
  readonly interactionRayEnabled: boolean;
  drawInteractionRay: (options: {
    readonly origin: Vec3;
    readonly direction: Vec3;
    readonly reachMetres: number;
    readonly frame: number;
    readonly interactionDistanceBlocks?: number;
  }) => void;
  updateTransientDraw: (nowMs: number) => void;
  advanceRagdollSweep: (realDt: number) => void;
  recordMeleeResult: (result: MeleeResult) => void;
  readonly buildOn: boolean;
  readonly noclip: boolean;
  readonly spectatorCamera: boolean;
  readonly perceptionLabels: boolean;
  /** The whole simulation is stopped (M): the game combines this with the pause menu's pause. */
  readonly frozen: boolean;
  readonly spawnOpen: boolean;
  readonly revealActors: boolean;
  handleAction: (action: string) => boolean;
  closeMenus: () => void;
  target: (eye: Vec3, dir: Vec3, active: boolean) => string;
  click: (button: number, eye: Vec3, dir: Vec3) => void;
  wheel: (delta: number) => void;
  stepNoclip: (step: DebugNoclipStep) => void;
  update: (readout: DebugReadout) => void;
}

export interface DebugModule {
  measureSnapshotForSession: (snapshot: () => unknown, session: Session) => SnapshotMeasurement;
  attachDebugTools: (hooks: DebugHooks) => DebugRuntime;
}
