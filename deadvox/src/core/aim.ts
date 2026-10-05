import type { Vec3 } from './coords.ts';

/** Camera-local angles shared by firearm presentation and ballistic direction. */
export interface AimFrame {
  readonly yaw: number;
  readonly pitch: number;
}

export interface AimState {
  gaitPhase: number;
  lookYaw: number;
  lookPitch: number;
  recoilYaw: number;
  recoilPitch: number;
  lastYaw: number;
  lastPitch: number;
  hasLookSample: boolean;
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
const SHOT_KICK = 0.035;
const MAX_OFFSET = 0.12;

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const bounded = (value: number): number => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, value));

export const initialAimState = (): AimState => ({
  gaitPhase: 0,
  lookYaw: 0,
  lookPitch: 0,
  recoilYaw: 0,
  recoilPitch: 0,
  lastYaw: 0,
  lastPitch: 0,
  hasLookSample: false,
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
      ].every(Number.isFinite)
    ) ||
    typeof state.hasLookSample !== 'boolean' ||
    Math.abs(state.gaitPhase) > TAU * 4 ||
    Math.abs(state.lookYaw) > MAX_OFFSET * 8 ||
    Math.abs(state.lookPitch) > MAX_OFFSET * 8 ||
    Math.abs(state.recoilYaw) > MAX_OFFSET * 8 ||
    Math.abs(state.recoilPitch) > MAX_OFFSET * 8
  ) {
    throw new Error('Invalid aim state');
  }
};

/** Mutable state owner; all time and input arrive on the fixed simulation step. */
export class AimController {
  private readonly state: AimState;
  private current: AimFrame = Object.freeze({ yaw: 0, pitch: 0 });

  constructor(state: AimState = initialAimState()) {
    assertAimState(state);
    this.state = structuredClone(state);
  }

  get frame(): AimFrame {
    return this.current;
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

    const gait = Math.sin(state.gaitPhase);
    const yawOffset = bounded((state.lookYaw + gait * speed * MOVE_YAW_PER_SPEED + state.recoilYaw) * variance);
    const pitchOffset = bounded(
      (state.lookPitch + Math.cos(state.gaitPhase) * speed * MOVE_PITCH_PER_SPEED + state.recoilPitch) * variance,
    );
    const magnitude = Math.hypot(yawOffset, pitchOffset);
    const scale = magnitude > MAX_OFFSET ? MAX_OFFSET / magnitude : 1;
    this.current = Object.freeze({ yaw: yawOffset * scale, pitch: pitchOffset * scale });
    return this.current;
  }

  /** A committed shot kicks the next frame; its seed makes direction deterministic. */
  recordShot(seed: number): void {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xff_ff_ff_ff) {
      throw new Error('Invalid aim recoil seed');
    }
    const sign = (seed & 1) === 0 ? -1 : 1;
    this.state.recoilYaw = bounded(this.state.recoilYaw + sign * SHOT_KICK * (0.5 + ((seed >>> 1) & 0xff) / 510));
    this.state.recoilPitch = bounded(this.state.recoilPitch + SHOT_KICK);
  }
}

export const aimDirection = (yaw: number, pitch: number, frame: AimFrame): Vec3 => {
  const resolvedYaw = yaw + frame.yaw;
  const resolvedPitch = pitch + frame.pitch;
  return [
    -Math.sin(resolvedYaw) * Math.cos(resolvedPitch),
    Math.sin(resolvedPitch),
    -Math.cos(resolvedYaw) * Math.cos(resolvedPitch),
  ];
};
