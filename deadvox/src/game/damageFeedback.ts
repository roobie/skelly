// Short-lived visual feedback for accepted damage. Time is supplied by the frame
// loop so this remains deterministic in scripted frame-by-frame tests.

import { Euler } from 'three';

/** The visual camera follows the same input angles and adds only presentation roll. */
export const cameraRotation = (pitch: number, yaw: number, roll: number): Euler => new Euler(pitch, yaw, roll, 'YXZ');

export interface DamageFeedbackState {
  readonly vignetteOpacity: number;
  readonly roll: number;
}

export class DamageFeedback {
  private vignetteAge = Number.POSITIVE_INFINITY;
  private rollAge = Number.POSITIVE_INFINITY;
  private vignetteStrength = 0;
  private rollPeak = 0;
  private direction = 1;

  hit(amount: number, direction?: -1 | 1): void {
    if (!(amount > 0)) {
      return;
    }
    this.vignetteAge = 0;
    this.rollAge = 0;
    this.vignetteStrength = Math.min(0.72, (amount / 25) * 0.72);
    this.rollPeak = Math.min(6, (amount / 25) * 6) * (Math.PI / 180);
    this.direction = direction ?? -this.direction;
  }

  step(dt: number): DamageFeedbackState {
    this.vignetteAge += dt;
    this.rollAge += dt;
    const vignetteOpacity = this.vignetteAge >= 1 ? 0 : this.vignetteStrength * (1 - this.vignetteAge);
    let roll = 0;
    const rise = 4 / 60;
    if (this.rollAge < rise) {
      roll = this.rollPeak * (this.rollAge / rise);
    } else if (this.rollAge < 0.35) {
      roll = this.rollPeak * (1 - (this.rollAge - rise) / (0.35 - rise));
    }
    return { vignetteOpacity, roll: roll * this.direction };
  }
}
