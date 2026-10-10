const LOOK_SENSITIVITY = 0.0022;
const DOUBLE_TAP_MS = 350;
const ORBIT_PITCH_LIMIT = 1.2;

export interface ThirdPersonOrbitAngle {
  readonly yaw: number;
  readonly pitch: number;
}

/** Presentation-only orbit state; it never changes player facing or aim. */
export class ThirdPersonOrbit {
  private angleValue: ThirdPersonOrbitAngle | undefined;
  private held = false;
  private ignoreUntilRelease = false;
  private lastPressAt: number | undefined;

  press(at: number, enabled: boolean, facingYaw: number): void {
    if (this.lastPressAt !== undefined && at - this.lastPressAt <= DOUBLE_TAP_MS) {
      this.angleValue = undefined;
      this.held = false;
      this.ignoreUntilRelease = true;
      this.lastPressAt = undefined;
      return;
    }
    this.lastPressAt = at;
    this.held = true;
    this.ignoreUntilRelease = false;
    if (enabled && this.angleValue === undefined) {
      this.angleValue = { yaw: facingYaw, pitch: 0 };
    }
  }

  release(): void {
    this.held = false;
    this.ignoreUntilRelease = false;
  }

  rotate(movementX: number, movementY: number, enabled: boolean, facingYaw: number): boolean {
    if (!this.held || this.ignoreUntilRelease || !enabled) {
      return false;
    }
    const angle = this.angleValue ?? { yaw: facingYaw, pitch: 0 };
    this.angleValue = {
      yaw: angle.yaw - movementX * LOOK_SENSITIVITY,
      pitch: Math.max(-ORBIT_PITCH_LIMIT, Math.min(ORBIT_PITCH_LIMIT, angle.pitch - movementY * LOOK_SENSITIVITY)),
    };
    return true;
  }

  movementInput(): void {
    if (!this.held) {
      this.angleValue = undefined;
    }
  }

  reset(): void {
    this.angleValue = undefined;
    this.held = false;
    this.ignoreUntilRelease = false;
    this.lastPressAt = undefined;
  }

  angle(enabled: boolean): ThirdPersonOrbitAngle | undefined {
    return enabled && this.angleValue ? { ...this.angleValue } : undefined;
  }
}
