const LOOK_SENSITIVITY = 0.0022;

const THIRD_PERSON_FOLLOW_DISTANCE = 3;
const THIRD_PERSON_FOLLOW_HEIGHT = 1.1;

export const THIRD_PERSON_CAMERA = {
  followDistance: THIRD_PERSON_FOLLOW_DISTANCE,
  followHeight: THIRD_PERSON_FOLLOW_HEIGHT,
  followElevation: Math.atan2(THIRD_PERSON_FOLLOW_HEIGHT, THIRD_PERSON_FOLLOW_DISTANCE),
  elevationLimit: 1.2,
} as const;

const MIN_ORBIT_PITCH = -THIRD_PERSON_CAMERA.elevationLimit - THIRD_PERSON_CAMERA.followElevation;
const MAX_ORBIT_PITCH = THIRD_PERSON_CAMERA.elevationLimit - THIRD_PERSON_CAMERA.followElevation;

export const isPlayerThirdPersonView = (thirdPerson: boolean, spectatorCamera: boolean): boolean =>
  thirdPerson && !spectatorCamera;

export const isOrbitResetMovementAction = (action: string): boolean =>
  action === 'movement.forward' ||
  action === 'movement.back' ||
  action === 'movement.left' ||
  action === 'movement.right';

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
      pitch: Math.max(MIN_ORBIT_PITCH, Math.min(MAX_ORBIT_PITCH, angle.pitch - movementY * LOOK_SENSITIVITY)),
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
