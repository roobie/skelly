import { Euler, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { AimController, aimBasis, aimDirection, NEUTRAL_AIM } from '../src/core/aim.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { type FirearmsSkillShotKind, firearmStanceEffects, firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import { advanceFootsteps, initialFootstepClock, STEP_DISTANCE_METRES } from '../src/core/footsteps.ts';
import { Rng } from '../src/core/random.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { PLAYER } from '../src/game/player.ts';

const stanceTuning = BUNDLED_CONTENT.registry.skills.get('firearms_combat')!.combat!.firearms!;
const pumpHandling = BUNDLED_CONTENT.registry.items.get('pump_shotgun')!.firearm!.skillZeroHandling!;
const pumpTuning = { ...stanceTuning, skillZeroHandling: pumpHandling };
const skillEffects = (level: number, kind: FirearmsSkillShotKind = 'singleShot') =>
  firearmsSkillEffects(level, stanceTuning, kind);
const pumpSkillEffects = (level: number) => firearmsSkillEffects(level, pumpTuning);
const createAim = (
  variance = 1,
  wobbleLimitRadians = stanceTuning.wobbleLimitRadians,
  jitterShare = stanceTuning.wobbleJitterShare,
  verticalToHorizontalRatio = stanceTuning.wobbleVerticalToHorizontalRatio,
) =>
  new AimController({
    wobbleLimitRadians,
    wobbleShape: {
      verticalToHorizontalRatio,
      archPower: stanceTuning.wobbleLuneArchPower,
      phaseOffsetRadians: stanceTuning.wobbleLunePhaseOffsetRadians,
      jitterShare,
      jitterAmplitudeFraction: stanceTuning.wobbleJitterAmplitudeFraction,
    },
    jitterSeed: Rng.stream(73, 'aim-controller-tests').int(0, 0xff_ff_ff_ff),
    variance,
  });

type AimStepOverrides = Partial<Parameters<AimController['advance']>[0]> & { stridePhase?: number };

const step = (overrides: AimStepOverrides = {}) => ({
  dt: 1 / 60,
  velocity: [0, 0, 0] as [number, number, number],
  blockSize: 0.5,
  yaw: 0,
  pitch: 0,
  variance: 1,
  firing: false,
  recoilRecoveryRate: 1,
  stridePhase: 0,
  stepIndex: 0,
  ...overrides,
});

const burstPeak = (recoilKickRadians: number, variance: number, cadenceSeconds: number): number => {
  const aim = createAim(variance);
  const dt = 1 / 60;
  const burstSeconds = 2;
  let nextShotAt = 0;
  let seed = 0;
  let peak = 0;
  let viewPitch = 0;
  const applyViewShift = () => {
    const shift = aim.pendingViewPitchShift;
    aim.applyViewPitchShift(shift, shift);
    viewPitch += shift;
  };
  for (let tick = 0; tick <= burstSeconds / dt; tick++) {
    const time = tick * dt;
    if (tick > 0) {
      aim.advance(step({ dt, variance, firing: true }));
      applyViewShift();
    }
    while (nextShotAt <= time + 1e-9) {
      aim.recordShot(seed, recoilKickRadians);
      seed += 1;
      nextShotAt += cadenceSeconds;
      applyViewShift();
      peak = Math.max(peak, Math.abs(viewPitch + aim.frame.pitch));
    }
  }
  return peak;
};

it('uses camera pitch and yaw without presentation roll at neutral sway', () => {
  const pitch = 0.35;
  const yaw = 1.1;
  const aim = aimDirection(yaw, pitch, NEUTRAL_AIM);
  const expected = new Vector3(0, 0, -1).applyEuler(new Euler(pitch, yaw, 0, 'YXZ'));
  expect(aim[0]).toBeCloseTo(expected.x, 12);
  expect(aim[1]).toBeCloseTo(expected.y, 12);
  expect(aim[2]).toBeCloseTo(expected.z, 12);
});

it('actual movement and quick look turns increase isolated aim deviation', () => {
  const still = createAim();
  const moving = createAim();
  const stillFrame = still.advance(step());
  const movingFrame = moving.advance(step({ velocity: [2, 0, 0] }));
  expect(Math.hypot(movingFrame.yaw, movingFrame.pitch)).toBeGreaterThan(Math.hypot(stillFrame.yaw, stillFrame.pitch));

  const turning = createAim();
  const steady = createAim();
  turning.advance(step());
  steady.advance(step());
  const turnedFrame = turning.advance(step({ yaw: 0.6 }));
  const steadyFrame = steady.advance(step());
  expect(Math.abs(turnedFrame.yaw)).toBeGreaterThan(Math.abs(steadyFrame.yaw));
});

it('keeps quick-look lag symmetric across axes and independent of vertical flattening', () => {
  const contentRatio = stanceTuning.wobbleVerticalToHorizontalRatio;
  const alternateRatio = contentRatio < 0.5 ? contentRatio + (1 - contentRatio) / 2 : contentRatio / 2;
  const quickLook = 0.05;
  const response = (axis: 'yaw' | 'pitch', ratio: number) => {
    const aim = createAim(1, stanceTuning.wobbleLimitRadians, stanceTuning.wobbleJitterShare, ratio);
    aim.advance(step());
    return aim.advance(
      step({
        yaw: axis === 'yaw' ? quickLook : 0,
        pitch: axis === 'pitch' ? quickLook : 0,
      }),
    );
  };
  const yawAtContentRatio = response('yaw', contentRatio).yaw;
  const pitchAtContentRatio = response('pitch', contentRatio).pitch;
  const yawAtAlternateRatio = response('yaw', alternateRatio).yaw;
  const pitchAtAlternateRatio = response('pitch', alternateRatio).pitch;

  expect(Math.abs(yawAtContentRatio)).toBeGreaterThan(0);
  expect(Math.abs(pitchAtContentRatio)).toBeCloseTo(Math.abs(yawAtContentRatio), 8);
  expect(pitchAtAlternateRatio).toBeCloseTo(pitchAtContentRatio, 8);
  expect(yawAtAlternateRatio).toBeCloseTo(yawAtContentRatio, 8);
});

it('committed recoil recovers in simulation time and equal inputs stay deterministic', () => {
  const first = createAim();
  const second = createAim();
  first.recordShot(73, 0.02);
  second.recordShot(73, 0.02);
  const initial = first.advance(step());
  expect(second.advance(step())).toEqual(initial);
  let recovered = initial;
  for (let tick = 0; tick < 90; tick++) {
    recovered = first.advance(step());
    second.advance(step());
  }
  expect(second.frame).toEqual(recovered);
  expect(Math.hypot(recovered.yaw, recovered.pitch)).toBeLessThan(Math.hypot(initial.yaw, initial.pitch));
});

it('keeps held-fire recoil climbing while shifting over-limit pitch into the view', () => {
  const aim = createAim();
  const dt = 1 / 60;
  const cadence = 60 / 800;
  const burstSeconds = 2;
  let nextShotAt = 0;
  let seed = 1;
  let viewPitch = 0;
  let screenLimitMagnitude: number | undefined;
  const climb: number[] = [];
  const applyViewShift = () => {
    const shift = aim.pendingViewPitchShift;
    aim.applyViewPitchShift(shift, shift);
    viewPitch += shift;
  };
  for (let tick = 0; tick <= burstSeconds / dt; tick++) {
    const time = tick * dt;
    if (tick > 0) {
      const recoilBefore = aim.snapshotState().recoilPitch;
      aim.advance(step({ dt, pitch: viewPitch, firing: true }));
      expect(aim.snapshotState().recoilPitch).toBe(recoilBefore);
      applyViewShift();
    }
    while (nextShotAt <= time + 1e-9) {
      aim.recordShot(seed, 0.035);
      seed += 2;
      applyViewShift();
      climb.push(viewPitch + aim.frame.pitch);
      if (viewPitch > 0) {
        const magnitude = Math.hypot(aim.frame.yaw, aim.frame.pitch);
        screenLimitMagnitude ??= magnitude;
        expect(magnitude).toBeCloseTo(screenLimitMagnitude, 8);
      }
      nextShotAt += cadence;
    }
  }
  expect(climb.length).toBeGreaterThan(1);
  expect(climb.every((pitch, index) => index === 0 || pitch > climb[index - 1]!)).toBe(true);
  expect(viewPitch).toBeGreaterThan(0);

  const heldOffset = Math.hypot(aim.frame.yaw, aim.frame.pitch);
  const retainedViewPitch = viewPitch;
  for (let tick = 0; tick < 30; tick++) {
    aim.advance(step({ dt, pitch: viewPitch, firing: false }));
    applyViewShift();
  }
  expect(viewPitch).toBeCloseTo(retainedViewPitch, 8);
  expect(Math.hypot(aim.frame.yaw, aim.frame.pitch)).toBeLessThan(heldOffset);
});

it('keeps recoil view-shift and recovery independent of stronger gait wobble', () => {
  const recoilAfterMotion = (velocity: [number, number, number], variance: number) => {
    const aim = createAim(variance);
    aim.recordShot(1, 0.3);
    aim.advance(step({ velocity, variance, firing: true }));
    const shift = aim.pendingViewPitchShift;
    aim.applyViewPitchShift(shift, shift);
    aim.advance(step({ velocity, pitch: shift, variance, firing: false }));
    const recoil = aim.snapshotState();
    return { shift, recoilYaw: recoil.recoilYaw, recoilPitch: recoil.recoilPitch };
  };
  const neutral = recoilAfterMotion([0, 0, 0], 1);
  const moving = recoilAfterMotion(
    [0, 0, -(PLAYER.walk * firearmStanceEffects(0, stanceTuning).readyMovementFactor) / step().blockSize],
    pumpSkillEffects(0).variance,
  );
  expect(moving.shift).toBeCloseTo(neutral.shift, 8);
  expect(moving.recoilYaw).toBeCloseTo(neutral.recoilYaw, 8);
  expect(moving.recoilPitch).toBeCloseTo(neutral.recoilPitch, 8);
});

it('hands pitch beyond the aim-frame boundary to the view without losing it', () => {
  const aim = createAim();
  aim.recordShot(1, 0.3);
  const before = aim.frame;
  const rawPitch = aim.snapshotState().recoilPitch;
  aim.advance(step({ firing: true }));
  const shift = aim.pendingViewPitchShift;
  expect(shift).toBeGreaterThan(0);
  aim.applyViewPitchShift(shift, shift);
  expect(Math.hypot(aim.frame.yaw, aim.frame.pitch)).toBeCloseTo(Math.hypot(before.yaw, before.pitch), 8);
  expect(shift + aim.frame.pitch).toBeCloseTo(rawPitch, 8);
  expect(aim.snapshotState().recoilPitch).toBeLessThan(rawPitch);
});

it('composes the camera-local aim basis like the held firearm at non-zero pitch', () => {
  const frame = { yaw: 0.08, pitch: -0.04 };
  const yaw = 0.3;
  const pitch = 0.6;
  const basis = aimBasis(yaw, pitch, frame);
  const camera = new Euler(pitch, yaw, 0, 'YXZ');
  const aim = new Euler(frame.pitch, frame.yaw, 0, 'YXZ');
  const compare = (actual: readonly number[], local: [number, number, number]) => {
    const expected = new Vector3(...local).applyEuler(aim).applyEuler(camera);
    expect(actual[0]).toBeCloseTo(expected.x, 6);
    expect(actual[1]).toBeCloseTo(expected.y, 6);
    expect(actual[2]).toBeCloseTo(expected.z, 6);
  };
  compare(aimDirection(yaw, pitch, frame), [0, 0, -1]);
  compare(basis.right, [1, 0, 0]);
  compare(basis.up, [0, 1, 0]);
  expect(basis.right.reduce((sum, value, index) => sum + value * basis.up[index]!, 0)).toBeCloseTo(0, 6);
  expect(basis.forward.reduce((sum, value, index) => sum + value * basis.up[index]!, 0)).toBeCloseTo(0, 6);
});

it('skill-zero handling is worse for automatic follow-ups than single shots, and both improve by expert', () => {
  const single = skillEffects(0, 'singleShot');
  const followup = skillEffects(0, 'automaticFollowup');
  const expert = skillEffects(SKILL_LEVEL_MAX, 'singleShot');
  expect(followup.variance).toBeGreaterThan(single.variance);
  expect(followup.recoilKickScale).toBeGreaterThan(single.recoilKickScale);
  expect(followup.recoilRecoveryRate).toBeLessThan(single.recoilRecoveryRate);
  expect(single.variance).toBeGreaterThan(expert.variance);
  expect(single.recoilKickScale).toBeGreaterThan(expert.recoilKickScale);
  expect(single.recoilRecoveryRate).toBeLessThan(expert.recoilRecoveryRate);
});

it('skill-ten wobble uses its content endpoint independent of skill-zero handling', () => {
  const alternate = {
    ...stanceTuning,
    wobbleSkillTenVariance: stanceTuning.wobbleSkillTenVariance / 2,
    skillZeroHandling: {
      singleShot: { variance: 17, recoilKickScale: 23, recoilRecoveryScale: 0.07 },
      automaticFollowup: { variance: 31, recoilKickScale: 41, recoilRecoveryScale: 0.03 },
    },
  };
  expect(skillEffects(SKILL_LEVEL_MAX).variance).toBe(stanceTuning.wobbleSkillTenVariance);
  expect(firearmsSkillEffects(SKILL_LEVEL_MAX, alternate).variance).toBe(alternate.wobbleSkillTenVariance);
  expect(firearmsSkillEffects(SKILL_LEVEL_MAX, alternate).recoilKickScale).toBe(
    skillEffects(SKILL_LEVEL_MAX).recoilKickScale,
  );
  expect(skillEffects(SKILL_LEVEL_LEGENDARY)).toEqual(skillEffects(SKILL_LEVEL_MAX));
});

it('changing a content skill-zero value changes the matching skill effect', () => {
  const changed = {
    ...stanceTuning,
    skillZeroHandling: {
      ...stanceTuning.skillZeroHandling,
      automaticFollowup: {
        ...stanceTuning.skillZeroHandling.automaticFollowup,
        recoilKickScale: stanceTuning.skillZeroHandling.automaticFollowup.recoilKickScale * 1.5,
      },
    },
  };
  expect(firearmsSkillEffects(0, changed, 'automaticFollowup').recoilKickScale).toBeGreaterThan(
    skillEffects(0, 'automaticFollowup').recoilKickScale,
  );
});

it('skill-zero kick scale increases the immediate recoil from the same shot', () => {
  const novice = createAim();
  const expert = createAim();
  novice.recordShot(73, 0.02, skillEffects(0).recoilKickScale);
  expert.recordShot(73, 0.02, skillEffects(SKILL_LEVEL_MAX).recoilKickScale);
  expect(novice.snapshotState().recoilPitch).toBeGreaterThan(expert.snapshotState().recoilPitch);
  expect(Math.abs(novice.snapshotState().recoilYaw)).toBeGreaterThan(Math.abs(expert.snapshotState().recoilYaw));
});

it('expert recovery scale decays the same released recoil faster', () => {
  const novice = createAim();
  const expert = createAim();
  novice.recordShot(73, 0.02);
  expert.recordShot(73, 0.02);
  const noviceRecoveryScale = skillEffects(0).recoilRecoveryRate;
  const expertRecoveryScale = skillEffects(SKILL_LEVEL_MAX).recoilRecoveryRate;
  for (let tick = 0; tick < 20; tick++) {
    novice.advance(step({ recoilRecoveryRate: noviceRecoveryScale }));
    expert.advance(step({ recoilRecoveryRate: expertRecoveryScale }));
  }
  const noviceRecoil = novice.snapshotState();
  const expertRecoil = expert.snapshotState();
  expect(Math.hypot(expertRecoil.recoilYaw, expertRecoil.recoilPitch)).toBeLessThan(
    Math.hypot(noviceRecoil.recoilYaw, noviceRecoil.recoilPitch),
  );
});

const readiedWalkWobble = (level: number): number => {
  const effects = pumpSkillEffects(level);
  const speed = PLAYER.walk * firearmStanceEffects(0, stanceTuning).readyMovementFactor;
  const { blockSize } = step();
  const aim = createAim(effects.variance);
  let clock = initialFootstepClock();
  let peak = 0;
  for (let tick = 0; tick < 240; tick++) {
    ({ clock } = advanceFootsteps(clock, 'walking', speed / 60));
    const frame = aim.advance(
      step({
        velocity: [0, 0, -speed / blockSize],
        variance: effects.variance,
        stridePhase: clock.stridePhase,
        stepIndex: clock.stepIndex,
      }),
    );
    peak = Math.max(peak, Math.hypot(frame.yaw, frame.pitch));
  }
  return peak;
};

it('step-clock wobble forms an open, concave-down lune once per stride', () => {
  const speed = PLAYER.walk * firearmStanceEffects(0, stanceTuning).readyMovementFactor;
  const stepDistance = STEP_DISTANCE_METRES.walking;
  const sample = (distance: number) => {
    const { clock } = advanceFootsteps(initialFootstepClock(), 'walking', distance);
    return createAim(1, stanceTuning.wobbleLimitRadians, 0).advance(
      step({
        stridePhase: clock.stridePhase,
        stepIndex: clock.stepIndex,
        velocity: [0, 0, -speed / step().blockSize],
      }),
    );
  };
  const center = sample(stepDistance / 2);
  const rightSide = sample(stepDistance);
  const nextCenter = sample(stepDistance * 1.5);
  const leftSide = sample(stepDistance * 2);
  const fullStride = sample(stepDistance * 2.5);
  const outgoing = sample(stepDistance * 0.75);
  const returning = sample(stepDistance * 1.25);

  expect(center.pitch).toBeGreaterThan(rightSide.pitch);
  expect(nextCenter.pitch).toBeGreaterThan(leftSide.pitch);
  expect(center.pitch).toBeCloseTo(nextCenter.pitch, 8);
  expect(rightSide.pitch).toBeCloseTo(leftSide.pitch, 8);
  expect(center.yaw).toBeCloseTo(nextCenter.yaw, 8);
  expect(center.yaw).toBeCloseTo(fullStride.yaw, 8);
  expect(center.pitch).toBeCloseTo(fullStride.pitch, 8);
  expect(rightSide.yaw).toBeGreaterThan(center.yaw);
  expect(leftSide.yaw).toBeLessThan(center.yaw);
  expect(outgoing.yaw).toBeCloseTo(returning.yaw, 8);
  expect(outgoing.pitch).not.toBeCloseTo(returning.pitch, 8);
});

it('bounds aim changes at gait switches and airborne freezes by steady-walk motion', () => {
  const speed = PLAYER.walk * firearmStanceEffects(0, stanceTuning).readyMovementFactor;
  const travel = speed / 60;
  const { blockSize } = step();
  const aimStep = (stridePhase: number, stepIndex: number) =>
    step({ velocity: [0, 0, -speed / blockSize], stridePhase, stepIndex });
  const steadyAim = createAim(1, stanceTuning.wobbleLimitRadians, 0);
  let steadyClock = initialFootstepClock();
  let steadyFrame = NEUTRAL_AIM;
  let steadyWalkBound = 0;
  for (let tick = 0; tick < 480; tick++) {
    const next = advanceFootsteps(steadyClock, 'walking', travel);
    const frame = steadyAim.advance(aimStep(next.clock.stridePhase, next.clock.stepIndex));
    if (tick > 0) {
      steadyWalkBound = Math.max(
        steadyWalkBound,
        Math.hypot(frame.yaw - steadyFrame.yaw, frame.pitch - steadyFrame.pitch),
      );
    }
    steadyClock = next.clock;
    steadyFrame = frame;
  }

  const transitionAim = createAim(1, stanceTuning.wobbleLimitRadians, 0);
  let transitionClock = initialFootstepClock();
  let transitionFrame = NEUTRAL_AIM;
  for (let tick = 0; tick < 120; tick++) {
    const next = advanceFootsteps(transitionClock, 'walking', travel);
    transitionFrame = transitionAim.advance(aimStep(next.clock.stridePhase, next.clock.stepIndex));
    transitionClock = next.clock;
  }
  const jogging = advanceFootsteps(transitionClock, 'jogging', travel);
  const joggingFrame = transitionAim.advance(aimStep(jogging.clock.stridePhase, jogging.clock.stepIndex));
  const gaitChange = Math.hypot(joggingFrame.yaw - transitionFrame.yaw, joggingFrame.pitch - transitionFrame.pitch);
  const airborne = advanceFootsteps(jogging.clock, 'still', 0);
  const airborneFrame = transitionAim.advance(aimStep(airborne.clock.stridePhase, airborne.clock.stepIndex));
  const takeoff = Math.hypot(airborneFrame.yaw - joggingFrame.yaw, airborneFrame.pitch - joggingFrame.pitch);
  const landed = advanceFootsteps(airborne.clock, 'walking', travel);
  const landedFrame = transitionAim.advance(aimStep(landed.clock.stridePhase, landed.clock.stepIndex));
  const landing = Math.hypot(landedFrame.yaw - airborneFrame.yaw, landedFrame.pitch - airborneFrame.pitch);

  expect(steadyWalkBound).toBeGreaterThan(0);
  expect(gaitChange).toBeLessThanOrEqual(steadyWalkBound + 1e-10);
  expect(takeoff).toBeLessThanOrEqual(steadyWalkBound + 1e-10);
  expect(landing).toBeLessThanOrEqual(steadyWalkBound + 1e-10);
});

it('sets lune vertical extent as the content fraction of its horizontal extent', () => {
  const speed = PLAYER.walk * firearmStanceEffects(0, stanceTuning).readyMovementFactor;
  const { blockSize } = step();
  const aim = createAim(1, stanceTuning.wobbleLimitRadians, 0);
  const yaw: number[] = [];
  const pitch: number[] = [];
  for (let sample = 0; sample < 1024; sample++) {
    const frame = aim.advance(
      step({
        velocity: [0, 0, -speed / blockSize],
        stridePhase: sample / 1024,
      }),
    );
    yaw.push(frame.yaw);
    pitch.push(frame.pitch);
  }
  const horizontalExtent = Math.max(...yaw) - Math.min(...yaw);
  const verticalExtent = Math.max(...pitch) - Math.min(...pitch);

  expect(horizontalExtent).toBeGreaterThan(0);
  expect(verticalExtent / horizontalExtent).toBeCloseTo(stanceTuning.wobbleVerticalToHorizontalRatio, 2);
});

it('scales the vertical jitter with the lune without changing horizontal swing', () => {
  const ratio = stanceTuning.wobbleVerticalToHorizontalRatio;
  const flatterRatio = ratio / 2;
  const speed = PLAYER.walk * firearmStanceEffects(0, stanceTuning).readyMovementFactor;
  const { blockSize } = step();
  const authored = createAim(1, stanceTuning.wobbleLimitRadians, 1, ratio);
  const flatter = createAim(1, stanceTuning.wobbleLimitRadians, 1, flatterRatio);
  const plainLune = createAim(1, stanceTuning.wobbleLimitRadians, 0, ratio);
  let observedVerticalJitter = false;
  for (let sample = 0; sample < 128; sample++) {
    const stridePhase = sample / 128;
    const aimStep = step({
      velocity: [0, 0, -speed / blockSize],
      stridePhase,
      stepIndex: 1,
    });
    const authoredFrame = authored.advance(aimStep);
    const flatterFrame = flatter.advance(aimStep);
    const plainFrame = plainLune.advance(aimStep);
    expect(flatterFrame.yaw).toBeCloseTo(authoredFrame.yaw, 12);
    expect(flatterFrame.pitch).toBeCloseTo(authoredFrame.pitch * (flatterRatio / ratio), 10);
    observedVerticalJitter ||= Math.abs(authoredFrame.pitch - plainFrame.pitch) > 1e-10;
  }
  expect(observedVerticalJitter).toBe(true);
});

it('seeded jitter keeps the configured share of the walking path off the lune', () => {
  const speed = PLAYER.walk * firearmStanceEffects(0, stanceTuning).readyMovementFactor;
  const { blockSize } = step();
  const samplesPerStep = 16;
  const sampledSteps = 128;
  const sampleDistance = STEP_DISTANCE_METRES.walking / samplesPerStep;
  const jittered = createAim();
  const lune = createAim(1, stanceTuning.wobbleLimitRadians, 0);
  let clock = initialFootstepClock();
  let offLune = 0;
  let samples = 0;
  for (let stepIndex = 0; stepIndex < sampledSteps; stepIndex++) {
    for (let sample = 0; sample < samplesPerStep; sample++) {
      ({ clock } = advanceFootsteps(clock, 'walking', sampleDistance));
      const aimStep = step({
        velocity: [0, 0, -speed / blockSize],
        stridePhase: clock.stridePhase,
        stepIndex: clock.stepIndex,
      });
      const withJitter = jittered.advance(aimStep);
      const onLune = lune.advance(aimStep);
      if (Math.hypot(withJitter.yaw - onLune.yaw, withJitter.pitch - onLune.pitch) > 1e-10) {
        offLune += 1;
      }
      samples += 1;
    }
  }
  const observedShare = offLune / samples;
  const expectedShare = stanceTuning.wobbleJitterShare;
  const samplingMargin = 1 / samplesPerStep + 3 * Math.sqrt((expectedShare * (1 - expectedShare)) / sampledSteps);
  expect(Math.abs(observedShare - expectedShare)).toBeLessThan(samplingMargin);
});

it('eases seeded jitter within the lune speed bound across footfalls', () => {
  const speed = PLAYER.walk * firearmStanceEffects(0, stanceTuning).readyMovementFactor;
  const stepDistance = STEP_DISTANCE_METRES.walking;
  const { blockSize } = step();
  const travelPerFrame = speed / 60;
  const jittered = createAim();
  const lune = createAim(1, stanceTuning.wobbleLimitRadians, 0);
  let clock = initialFootstepClock();
  let previousJittered: ReturnType<AimController['advance']> | undefined;
  let previousLune: ReturnType<AimController['advance']> | undefined;
  let lunePeak = 0;
  for (let tick = 0; tick < 480; tick++) {
    ({ clock } = advanceFootsteps(clock, 'walking', travelPerFrame));
    const aimStep = step({
      velocity: [0, 0, -speed / blockSize],
      stridePhase: clock.stridePhase,
      stepIndex: clock.stepIndex,
    });
    const currentJittered = jittered.advance(aimStep);
    const currentLune = lune.advance(aimStep);
    lunePeak = Math.max(lunePeak, Math.hypot(currentLune.yaw, currentLune.pitch));
    if (previousJittered && previousLune) {
      const jitteredDelta = Math.hypot(
        currentJittered.yaw - previousJittered.yaw,
        currentJittered.pitch - previousJittered.pitch,
      );
      const luneDelta = Math.hypot(currentLune.yaw - previousLune.yaw, currentLune.pitch - previousLune.pitch);
      const easedDeviationBound =
        2 * stanceTuning.wobbleJitterAmplitudeFraction * lunePeak * Math.PI * (travelPerFrame / stepDistance);
      expect(jitteredDelta).toBeLessThanOrEqual(luneDelta + easedDeviationBound + 1e-10);
    }
    previousJittered = currentJittered;
    previousLune = currentLune;
  }
});

it('pump skill-zero readied-walk wobble fits its content bound', () => {
  const wobble = readiedWalkWobble(0);
  expect(wobble).toBeGreaterThan(0);
  expect(wobble).toBeLessThan(stanceTuning.wobbleLimitRadians);
});

it('wobble can use its larger content bound without merging it into recoil', () => {
  const { variance } = pumpSkillEffects(0);
  const aim = createAim(variance);
  const speed = 3;
  const { blockSize } = step();
  let clock = initialFootstepClock();
  let peak = 0;
  for (let tick = 0; tick < 240; tick++) {
    ({ clock } = advanceFootsteps(clock, 'walking', speed / 60));
    const frame = aim.advance(
      step({
        velocity: [0, 0, -speed / blockSize],
        variance,
        stridePhase: clock.stridePhase,
        stepIndex: clock.stepIndex,
      }),
    );
    peak = Math.max(peak, Math.hypot(frame.yaw, frame.pitch));
  }
  expect(peak).toBeCloseTo(stanceTuning.wobbleLimitRadians, 8);
});

it('readied-walk wobble shrinks with firearms skill at equal movement', () => {
  const levels = [0, Math.floor(SKILL_LEVEL_MAX / 2), SKILL_LEVEL_MAX];
  const wobble = levels.map(readiedWalkWobble);
  expect(wobble[1]).toBeLessThan(wobble[0]!);
  expect(wobble[2]).toBeLessThan(wobble[1]!);
  const configuredExpertFraction = stanceTuning.wobbleSkillTenVariance / pumpHandling.singleShot.variance;
  expect(wobble[2]! / wobble[0]!).toBeCloseTo(configuredExpertFraction, 4);
});

it('quick-look lag follows the skill-scaled wobble endpoint', () => {
  const turnLag = (level: number): number => {
    const effects = pumpSkillEffects(level);
    const aim = createAim(effects.variance);
    aim.advance(step({ variance: effects.variance }));
    const frame = aim.advance(step({ yaw: 0.01, variance: effects.variance }));
    return Math.abs(frame.yaw);
  };
  expect(turnLag(SKILL_LEVEL_MAX)).toBeLessThan(turnLag(0));
});

it('firearms skill reduces climb over the same full-auto burst', () => {
  const cadenceSeconds = 0.075;
  const levels = [0, Math.floor(SKILL_LEVEL_MAX / 2), SKILL_LEVEL_MAX];
  const peaks = levels.map((level) => {
    const effects = skillEffects(level, 'automaticFollowup');
    return burstPeak(0.03 * effects.recoilKickScale, effects.variance, cadenceSeconds);
  });
  for (let index = 1; index < peaks.length; index++) {
    expect(peaks[index]).toBeLessThanOrEqual(peaks[index - 1]!);
  }
  expect(peaks.at(-1)).toBeLessThan(peaks[0]!);
});

it('reload and rack curves preserve skill-zero time and stay monotonic', () => {
  const levels = Array.from({ length: SKILL_LEVEL_LEGENDARY + 1 }, (_, level) => level);
  const effects = levels.map((level) => skillEffects(level));
  const reloadDurations = effects.map(({ reloadDuration }) => reloadDuration);
  const rackDurations = effects.map(({ rackDuration }) => rackDuration);
  expect(reloadDurations[0]).toBe(1);
  expect(rackDurations[0]).toBe(1);
  for (let index = 1; index < levels.length; index++) {
    expect(reloadDurations[index]).toBeLessThanOrEqual(reloadDurations[index - 1]!);
    expect(rackDurations[index]).toBeLessThanOrEqual(rackDurations[index - 1]!);
  }
});

it('firearms skill effects improve through expert level and legendary matches expert', () => {
  const novice = skillEffects(0);
  const experienced = skillEffects(SKILL_LEVEL_MAX);
  const legendary = skillEffects(SKILL_LEVEL_LEGENDARY);
  expect(experienced.variance).toBeLessThan(novice.variance);
  expect(experienced.recoilKickScale).toBeLessThan(novice.recoilKickScale);
  expect(experienced.recoilRecoveryRate).toBeGreaterThan(novice.recoilRecoveryRate);
  expect(experienced.variance).toBe(stanceTuning.wobbleSkillTenVariance);
  expect(experienced.reloadDuration).toBeLessThan(novice.reloadDuration);
  expect(experienced.rackDuration).toBeLessThan(novice.rackDuration);
  const noviceStance = firearmStanceEffects(0, stanceTuning);
  const experiencedStance = firearmStanceEffects(SKILL_LEVEL_MAX, stanceTuning);
  const legendaryStance = firearmStanceEffects(SKILL_LEVEL_LEGENDARY, stanceTuning);
  expect(experiencedStance.raiseDurationSimSeconds).toBeLessThan(noviceStance.raiseDurationSimSeconds);
  expect(experiencedStance.readyMovementFactor).toBeGreaterThan(noviceStance.readyMovementFactor);
  expect(legendary).toEqual(experienced);
  expect(legendaryStance).toEqual(experiencedStance);
});
