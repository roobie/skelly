import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Body } from '../core/physics.ts';
import type { Scale } from '../core/scale.ts';
import type { Simulation } from '../core/sim.ts';
import type { MeleeResult, ZombieAim, ZombieSystem } from '../core/zombies.ts';
import type { HeardSound } from './audio.ts';
import type { Engine } from './engine.ts';
import type { MoveIntent } from './player.ts';

export interface DebugHooks {
  readonly engine: Engine;
  readonly body: Body;
  readonly inventory: Inventory;
  readonly newGame: boolean;
  readonly sim: Simulation;
  readonly input: { readonly yaw: number; readonly pitch: number };
  readonly zombies: () => ZombieSystem | undefined;
  readonly feet: () => Vec3;
  readonly showNotice: (text: string) => void;
  readonly spawnItem: (type: string) => string;
  readonly compress: () => void;
  readonly setTimeOfDay: (hour: number, minute: number) => void;
  readonly revealZombies: (enabled: boolean) => void;
  readonly measureSnapshot: () => { samples: number; p50Ms: number; p95Ms: number; stateUnchanged: boolean };
  readonly exportMetrics: () => void;
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
  readonly renderMs: number;
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
  recordMeleeResult: (result: MeleeResult) => void;
  readonly buildOn: boolean;
  readonly noclip: boolean;
  readonly spawnOpen: boolean;
  readonly revealZombies: boolean;
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
