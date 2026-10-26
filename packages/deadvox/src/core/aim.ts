import type { Vec3 } from './coords.ts';
import { Rng, type RngState } from './random.ts';
import type { PlayerDef } from './schema.ts';

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
  /** Absent means no hold is asked for. */
  readonly breath?: BreathHoldStep | undefined;
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

export interface AimWobbleNoiseState {
  readonly yaw: AimWobbleNoiseAxisState;
  readonly pitch: AimWobbleNoiseAxisState;
  readonly rng: RngState;
}

/** Held breath and the recovery after it gives out (`DESIGN.md`, "Holding breath"). */
export interface BreathHoldState {
  readonly held: boolean;
  readonly recoveryRemainingSimSeconds: number;
}

export const INITIAL_BREATH_HOLD: BreathHoldState = Object.freeze({ held: false, recoveryRemainingSimSeconds: 0 });

export interface BreathHoldTuning {
  readonly staminaPerSimSecond: number;
  readonly recoverySimSeconds: number;
  /** Drift multiplier during recovery; above 1. */
  readonly recoverySwayScale: number;
  /** Share of drift a hold removes at skill zero without pain. */
  readonly steadyingMinimum: number;
  readonly steadyingSkillRange: number;
  readonly steadyingSkillHalfLifeLevels: number;
  /** Share of steadying lost per unit of felt-pain ratio. */
  readonly painWeakeningPerRatio: number;
}

/** One step's breath input: whether the player asks to hold, and the stamina the winded line gates. */
export interface BreathHoldStep {
  readonly wanted: boolean;
  readonly stamina: number;
  readonly windedBelow: number;
  /** Share of drift removed while held, from `breathSteadying`. */
  readonly steadying: number;
}

export type BreathCue = 'inhale' | 'exhale' | 'gasp';

/**
 * Recovery counts down first, so a hold may start on the step it ends. A held breath gives out at the winded line
 * before release is considered, and giving out starts the recovery that refuses a new hold.
 */
export const advanceBreathHold = (
  state: BreathHoldState,
  dt: number,
  step: Pick<BreathHoldStep, 'wanted' | 'stamina' | 'windedBelow'> | undefined,
  recoverySimSeconds: number,
): { readonly state: BreathHoldState; readonly cue?: BreathCue } => {
  const recoveryRemainingSimSeconds = Math.max(0, state.recoveryRemainingSimSeconds - dt);
  const wanted = step?.wanted ?? false;
  if (state.held) {
    if (step !== undefined && step.stamina <= step.windedBelow) {
      return { state: { held: false, recoveryRemainingSimSeconds: recoverySimSeconds }, cue: 'gasp' };
    }
    return wanted
      ? { state: { held: true, recoveryRemainingSimSeconds } }
      : { state: { held: false, recoveryRemainingSimSeconds }, cue: 'exhale' };
  }
  if (step?.wanted && recoveryRemainingSimSeconds <= 0 && step.stamina >= step.windedBelow) {
    return { state: { held: true, recoveryRemainingSimSeconds }, cue: 'inhale' };
  }
  return { state: { held: false, recoveryRemainingSimSeconds } };
};

/** Firearms skill strengthens the hold and felt pain weakens it; the result is the share of drift removed. */
export const breathSteadying = (effectLevel: number, painRatio: number, tuning: BreathHoldTuning): number => {
  const skilled =
    tuning.steadyingMinimum +
    tuning.steadyingSkillRange * (effectLevel / (effectLevel + tuning.steadyingSkillHalfLifeLevels));
  return Math.max(0, Math.min(1, skilled * (1 - tuning.painWeakeningPerRatio * Math.max(0, painRatio))));
};

export const assertBreathHoldState = (state: BreathHoldState): void => {
  if (
    typeof state?.held !== 'boolean' ||
    !(Number.isFinite(state.recoveryRemainingSimSeconds) && state.recoveryRemainingSimSeconds >= 0) ||
    (state.held && state.recoveryRemainingSimSeconds > 0)
  ) {
    throw new Error('Invalid breath hold state');
  }
};

