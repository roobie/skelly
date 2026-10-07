import type { Vec3 } from './coords.ts';
import { hash3 } from './random.ts';

/** Camera-local angles shared by firearm presentation and ballistic direction. */
export interface AimFrame {
  readonly yaw: number;
  readonly pitch: number;
}

export const NEUTRAL_AIM: AimFrame = Object.freeze({ yaw: 0, pitch: 0 });

export interface AimState {
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
  readonly firing: boolean;
  readonly recoilRecoveryRate: number;
  /** Fraction of the shared two-step footfall stride. */
  readonly stridePhase: number;
  readonly stepIndex: number;
}

export interface AimWobbleShape {
  readonly archPower: number;
  readonly phaseOffsetRadians: number;
  readonly jitterShare: number;
  readonly jitterAmplitudeFraction: number;
}

const TAU = Math.PI * 2;
const MOVE_YAW_PER_SPEED = 0.0045;
const MOVE_PITCH_PER_SPEED = 0.003;
const LOOK_LAG_PER_RADIAN = 0.035;
const LOOK_SETTLE_SECONDS = 0.22;
const RECOIL_RECOVERY_SECONDS = 0.34;
const MAX_OFFSET = 0.12;

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const bounded = (value: number): number => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, value));

const boundVector = (yaw: number, pitch: number, limit: number): AimFrame => {
  const magnitude = Math.hypot(yaw, pitch);
  const scale = magnitude > limit ? limit / magnitude : 1;
  return { yaw: yaw * scale, pitch: pitch * scale };
};

// Keep gait/look wobble separate so its larger content bound cannot enlarge recoil's view-pitch limit.
const frameFromState = (
  state: AimState,
  speed: number,
  variance: number,
  wobbleLimitRadians: number,
  shape: AimWobbleShape,
  jitterSeed: number,
  stridePhase: number,
  stepIndex: number,
): { frame: AimFrame; viewPitchShift: number } => {
  const phase = stridePhase * TAU;
  const gait = Math.sin(phase);
  const archPhase = phase + shape.phaseOffsetRadians * Math.sin(2 * phase) ** 2;
  const pitchArch = 1 - 2 * Math.abs(Math.sin(archPhase)) ** shape.archPower;
  const stepProgress = ((stridePhase + 0.25) * 2) % 1;
  const jitterEnvelope = Math.sin(Math.PI * stepProgress) ** 2;
  const carriesJitter = hash3(jitterSeed, stepIndex, 0, 0) < shape.jitterShare;
  const jitterAngle = hash3(jitterSeed, stepIndex, 1, 0) * TAU;
  const jitterScale =
    carriesJitter
      ? shape.jitterAmplitudeFraction * (0.5 + hash3(jitterSeed, stepIndex, 2, 0) * 0.5) * jitterEnvelope
      : 0;
  const wobble = boundVector(
    (state.lookYaw + (gait + Math.cos(jitterAngle) * jitterScale) * speed * MOVE_YAW_PER_SPEED) * variance,
    (state.lookPitch + (pitchArch + Math.sin(jitterAngle) * jitterScale) * speed * MOVE_PITCH_PER_SPEED) * variance,
    wobbleLimitRadians,
  );
  const recoilYaw = bounded(state.recoilYaw);
  const pitchLimit = Math.sqrt(Math.max(0, MAX_OFFSET ** 2 - recoilYaw ** 2));
  const boundedRecoilPitch = Math.max(-pitchLimit, Math.min(pitchLimit, state.recoilPitch));
  const excessPitch = state.recoilPitch - boundedRecoilPitch;
  let viewPitchShift = 0;
  if (state.recoilPitch > 0) {
    viewPitchShift = Math.min(state.recoilPitch, Math.max(0, excessPitch));
  } else if (state.recoilPitch < 0) {
    viewPitchShift = Math.max(state.recoilPitch, Math.min(0, excessPitch));
  }
  return {
    frame: Object.freeze({
      yaw: recoilYaw + wobble.yaw,
      pitch: Math.max(-pitchLimit, Math.min(pitchLimit, state.recoilPitch - viewPitchShift)) + wobble.pitch,
    }),
    viewPitchShift,
  };
};

const initialAimState = (): AimState => ({
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
    Math.abs(state.lookYaw) > MAX_OFFSET * 8 ||
    Math.abs(state.lookPitch) > MAX_OFFSET * 8 ||
    Math.abs(state.recoilYaw) > MAX_OFFSET * 8 ||
    Math.abs(state.recoilPitch) > MAX_OFFSET * 8 ||
    Math.hypot(state.frame.yaw, state.frame.pitch) > Math.PI
  ) {
    throw new Error('Invalid aim state');
  }
};

/** Mutable state owner; all time and input arrive on the fixed simulation step. */
export class AimController {
  private readonly state: AimState;
  private variance: number;
  private speed = 0;
  private readonly wobbleLimitRadians: number;
  private readonly wobbleShape: AimWobbleShape;
  private readonly jitterSeed: number;
  private stridePhase = 0;
  private stepIndex = 0;
  private viewPitchShift = 0;

