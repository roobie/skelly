import type { Vec3 } from './coords.ts';

/** Camera-local angles shared by firearm presentation and ballistic direction. */
export interface AimFrame {
  readonly yaw: number;
  readonly pitch: number;
}

export const NEUTRAL_AIM: AimFrame = Object.freeze({ yaw: 0, pitch: 0 });

export interface AimState {
  gaitPhase: number;
  lookYaw: number;
  lookPitch: number;
  recoilYaw: number;
  recoilPitch: number;
  lastYaw: number;
  lastPitch: number;
  hasLookSample: boolean;
  frame: AimFrame;
}

/** One-step input is simulation data; velocity is in blocks per second. */
export interface AimStep {
  readonly dt: number;
  readonly velocity: Vec3;
  readonly blockSize: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly variance: number;
}

const TAU = Math.PI * 2;
const GAIT_BASE_HZ = 1.15;
const GAIT_SPEED_HZ = 0.72;
const MOVE_YAW_PER_SPEED = 0.0045;
const MOVE_PITCH_PER_SPEED = 0.003;
const LOOK_LAG_PER_RADIAN = 0.035;
const LOOK_SETTLE_SECONDS = 0.22;
const RECOIL_RECOVERY_SECONDS = 0.34;
const MAX_OFFSET = 0.12;

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const bounded = (value: number): number => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, value));

const boundedFrame = (yaw: number, pitch: number): AimFrame => {
  const yawOffset = bounded(yaw);
  const pitchOffset = bounded(pitch);
  const magnitude = Math.hypot(yawOffset, pitchOffset);
  const scale = magnitude > MAX_OFFSET ? MAX_OFFSET / magnitude : 1;
  return Object.freeze({ yaw: yawOffset * scale, pitch: pitchOffset * scale });
};

const frameFromState = (state: AimState, speed: number, variance: number): AimFrame => {
  const gait = Math.sin(state.gaitPhase);
  const yawOffset = (state.lookYaw + gait * speed * MOVE_YAW_PER_SPEED + state.recoilYaw) * variance;
  const pitchOffset =
    (state.lookPitch + Math.cos(state.gaitPhase) * speed * MOVE_PITCH_PER_SPEED + state.recoilPitch) * variance;
  return boundedFrame(yawOffset, pitchOffset);
};

export const initialAimState = (): AimState => ({
  gaitPhase: 0,
  lookYaw: 0,
  lookPitch: 0,
  recoilYaw: 0,
  recoilPitch: 0,
  lastYaw: 0,
  lastPitch: 0,
  hasLookSample: false,
  frame: NEUTRAL_AIM,
});

export const assertAimState = (state: AimState): void => {
  if (
    !(
      state &&
      [
        state.gaitPhase,
        state.lookYaw,
        state.lookPitch,
        state.recoilYaw,
        state.recoilPitch,
        state.lastYaw,
        state.lastPitch,
        state.frame?.yaw,
        state.frame?.pitch,
      ].every(Number.isFinite)
    ) ||
    typeof state.hasLookSample !== 'boolean' ||
    Math.abs(state.gaitPhase) > TAU * 4 ||
    Math.abs(state.lookYaw) > MAX_OFFSET * 8 ||
    Math.abs(state.lookPitch) > MAX_OFFSET * 8 ||
    Math.abs(state.recoilYaw) > MAX_OFFSET * 8 ||
    Math.abs(state.recoilPitch) > MAX_OFFSET * 8 ||
    Math.hypot(state.frame.yaw, state.frame.pitch) > MAX_OFFSET + 1e-9
  ) {
    throw new Error('Invalid aim state');
  }
};

/** Mutable state owner; all time and input arrive on the fixed simulation step. */
export class AimController {
  private readonly state: AimState;
  private variance: number;

  constructor(state: AimState = initialAimState(), variance = 1) {
    assertAimState(state);
    if (!(Number.isFinite(variance) && variance > 0)) {
      throw new Error('Invalid aim variance');
    }
    this.state = structuredClone(state);
    this.state.frame = Object.freeze({ ...this.state.frame });
    this.variance = variance;
  }

  get frame(): AimFrame {
    return this.state.frame;
  }

  snapshotState(): Readonly<AimState> {
    return Object.freeze({ ...this.state });
  }

