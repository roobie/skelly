const LOOK_SENSITIVITY = 0.0022;
const ORBIT_PITCH_LIMIT = 1.2;

export const isPlayerThirdPersonView = (thirdPerson: boolean, spectatorCamera: boolean): boolean =>
  thirdPerson && !spectatorCamera;

export interface ThirdPersonOrbitAngle {
  readonly yaw: number;
  readonly pitch: number;
}

/** Presentation-only orbit state; it never changes player facing or aim. */
export class ThirdPersonOrbit {
  private angleValue: ThirdPersonOrbitAngle | undefined;
  private held = false;

  begin(facingYaw: number): void {
    this.held = true;
    this.angleValue ??= { yaw: facingYaw, pitch: 0 };
  }

  rotate(movementX: number, movementY: number, enabled: boolean): boolean {
    if (!(this.held && enabled)) {
      return false;
    }
    const angle = this.angleValue;
    if (!angle) {
      return false;
    }
    this.angleValue = {
      yaw: angle.yaw - movementX * LOOK_SENSITIVITY,
      pitch: Math.max(-ORBIT_PITCH_LIMIT, Math.min(ORBIT_PITCH_LIMIT, angle.pitch - movementY * LOOK_SENSITIVITY)),
    };
    return true;
  }

  release(): void {
    this.held = false;
  }

  movementInput(): void {
    if (!this.held) {
      this.angleValue = undefined;
    }
  }

  reset(): void {
    this.angleValue = undefined;
    this.held = false;
  }

  angle(enabled: boolean): ThirdPersonOrbitAngle | undefined {
    return enabled && this.angleValue ? { ...this.angleValue } : undefined;
  }
}
