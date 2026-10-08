import type { Vec3 } from './coords.ts';
import { Rng } from './random.ts';

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
}

export interface AimWobbleShape {
  readonly verticalToHorizontalRatio: number;
  readonly archPower: number;
  readonly phaseOffsetRadians: number;
}

export interface AimWobbleNoiseTuning {
  readonly reversionRatePerSimSecond: number;
  readonly sigmaRadiansPerSqrtSecond: number;
  readonly smoothingSimSeconds: number;
}

export interface AimWobbleNoiseAxisState {
  readonly raw: number;
  readonly smooth: number;
}

const assertWobbleNoiseOptions = (tuning: AimWobbleNoiseTuning, strengthScale: number): void => {
  if (
    !(
      Number.isFinite(tuning.reversionRatePerSimSecond) &&
      tuning.reversionRatePerSimSecond > 0 &&
      Number.isFinite(tuning.sigmaRadiansPerSqrtSecond) &&
      tuning.sigmaRadiansPerSqrtSecond >= 0 &&
      Number.isFinite(tuning.smoothingSimSeconds) &&
      tuning.smoothingSimSeconds > 0
    )
  ) {
    throw new Error('Invalid aim wobble noise tuning');
  }
  if (!(Number.isFinite(strengthScale) && strengthScale >= 0)) {
    throw new Error('Invalid aim wobble noise strength scale');
  }
};

export const advanceOrnsteinUhlenbeckAxis = (
  state: AimWobbleNoiseAxisState,
  dt: number,
  tuning: AimWobbleNoiseTuning,
  normalSample: number,
): AimWobbleNoiseAxisState => {
  if (
    !(
      Number.isFinite(state.raw) &&
      Number.isFinite(state.smooth) &&
      Number.isFinite(dt) &&
      dt > 0 &&
      Number.isFinite(tuning.reversionRatePerSimSecond) &&
      tuning.reversionRatePerSimSecond > 0 &&
      Number.isFinite(tuning.sigmaRadiansPerSqrtSecond) &&
      tuning.sigmaRadiansPerSqrtSecond >= 0 &&
      Number.isFinite(tuning.smoothingSimSeconds) &&
      tuning.smoothingSimSeconds > 0 &&
      Number.isFinite(normalSample)
    )
  ) {
    throw new Error('Invalid aim wobble noise step');
  }
  const boundedSample = Math.max(-3, Math.min(3, normalSample));
  const raw =
    state.raw -
    tuning.reversionRatePerSimSecond * state.raw * dt +
    tuning.sigmaRadiansPerSqrtSecond * Math.sqrt(dt) * boundedSample;
  const smoothing = 1 - Math.exp(-dt / tuning.smoothingSimSeconds);
  return { raw, smooth: state.smooth + smoothing * (raw - state.smooth) };
};

const TAU = Math.PI * 2;
const MOVE_YAW_PER_SPEED = 0.0045;
const LOOK_LAG_PER_RADIAN = 0.035;
const LOOK_SETTLE_SECONDS = 0.22;
const RECOIL_RECOVERY_SECONDS = 0.34;
const MAX_OFFSET = 0.12;

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const bounded = (value: number): number => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, value));

const boundedNormalPair = (rng: Rng): readonly [number, number] => {
  const radius = Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, rng.next())));
  const angle = TAU * rng.next();
  return [Math.max(-3, Math.min(3, radius * Math.cos(angle))), Math.max(-3, Math.min(3, radius * Math.sin(angle)))];
};

const boundVector = (yaw: number, pitch: number, limit: number): AimFrame => {
  const magnitude = Math.hypot(yaw, pitch);
  const scale = magnitude > limit ? limit / magnitude : 1;
  return { yaw: yaw * scale, pitch: pitch * scale };
};

// Keep gait/look wobble separate so its larger content bound cannot enlarge recoil's view-pitch limit.
interface FrameFromStateOptions {
  readonly state: AimState;
  readonly speed: number;
  readonly variance: number;
  readonly wobbleLimitRadians: number;
  readonly shape: AimWobbleShape;
  readonly stridePhase: number;
  readonly wobbleNoise: { readonly yaw: number; readonly pitch: number };
  readonly wobbleNoiseStrengthScale: number;
}

