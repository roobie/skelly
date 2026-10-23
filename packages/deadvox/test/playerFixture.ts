import type { PlayerDef } from '../src/core/schema.ts';
import { simRate, simSeconds } from '../src/core/time.ts';
import {
  createPlayerBody as bodyFor,
  movementPace as paceWith,
  physicsFor as paramsFor,
  steer as steerWith,
} from '../src/game/player.ts';

export type { MoveIntent, StanceToggle } from '../src/game/player.ts';

export const PLAYER: PlayerDef = {
  id: 'player',
  halfWidth: 0.3,
  height: 1.8,
  eye: 1.62,
  walk: simRate(1.8),
  jog: simRate(4.3),
  sprint: simRate(6.5),
  jump: simRate(7.9),
  reach: 4,
  stepHeight: 0.5,
  movement: { sidewaysSpeedScale: 0.7, backwardSpeedScale: 0.5 },
  crouch: { speedMetresPerSimSecond: simRate(1), eyeDropMetres: 0.7, bodyHeightMetres: 1.2 },
  prone: { speedMetresPerSimSecond: simRate(0.5), eyeDropMetres: 1.3, bodyHeightMetres: 0.6 },
  load: { light: 20_000, heavy: 40_000, slowest: 0.6, handlingScale: 0.5 },
  aim: {
    moveYawPerSpeed: 0.0045,
    lookLagPerRadian: 0.035,
    lookSettleSimSeconds: simSeconds(0.22),
    recoilRecoverySimSeconds: simSeconds(0.34),
    maxOffsetRadians: 0.12,
  },
};
export const physicsFor = (scale: Parameters<typeof paramsFor>[0]) => paramsFor(scale, PLAYER);
export const createPlayerBody = (scale: Parameters<typeof bodyFor>[0], x: number, y: number, z: number) =>
  bodyFor(scale, [x, y, z], PLAYER);
export const steer = (
  body: Parameters<typeof steerWith>[0],
  scale: Parameters<typeof steerWith>[1],
  yaw: number,
  intent: Parameters<typeof steerWith>[2]['intent'],
) => steerWith(body, scale, { yaw, intent }, PLAYER);
export const movementPace = (...args: [Parameters<typeof paceWith>[0], Parameters<typeof paceWith>[1]]) =>
  paceWith(...args, PLAYER);