  advance({ dt, velocity, blockSize, yaw, pitch, variance }: AimStep): AimFrame {
    if (
      !(
        Number.isFinite(dt) &&
        dt > 0 &&
        Number.isFinite(blockSize) &&
        blockSize > 0 &&
        Number.isFinite(variance) &&
        variance > 0 &&
        velocity.every(Number.isFinite) &&
        [yaw, pitch].every(Number.isFinite)
      )
    ) {
      throw new Error('Invalid aim step');
    }
    const { state } = this;
    const speed = Math.hypot(velocity[0], velocity[2]) * blockSize;
    this.variance = variance;
    const phaseRate = TAU * (GAIT_BASE_HZ + speed * GAIT_SPEED_HZ);
    state.gaitPhase = (state.gaitPhase + dt * phaseRate) % TAU;

    if (state.hasLookSample) {
      const yawRate = wrapAngle(yaw - state.lastYaw) / dt;
      const pitchRate = (pitch - state.lastPitch) / dt;
      state.lookYaw = bounded(state.lookYaw - yawRate * LOOK_LAG_PER_RADIAN * dt);
      state.lookPitch = bounded(state.lookPitch - pitchRate * LOOK_LAG_PER_RADIAN * dt);
    }
    state.lastYaw = yaw;
    state.lastPitch = pitch;
    state.hasLookSample = true;

    const lookDecay = Math.exp(-dt / LOOK_SETTLE_SECONDS);
    const recoilDecay = Math.exp(-dt / RECOIL_RECOVERY_SECONDS);
    state.lookYaw *= lookDecay;
    state.lookPitch *= lookDecay;
    state.recoilYaw *= recoilDecay;
    state.recoilPitch *= recoilDecay;

    state.frame = frameFromState(state, speed, variance);
    return state.frame;
  }

  /** A committed shot applies its firearm's kick; the seed makes direction deterministic. */
  recordShot(seed: number, recoilKickRadians: number): void {
    if (
      !Number.isSafeInteger(seed) ||
      seed < 0 ||
      seed > 0xff_ff_ff_ff ||
      !Number.isFinite(recoilKickRadians) ||
      recoilKickRadians <= 0
    ) {
      throw new Error('Invalid aim recoil input');
    }
    const sign = (seed & 1) === 0 ? -1 : 1;
    const previousYaw = this.state.recoilYaw;
    const previousPitch = this.state.recoilPitch;
    const yawFactor = 0.5 + ((seed >>> 1) & 0xff) / 510;
    this.state.recoilYaw = bounded(previousYaw + sign * recoilKickRadians * yawFactor);
    this.state.recoilPitch = bounded(previousPitch + recoilKickRadians);
    this.state.frame = boundedFrame(
      this.state.frame.yaw + (this.state.recoilYaw - previousYaw) * this.variance,
      this.state.frame.pitch + (this.state.recoilPitch - previousPitch) * this.variance,
    );
  }
}

export interface AimBasis {
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
}

const cameraLocalVector = (vector: Vec3, yaw: number, pitch: number, frame: AimFrame): Vec3 => {
  const [x, y, z] = vector;
  const aimY = Math.cos(frame.pitch) * y - Math.sin(frame.pitch) * z;
  const aimZ = Math.sin(frame.pitch) * y + Math.cos(frame.pitch) * z;
  const aimX = Math.cos(frame.yaw) * x + Math.sin(frame.yaw) * aimZ;
  const rotatedAimZ = -Math.sin(frame.yaw) * x + Math.cos(frame.yaw) * aimZ;
  const cameraY = Math.cos(pitch) * aimY - Math.sin(pitch) * rotatedAimZ;
  const cameraZ = Math.sin(pitch) * aimY + Math.cos(pitch) * rotatedAimZ;
  return [Math.cos(yaw) * aimX + Math.sin(yaw) * cameraZ, cameraY, -Math.sin(yaw) * aimX + Math.cos(yaw) * cameraZ];
};

export const aimDirection = (yaw: number, pitch: number, frame: AimFrame): Vec3 =>
  cameraLocalVector([0, 0, -1], yaw, pitch, frame);

export const aimBasis = (yaw: number, pitch: number, frame: AimFrame): AimBasis => ({
  forward: aimDirection(yaw, pitch, frame),
  right: cameraLocalVector([1, 0, 0], yaw, pitch, frame),
  up: cameraLocalVector([0, 1, 0], yaw, pitch, frame),
});
