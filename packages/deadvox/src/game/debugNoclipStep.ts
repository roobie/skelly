import type { Body } from '../core/physics.ts';
import type { Scale } from '../core/scale.ts';
import type { MoveIntent } from './player.ts';

export interface DebugNoclipStep {
  body: Body;
  scale: Scale;
  yaw: number;
  pitch: number;
  intent: MoveIntent;
  descend: boolean;
  dt: number;
}