export interface AimSnapshotState extends AimState {
  readonly wobbleNoise: AimWobbleNoiseState;
  readonly breath: BreathHoldState;
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

export const assertAimWobbleNoiseState = (state: AimWobbleNoiseState): void => {
  const validAxis = (axis: AimWobbleNoiseAxisState): boolean =>
    Boolean(axis) && Number.isFinite(axis.raw) && Number.isFinite(axis.smooth);
  if (
    !(state && validAxis(state.yaw) && validAxis(state.pitch) && Array.isArray(state.rng)) ||
    state.rng.length !== 4 ||
    state.rng.some((word) => !Number.isInteger(word) || word < -0x80_00_00_00 || word > 0x7f_ff_ff_ff)
  ) {
    throw new Error('Invalid aim wobble noise state');
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

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const bounded = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

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

type AimTuning = PlayerDef['aim'];

// Keep gait/look wobble separate so its larger content bound cannot enlarge recoil's view-pitch limit.
interface FrameFromStateOptions {
  readonly tuning: AimTuning;
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
  tuning,
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
    (state.lookYaw + gait * speed * tuning.moveYawPerSpeed) * variance +
      wobbleNoise.yaw * variance * wobbleNoiseStrengthScale,
    (state.lookPitch + pitchArch * speed * tuning.moveYawPerSpeed * shape.verticalToHorizontalRatio) * variance +
      wobbleNoise.pitch * variance * wobbleNoiseStrengthScale,
    wobbleLimitRadians,
  );
  const recoilYaw = bounded(state.recoilYaw, tuning.maxOffsetRadians);
  const pitchLimit = Math.sqrt(Math.max(0, tuning.maxOffsetRadians ** 2 - recoilYaw ** 2));
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
  Number.isFinite(shape.phaseOffsetRadians) &&
  shape.phaseOffsetRadians >= 0 &&
  shape.phaseOffsetRadians <= 0.45;

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
    Math.abs(state.lookYaw) > Math.PI / 2 ||
    Math.abs(state.lookPitch) > Math.PI / 2 ||
    Math.hypot(state.frame.yaw, state.frame.pitch) > Math.PI
  ) {
    throw new Error('Invalid aim state');
  }
};

/** Mutable state owner; all time and input arrive on the fixed simulation step. */
interface AimControllerOptions {
  readonly tuning: AimTuning;
  readonly wobbleLimitRadians: number;
  readonly wobbleShape: AimWobbleShape;
  readonly wobbleSeed: number;
  readonly state?: AimState;
  readonly variance?: number;
  readonly stridePhase?: number;
  readonly wobbleNoise: AimWobbleNoiseTuning;
  readonly wobbleNoiseStrengthScale?: number;
  readonly wobbleNoiseState?: AimWobbleNoiseState;
  readonly breathHold: Pick<BreathHoldTuning, 'recoverySimSeconds' | 'recoverySwayScale'>;
  readonly breathHoldState?: BreathHoldState;
}

export class AimController {
  private readonly tuning: AimTuning;
  private readonly state: AimState;
  private variance: number;
  private speed = 0;
  private readonly wobbleLimitRadians: number;
  private readonly wobbleShape: AimWobbleShape;
  private readonly wobbleNoise: AimWobbleNoiseTuning;
  private readonly wobbleNoiseStrengthScale: number;
  private readonly wobbleNoiseRng: Rng;
  private wobbleNoiseYaw: AimWobbleNoiseAxisState;
  private wobbleNoisePitch: AimWobbleNoiseAxisState;
  private stridePhase = 0;
  private viewPitchShift = 0;
  private readonly breathHold: Pick<BreathHoldTuning, 'recoverySimSeconds' | 'recoverySwayScale'>;
  private breath: BreathHoldState;
  private breathSteadying = 0;
  private lastBreathCue: BreathCue | undefined;

  constructor({
    tuning,
    wobbleLimitRadians,
    wobbleShape,
    wobbleSeed,
    state = initialAimState(),
    variance = 1,
    stridePhase = 0,
    wobbleNoise,
    wobbleNoiseStrengthScale = 1,
    wobbleNoiseState,
    breathHold,
    breathHoldState = INITIAL_BREATH_HOLD,
  }: AimControllerOptions) {
    assertAimState(state);
    assertBreathHoldState(breathHoldState);
    if (
      !(
        Number.isFinite(breathHold.recoverySimSeconds) &&
        breathHold.recoverySimSeconds >= 0 &&
        Number.isFinite(breathHold.recoverySwayScale) &&
        breathHold.recoverySwayScale >= 1
      )
    ) {
      throw new Error('Invalid breath hold tuning');
    }
    this.breathHold = { ...breathHold };
    this.breath = { ...breathHoldState };
    this.tuning = { ...tuning };
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
    const initialWobbleRng = Rng.stream(wobbleSeed, 'aim-wobble-ou');
    const savedWobbleState =
      wobbleNoiseState ??
      ({
        yaw: { raw: 0, smooth: 0 },
        pitch: { raw: 0, smooth: 0 },
        rng: initialWobbleRng.state(),
      } satisfies AimWobbleNoiseState);
    assertAimWobbleNoiseState(savedWobbleState);
    this.wobbleNoiseRng = new Rng(savedWobbleState.rng);
    this.wobbleNoiseYaw = { ...savedWobbleState.yaw };
    this.wobbleNoisePitch = { ...savedWobbleState.pitch };
    this.stridePhase = stridePhase;
    this.state = {
      lookYaw: state.lookYaw,
      lookPitch: state.lookPitch,
      recoilYaw: state.recoilYaw,
      recoilPitch: state.recoilPitch,
      lastYaw: state.lastYaw,
      lastPitch: state.lastPitch,
      hasLookSample: state.hasLookSample,
      frame: Object.freeze({ ...state.frame }),
    };
    this.variance = variance;
    this.wobbleLimitRadians = wobbleLimitRadians;
  }

