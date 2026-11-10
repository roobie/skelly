import type { PlayerDef } from '@skelly/engine/content';
import { simRate, simSeconds } from '@skelly/engine/internal/core/time.ts';
import { createPlayerBody as bodyFor, physicsFor as paramsFor } from '../../engine/src/game/entries/sim.ts';
import { movementPace as paceWith, steer as steerWith } from '../../engine/src/game/player.ts';
import playerContent from '../../mods/skelly.body/player.json' with { type: 'json' };

export type { MoveIntent } from '../../engine/src/game/entries/sim.ts';
export type { StanceToggle } from '../../engine/src/game/player.ts';

export const PLAYER: PlayerDef = {
  id: 'player',
  capability: 'player',
  halfWidth: 0.3,
  height: 1.8,
  eye: 1.62,
  walk: simRate(1.8),
  jog: simRate(4.3),
  sprint: simRate(6.5),
  jump: simRate(playerContent.player[0]!.jump),
  gravityMetresPerSimSecondSquared: playerContent.player[0]!.gravityMetresPerSimSecondSquared,
  reach: 4,
  debugBlockTool: playerContent.player[0]!.debugBlockTool,
  stepHeight: 0.5,
  movement: { sidewaysSpeedScale: 0.7, backwardSpeedScale: 0.5 },
  lean: {
    offsetMetres: 0.1,
    rollDegrees: 12,
    enterSimSeconds: simSeconds(0.22),
    returnSimSeconds: simSeconds(0.18),
    movementSpeedScale: 0.65,
    wallMarginMetres: 0.02,
  },
  crouch: { speedMetresPerSimSecond: simRate(1), eyeDropMetres: 0.7, bodyHeightMetres: 1.2 },
  prone: { speedMetresPerSimSecond: simRate(0.5), eyeDropMetres: 1.3, bodyHeightMetres: 0.6 },
  load: { light: 20_000, heavy: 40_000, slowest: 0.6, handlingScale: 0.5 },
  aim: {
    lookSensitivityRadiansPerPixel: 0.0022,
    freeLook: { yawLimitRadians: 1, pitchLimitRadians: 0.5, returnRadiansPerRealSecond: 4 },
  },
};
export const AIM = {
  ...PLAYER.aim,
  moveYawPerSpeed: 0.0045,
  lookLagPerRadian: 0.035,
  lookSettleSimSeconds: simSeconds(0.22),
  recoilRecoverySimSeconds: simSeconds(0.34),
  maxOffsetRadians: 0.12,
};
export const WORLD_GRAVITY = PLAYER.gravityMetresPerSimSecondSquared;

export const physicsFor = (scale: Parameters<typeof paramsFor>[0], player: PlayerDef = PLAYER) =>
  paramsFor(scale, player);
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
