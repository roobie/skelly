import type { Vec3 } from '../core/coords.ts';
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

export interface DebugHooks {
  readonly engine: Engine;
  /** The weather play renders with; the debug look controls set its fogginess. */
  readonly weather: Weather;
  /** The held light's beam; the debug look controls set its strength multiplier. */
  readonly flashlight: { strength: number };
  readonly body: Body;
  readonly inventory: Inventory;
  readonly newGame: boolean;
  readonly sim: Simulation;
  /** Debug tools may set the look direction (`?cam=` restore, debug/camUrl.ts). */
  readonly input: { yaw: number; pitch: number };
  /** The camera's current roll in radians (damage feedback; 0 otherwise). */
  readonly roll: () => number;
  readonly zombies: () => ZombieSystem | undefined;
  readonly feet: () => Vec3;
  readonly showNotice: (text: string) => void;
  readonly spawnItem: (type: string) => string;
  readonly compress: () => void;
  /**
   * Fast-forwards the real game clock by this many game hours through compression, ignoring
   * danger; calling it during a skip extends the target. Real interruptions (damage, a need
   * turning critical, noise) still end it.
   */
  readonly skipGameHours: (hours: number) => void;
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
}

export interface DebugRuntime {
  readonly menuOpen: boolean;
  readonly aimEnabled: boolean;
  updateAim: (aim: ZombieAim | undefined) => void;
  /** Names the block or furniture under the crosshair in the aim readout; call after `updateAim`, which wins when a shambler is aimed at. */
  updateLookedAt: (eye: Vec3, dir: Vec3, active: boolean) => void;
  recordMeleeResult: (result: MeleeResult) => void;
  readonly buildOn: boolean;
  readonly noclip: boolean;
  /** The whole simulation is stopped (M): the game combines this with the pause menu's pause. */
  readonly frozen: boolean;
  readonly spawnOpen: boolean;
  dangerReason: () => string | undefined;
  handleKey: (e: KeyboardEvent) => boolean;
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