  get frame(): AimFrame {
    return this.state.frame;
  }

  get pendingViewPitchShift(): number {
    return this.viewPitchShift;
  }

  get breathHeld(): boolean {
    return this.breath.held;
  }

  /** The breath sound the last step started, if any; presentation only. */
  get breathCue(): BreathCue | undefined {
    return this.lastBreathCue;
  }

  /** Holding breath damps only the drift; recovery after giving out makes it worse. */
  private breathDriftScale(): number {
    if (this.breath.held) {
      return 1 - this.breathSteadying;
    }
    return this.breath.recoveryRemainingSimSeconds > 0 ? this.breathHold.recoverySwayScale : 1;
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
      tuning: this.tuning,
      state: this.state,
      speed: this.speed,
      variance: this.variance,
      wobbleLimitRadians: this.wobbleLimitRadians,
      shape: this.wobbleShape,
      stridePhase: this.stridePhase,
      wobbleNoise: { yaw: this.wobbleNoiseYaw.smooth, pitch: this.wobbleNoisePitch.smooth },
      wobbleNoiseStrengthScale: this.wobbleNoiseStrengthScale * this.breathDriftScale(),
    });
    this.state.frame = result.frame;
    this.viewPitchShift = result.viewPitchShift;
  }

  snapshotState(): Readonly<AimSnapshotState> {
    return Object.freeze({
      ...this.state,
      wobbleNoise: Object.freeze({
        yaw: Object.freeze({ ...this.wobbleNoiseYaw }),
        pitch: Object.freeze({ ...this.wobbleNoisePitch }),
        rng: Object.freeze([...this.wobbleNoiseRng.state()]) as unknown as RngState,
      }),
      breath: Object.freeze({ ...this.breath }),
    });
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
    breath,
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
    if (
      breath !== undefined &&
      !(
        typeof breath.wanted === 'boolean' &&
        [breath.stamina, breath.windedBelow].every(Number.isFinite) &&
        Number.isFinite(breath.steadying) &&
        breath.steadying >= 0 &&
        breath.steadying <= 1
      )
    ) {
      throw new Error('Invalid breath step');
    }
    const breathStep = advanceBreathHold(this.breath, dt, breath, this.breathHold.recoverySimSeconds);
    this.breath = breathStep.state;
    this.lastBreathCue = breathStep.cue;
    this.breathSteadying = breath?.steadying ?? 0;
    const { state } = this;
    const speed = Math.hypot(velocity[0], velocity[2]) * blockSize;
    this.variance = variance;
    this.speed = speed;
    this.stridePhase = stridePhase;

    if (state.hasLookSample) {
      const yawRate = wrapAngle(yaw - state.lastYaw) / dt;
      const pitchRate = (pitch - state.lastPitch) / dt;
      state.lookYaw = bounded(
        state.lookYaw - yawRate * this.tuning.lookLagPerRadian * dt,
        this.tuning.maxOffsetRadians,
      );
      state.lookPitch = bounded(
        state.lookPitch - pitchRate * this.tuning.lookLagPerRadian * dt,
        this.tuning.maxOffsetRadians,
      );
    }
    state.lastYaw = yaw;
    state.lastPitch = pitch;
    state.hasLookSample = true;

    const lookDecay = Math.exp(-dt / this.tuning.lookSettleSimSeconds);
    const recoilDecay = firing ? 1 : Math.exp((-dt * recoilRecoveryRate) / this.tuning.recoilRecoverySimSeconds);
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
    this.state.recoilYaw = bounded(previousYaw + sign * kick * yawFactor, this.tuning.maxOffsetRadians);
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
