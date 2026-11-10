import type { Body } from '../../../engine/src/core/physics.ts';
import type { Scale } from '../../../engine/src/core/scale.ts';
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
