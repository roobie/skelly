import type { Character } from '../core/character.ts';
import type { Vec3 } from '../core/coords.ts';
import type { FirearmsSkillZeroHandling } from '../core/firearmsSkill.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Body } from '../core/physics.ts';
import type { Scale } from '../core/scale.ts';
import type { Simulation } from '../core/sim.ts';
import type { Weather } from '../core/weather.ts';
import type { MeleeResult, ZombieAim, ZombieSystem } from '../core/zombies.ts';
import type { FrameSummary } from '../render/frameTimes.ts';
import type { HeardSound } from './audio.ts';
import type { Engine } from './engine.ts';
import type { MoveIntent } from './player.ts';
import type { SnapshotMeasurement } from './playtestTools.ts';

export type InputReplayStatusState = 'idle' | 'recording' | 'playing' | 'verified' | 'diverged' | 'unavailable';

export interface DebugHooks {
  readonly engine: Engine;
  /** The weather play renders with; the debug look controls set its fogginess. */
  readonly weather: Weather;
  /** The held light's beam; the debug look controls set its strength multiplier. */
  readonly flashlight: { strength: number };
  readonly body: Body;
  readonly inventory: Inventory;
  readonly character: Character;
  readonly newGame: boolean;
  readonly sim: Simulation;
  /** Debug tools may set the look direction (`?cam=` restore, debug/camUrl.ts). */
  readonly input: { yaw: number; pitch: number };
  readonly debugModifierHeld: () => boolean;
  /** The camera's current roll in radians (damage feedback; 0 otherwise). */
  readonly roll: () => number;
  readonly zombies: () => ZombieSystem | undefined;
  readonly feet: () => Vec3;
  readonly showNotice: (text: string) => void;
  readonly spawnItem: (type: string) => string;
  readonly compress: () => void;
  /** Fast-forwards through compression; real interruptions still end the skip. */
  readonly skipGameHours: (hours: number) => void;
  readonly setTimeOfDay: (hour: number, minute: number) => void;
  readonly revealZombies: (enabled: boolean) => void;
  readonly measureSnapshot: () => SnapshotMeasurement;
  readonly impactLaser: { enabled: () => boolean; toggle: () => void };
  readonly spectatorCamera: { enabled: () => boolean; toggle: () => void };
  readonly perceptionLabels: { enabled: () => boolean; toggle: () => void };
  /** Emits the existing `player_hurt_light` sound and its player-noise event; this debug action changes simulation state. */
  readonly emitTestNoise: () => boolean;
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

export interface DebugNoclipStep {
  body: Body;
  scale: Scale;
  yaw: number;
  pitch: number;
  intent: MoveIntent;
  descend: boolean;
  dt: number;
}

export interface DebugReadout {
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
  readonly zombies: number;
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
  readonly revealedZombies: readonly string[];
}

export interface DebugRuntime {
  readonly menuOpen: boolean;
  readonly aimEnabled: boolean;
  updateAim: (aim: ZombieAim | undefined) => void;
  setCrosshairVisible: (visible: boolean) => void;
  /** Names the block or furniture under the crosshair in the aim readout; call after `updateAim`, which wins when a shambler is aimed at. */
  updateLookedAt: (eye: Vec3, dir: Vec3, active: boolean) => void;
  recordMeleeResult: (result: MeleeResult) => void;
  readonly buildOn: boolean;
  readonly noclip: boolean;
  readonly spectatorCamera: boolean;
  readonly perceptionLabels: boolean;
  /** The whole simulation is stopped (M): the game combines this with the pause menu's pause. */
  readonly frozen: boolean;
  readonly spawnOpen: boolean;
  readonly revealZombies: boolean;
  dangerReason: () => string | undefined;
  handleAction: (action: string) => boolean;
  closeMenus: () => void;
  target: (eye: Vec3, dir: Vec3, active: boolean) => string;
  click: (button: number, eye: Vec3, dir: Vec3) => void;
  wheel: (delta: number) => void;
  stepNoclip: (step: DebugNoclipStep) => void;
  update: (readout: DebugReadout) => void;
}

export interface DebugModule {
  attachDebugTools: (hooks: DebugHooks) => DebugRuntime;
}
