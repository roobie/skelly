import type { PlayerDef } from '../core/schema.ts';

export type FreeLookTuning = PlayerDef['aim']['freeLook'];

const towardsZero = (value: number, step: number): number => Math.sign(value) * Math.max(0, Math.abs(value) - step);

/** Transient head offsets never become the body's movement or ballistic heading. */
export class FreeLook {
  yaw = 0;
  pitch = 0;
  active = false;

  update(dt: number, held: boolean, ads: boolean, tuning: FreeLookTuning): void {
    this.active = held && !ads;
    if (ads) {
      this.clear();
    } else if (!this.active) {
      const step = tuning.returnRadiansPerRealSecond * dt;
      this.yaw = towardsZero(this.yaw, step);
      this.pitch = towardsZero(this.pitch, step);
    }
  }

  turn(yaw: number, pitch: number, tuning: FreeLookTuning): void {
    this.yaw = Math.max(-tuning.yawLimitRadians, Math.min(tuning.yawLimitRadians, this.yaw + yaw));
    this.pitch = Math.max(-tuning.pitchLimitRadians, Math.min(tuning.pitchLimitRadians, this.pitch + pitch));
  }

  clear(): void {
    this.active = false;
    this.yaw = 0;
    this.pitch = 0;
  }
}

export const freeLookAllowsCommand = (freeLooking: boolean, action: string): boolean =>
  !(
    freeLooking &&
    (action === 'world.interact' ||
      action === 'player.throw' ||
      action === 'light.worn-toggle' ||
      action.startsWith('firearm.') ||
      action.startsWith('carry.') ||
      action.startsWith('quickbar.') ||
      action === 'craft.continue')
  );

export const freeLookAllowsUse = (freeLooking: boolean, kind: string): boolean => !freeLooking || kind === 'firearm';
