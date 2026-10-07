import type { Vec3 } from '../core/coords.ts';

export interface DebugTargetRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export interface DebugTargetRayInput {
  readonly bore: DebugTargetRay | undefined;
  readonly eye: Vec3;
  readonly lookDirection: Vec3;
  readonly rightMouseHeld: boolean;
  readonly pointerLocked: boolean;
  readonly menuPointer: boolean;
  readonly firearmReady: boolean;
}

export const debugTargetRay = ({
  bore,
  eye,
  lookDirection,
  rightMouseHeld,
  pointerLocked,
  menuPointer,
  firearmReady,
}: DebugTargetRayInput): DebugTargetRay => {
  if (bore && rightMouseHeld && pointerLocked && !menuPointer && firearmReady) {
    return { origin: bore.origin, direction: bore.direction };
  }
  return { origin: eye, direction: lookDirection };
};
