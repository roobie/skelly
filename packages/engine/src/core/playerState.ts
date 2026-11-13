import type { LadderHoldState } from './ladders.ts';
import type { Body } from './physics.ts';
import type { PlayerStance } from './playerStance.ts';

export interface PlayerState {
  body: Body;
  yaw: number;
  pitch: number;
  walk: boolean;
  stance: PlayerStance;
  sprinting: boolean;
  firearmReadyWalking: boolean;
  snipingAdsUid?: number | undefined;
  handlingPausedForKnockout: boolean;
  ladder: LadderHoldState | null;
}
