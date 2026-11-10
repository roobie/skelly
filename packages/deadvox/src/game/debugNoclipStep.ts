import type { Body, Scale } from '@skelly/engine/world';
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