  constructor(
    wobbleLimitRadians: number,
    wobbleShape: AimWobbleShape,
    jitterSeed: number,
    state: AimState = initialAimState(),
    variance = 1,
    stridePhase = 0,
    stepIndex = 0,
  ) {
    assertAimState(state);
    if (!(Number.isFinite(variance) && variance > 0)) {
      throw new Error('Invalid aim variance');
    }
    if (!(Number.isFinite(wobbleLimitRadians) && wobbleLimitRadians > 0)) {
      throw new Error('Invalid aim wobble limit');
    }
    if (
      !wobbleShape ||
      !(Number.isFinite(wobbleShape.archPower) && wobbleShape.archPower > 0) ||
      !(Number.isFinite(wobbleShape.phaseOffsetRadians) && Math.abs(wobbleShape.phaseOffsetRadians) < 0.5) ||
      !(Number.isFinite(wobbleShape.jitterShare) && wobbleShape.jitterShare >= 0 && wobbleShape.jitterShare <= 1) ||
      !(Number.isFinite(wobbleShape.jitterAmplitudeFraction) && wobbleShape.jitterAmplitudeFraction > 0) ||
      !(Number.isSafeInteger(jitterSeed) && jitterSeed >= 0 && jitterSeed <= 0xff_ff_ff_ff) ||
      !(Number.isFinite(stridePhase) && stridePhase >= 0 && stridePhase < 1) ||
      !(Number.isSafeInteger(stepIndex) && stepIndex >= 0)
    ) {
      throw new Error('Invalid aim wobble shape or stride phase');
    }
    this.wobbleShape = { ...wobbleShape };
    this.jitterSeed = jitterSeed;
    this.stridePhase = stridePhase;
    this.stepIndex = stepIndex;
    this.state = structuredClone(state);
    this.state.frame = Object.freeze({ ...this.state.frame });
    this.variance = variance;
    this.wobbleLimitRadians = wobbleLimitRadians;
  }

  get frame(): AimFrame {
    return this.state.frame;
  }

  get pendingViewPitchShift(): number {
    return this.viewPitchShift;
  }

  /** Discard unaccepted overflow and rebase look sampling for the accepted camera shift. */
  applyViewPitchShift(requested: number, applied: number): void {
    if (
      !(Number.isFinite(requested) && Number.isFinite(applied)) ||
      Math.abs(requested - this.viewPitchShift) > 1e-9 ||
      Math.abs(applied) > Math.abs(requested) + 1e-9 ||
      (applied !== 0 && Math.sign(applied) !== Math.sign(requested))
    ) {
      throw new Error('Invalid aim view-pitch shift');
    }
    this.state.recoilPitch -= requested;
    this.state.lastPitch += applied;
    this.recomputeFrame();
  }

  private recomputeFrame(): void {
    const result = frameFromState(
      this.state,
      this.speed,
      this.variance,
      this.wobbleLimitRadians,
      this.wobbleShape,
      this.jitterSeed,
      this.stridePhase,
      this.stepIndex,
    );
    this.state.frame = result.frame;
    this.viewPitchShift = result.viewPitchShift;
  }

  snapshotState(): Readonly<AimState> {
    return Object.freeze({ ...this.state });
  }

  advance({
    dt,
    velocity,
    blockSize,
    yaw,
    pitch,
    variance,
    firing,
    recoilRecoveryRate,
    stridePhase,
    stepIndex,
  }: AimStep): AimFrame {
    if (
      !(
        Number.isFinite(dt) &&
        dt > 0 &&
        Number.isFinite(blockSize) &&
        blockSize > 0 &&
        Number.isFinite(variance) &&
        variance > 0 &&
        velocity.every(Number.isFinite) &&
        [yaw, pitch, recoilRecoveryRate, stridePhase].every(Number.isFinite) &&
        stridePhase >= 0 &&
        stridePhase < 1 &&
        Number.isSafeInteger(stepIndex) &&
        stepIndex >= 0 &&
        typeof firing === 'boolean' &&
        recoilRecoveryRate > 0
      )
    ) {
      throw new Error('Invalid aim step');
    }
    const { state } = this;
    const speed = Math.hypot(velocity[0], velocity[2]) * blockSize;
    this.variance = variance;
    this.speed = speed;
    this.stridePhase = stridePhase;
    this.stepIndex = stepIndex;

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
    const recoilDecay = firing ? 1 : Math.exp((-dt * recoilRecoveryRate) / RECOIL_RECOVERY_SECONDS);
    state.lookYaw *= lookDecay;
    state.lookPitch *= lookDecay;
    state.recoilYaw *= recoilDecay;
    state.recoilPitch *= recoilDecay;

    this.recomputeFrame();
    return state.frame;
  }

  /** A committed shot applies its firearm's kick; the seed makes direction deterministic. */
  recordShot(seed: number, recoilKickRadians: number, recoilKickScale = 1): void {
    if (
      !Number.isSafeInteger(seed) ||
      seed < 0 ||
      seed > 0xff_ff_ff_ff ||
      !Number.isFinite(recoilKickRadians) ||
      recoilKickRadians <= 0 ||
      !Number.isFinite(recoilKickScale) ||
      recoilKickScale <= 0
    ) {
      throw new Error('Invalid aim recoil input');
    }
    const sign = (seed & 1) === 0 ? -1 : 1;
    const previousYaw = this.state.recoilYaw;
    const previousPitch = this.state.recoilPitch;
    const yawFactor = 0.5 + ((seed >>> 1) & 0xff) / 510;
    const kick = recoilKickRadians * recoilKickScale;
    this.state.recoilYaw = bounded(previousYaw + sign * kick * yawFactor);
    this.state.recoilPitch = previousPitch + kick;
    this.recomputeFrame();
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