const frameFromState = ({
  state,
  speed,
  variance,
  wobbleLimitRadians,
  shape,
  stridePhase,
  wobbleNoise,
  wobbleNoiseStrengthScale,
}: FrameFromStateOptions): { frame: AimFrame; viewPitchShift: number } => {
  const phase = stridePhase * TAU;
  const gait = Math.sin(phase);
  const archPhase = phase + shape.phaseOffsetRadians * Math.sin(2 * phase) ** 2;
  const pitchArch = 1 - 2 * Math.abs(Math.sin(archPhase)) ** shape.archPower;
  const wobble = boundVector(
    (state.lookYaw + gait * speed * MOVE_YAW_PER_SPEED) * variance + wobbleNoise.yaw * variance * wobbleNoiseStrengthScale,
    (state.lookPitch + pitchArch * speed * MOVE_YAW_PER_SPEED * shape.verticalToHorizontalRatio) * variance +
      wobbleNoise.pitch * variance * wobbleNoiseStrengthScale,
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

const isValidWobbleShape = (shape: AimWobbleShape): boolean =>
  Number.isFinite(shape.verticalToHorizontalRatio) &&
  shape.verticalToHorizontalRatio >= 0 &&
  shape.verticalToHorizontalRatio <= 1 &&
  Number.isFinite(shape.archPower) &&
  shape.archPower > 0 &&
  Number.isFinite(shape.phaseOffsetRadians) && shape.phaseOffsetRadians >= 0 && shape.phaseOffsetRadians <= 0.45;

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
interface AimControllerOptions {
  readonly wobbleLimitRadians: number;
  readonly wobbleShape: AimWobbleShape;
  readonly wobbleSeed: number;
  readonly state?: AimState;
  readonly variance?: number;
  readonly stridePhase?: number;
  readonly wobbleNoise: AimWobbleNoiseTuning;
  readonly wobbleNoiseStrengthScale?: number;
}

export class AimController {
  private readonly state: AimState;
  private variance: number;
  private speed = 0;
  private readonly wobbleLimitRadians: number;
  private readonly wobbleShape: AimWobbleShape;
  private readonly wobbleNoise: AimWobbleNoiseTuning;
  private readonly wobbleNoiseStrengthScale: number;
  private readonly wobbleNoiseRng: Rng;
  private wobbleNoiseYaw: AimWobbleNoiseAxisState = { raw: 0, smooth: 0 };
  private wobbleNoisePitch: AimWobbleNoiseAxisState = { raw: 0, smooth: 0 };
  private stridePhase = 0;
  private viewPitchShift = 0;

  constructor({
    wobbleLimitRadians,
    wobbleShape,
    wobbleSeed,
    state = initialAimState(),
    variance = 1,
    stridePhase = 0,
    wobbleNoise,
    wobbleNoiseStrengthScale = 1,
  }: AimControllerOptions) {
    assertAimState(state);
    if (!(Number.isFinite(variance) && variance > 0)) {
      throw new Error('Invalid aim variance');
    }
    if (!(Number.isFinite(wobbleLimitRadians) && wobbleLimitRadians > 0)) {
      throw new Error('Invalid aim wobble limit');
    }
    if (!wobbleShape) {
      throw new Error('Invalid aim wobble shape or stride phase');
    }
    if (!isValidWobbleShape(wobbleShape)) {
      throw new Error('Invalid aim wobble shape or stride phase');
    }
    if (!Number.isSafeInteger(wobbleSeed) || wobbleSeed < 0 || wobbleSeed > 0xff_ff_ff_ff) {
      throw new Error('Invalid aim wobble seed');
    }
    if (!Number.isFinite(stridePhase) || stridePhase < 0 || stridePhase >= 1) {
      throw new Error('Invalid aim stride phase');
    }
    assertWobbleNoiseOptions(wobbleNoise, wobbleNoiseStrengthScale);
    this.wobbleShape = { ...wobbleShape };
    this.wobbleNoise = { ...wobbleNoise };
    this.wobbleNoiseStrengthScale = wobbleNoiseStrengthScale;
    this.wobbleNoiseRng = Rng.stream(wobbleSeed, 'aim-wobble-ou');
    this.stridePhase = stridePhase;
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

  private advanceWobbleNoise(dt: number): void {
    const [yawSample, pitchSample] = boundedNormalPair(this.wobbleNoiseRng);
    this.wobbleNoiseYaw = advanceOrnsteinUhlenbeckAxis(this.wobbleNoiseYaw, dt, this.wobbleNoise, yawSample);
    this.wobbleNoisePitch = advanceOrnsteinUhlenbeckAxis(this.wobbleNoisePitch, dt, this.wobbleNoise, pitchSample);
  }

  private recomputeFrame(): void {
    const result = frameFromState({
      state: this.state,
      speed: this.speed,
      variance: this.variance,
      wobbleLimitRadians: this.wobbleLimitRadians,
      shape: this.wobbleShape,
      stridePhase: this.stridePhase,
      wobbleNoise: { yaw: this.wobbleNoiseYaw.smooth, pitch: this.wobbleNoisePitch.smooth },
      wobbleNoiseStrengthScale: this.wobbleNoiseStrengthScale,
    });
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

    this.advanceWobbleNoise(dt);
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
