import type { Body } from '../core/physics.ts';
import type { Scale } from '../core/scale.ts';
import type { PlayerDef } from '../core/schema.ts';
import type { MoveIntent } from '../game/player.ts';

export interface NoclipStep {
  body: Body;
  scale: Scale;
  yaw: number;
  pitch: number;
  intent: MoveIntent;
  descend: boolean;
  dt: number;
}

/** Moves directly in view space without gravity or collision while noclip is enabled. */
export const stepNoclip = ({ body, scale, yaw, pitch, intent, descend, dt }: NoclipStep, Player: PlayerDef): void => {
  let { forward, right } = intent;
  let vertical = Number(intent.jump) - Number(descend);
  const length = Math.hypot(forward, right, vertical);
  if (length > 1) {
    forward /= length;
    right /= length;
    vertical /= length;
  }
  let pace: number = Player.jog;
  if (intent.walk) {
    pace = Player.walk;
  }
  if (intent.sprint) {
    pace = Player.sprint;
  }
  const speed = (pace * (intent.pace ?? 1)) / scale.blockSize;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  body.pos[0] += speed * dt * (forward * -sinYaw * cosPitch + right * cosYaw);
  body.pos[1] += speed * dt * (forward * sinPitch + vertical);
  body.pos[2] += speed * dt * (forward * -cosYaw * cosPitch - right * sinYaw);
  body.vel = [0, 0, 0];
  body.onGround = false;
};
