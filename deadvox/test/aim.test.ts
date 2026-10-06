import { Euler, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { AimController, aimBasis, aimDirection, NEUTRAL_AIM } from '../src/core/aim.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { firearmStanceEffects, firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import { Inventory } from '../src/core/inventory.ts';
import { coneDirection } from '../src/core/pellets.ts';
import { Rng } from '../src/core/random.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { firearmHandlingFor } from '../src/game/firearmHandling.ts';

const stanceTuning = {
  raiseMinimumSeconds: 0.25,
  raiseRangeSeconds: 0.4,
  raiseHalfLifeLevels: 5,
  readyMovementMinimum: 0.4,
  readyMovementRange: 0.35,
  readyMovementHalfLifeLevels: 5,
  loweredPitchRadians: 0.5,
  adsApertureFill: 0.85,
} as const;

const step = (overrides: Partial<Parameters<AimController['advance']>[0]> = {}) => ({
  dt: 1 / 60,
  velocity: [0, 0, 0] as [number, number, number],
  blockSize: 0.5,
  yaw: 0,
  pitch: 0,
  variance: 1,
  firing: false,
  recoilRecoveryRate: 1,
  ...overrides,
});

const burstPeak = (recoilKickRadians: number, variance: number, cadenceSeconds: number): number => {
  const aim = new AimController(undefined, variance);
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

const akBurstMetrics = (effects: ReturnType<typeof firearmsSkillEffects>) => {
  const inventory = new Inventory(BUNDLED_CONTENT.registry);
  const rifle = inventory.create('debug_rifle_ak');
  const data = firearmHandlingFor(rifle, BUNDLED_CONTENT.registry);
  if (!(data.rpm && data.recoilKickRadians && data.dispersionRadians)) {
    throw new Error('AK content must provide full-auto recoil and dispersion');
  }
  const aim = new AimController(undefined, effects.variance);
  const recoilSeeds = Rng.stream(73, 'ak-burst-recoil');
  const directions: [number, number, number][] = [];
  const shotCount = 24;
  const dt = 1 / 60;
  const cadenceSeconds = 60 / data.rpm;
  let viewPitch = 0;
  let nextShotAt = 0;
  let maxAimClimb = 0;
  const applyViewShift = () => {
    const shift = aim.pendingViewPitchShift;
    aim.applyViewPitchShift(shift, shift);
    viewPitch += shift;
  };
  for (let tick = 0; directions.length < shotCount; tick++) {
    const time = tick * dt;
    if (tick > 0) {
      aim.advance(
        step({
          dt,
          pitch: viewPitch,
          variance: effects.variance,
          firing: true,
          recoilRecoveryRate: effects.recoilRecoveryRate,
        }),
      );
      applyViewShift();
    }
    while (directions.length < shotCount && nextShotAt <= time + 1e-9) {
      const basis = aimBasis(0, viewPitch, aim.frame);
      directions.push(
        coneDirection(basis, data.dispersionRadians, Rng.stream(73, `ak-burst-dispersion:${directions.length}`)),
      );
      aim.recordShot(recoilSeeds.int(0, 0xff_ff_ff_ff), data.recoilKickRadians, effects.recoilKickScale);
      applyViewShift();
      maxAimClimb = Math.max(maxAimClimb, Math.abs(viewPitch + aim.frame.pitch));
      nextShotAt += cadenceSeconds;
    }
  }
  const center = directions.reduce<[number, number, number]>(
    (sum, direction) => [sum[0] + direction[0], sum[1] + direction[1], sum[2] + direction[2]],
    [0, 0, 0],
  );
  const centerLength = Math.hypot(...center);
  const spreadRms = Math.sqrt(
    directions.reduce((sum, direction) => {
      const cosine = (direction[0] * center[0] + direction[1] * center[1] + direction[2] * center[2]) / centerLength;
      return sum + Math.acos(Math.max(-1, Math.min(1, cosine))) ** 2;
    }, 0) / directions.length,
  );
  return { climb: maxAimClimb, spread: spreadRms };
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
  const still = new AimController();
  const moving = new AimController();
  const stillFrame = still.advance(step());
  const movingFrame = moving.advance(step({ velocity: [2, 0, 0] }));
  expect(Math.hypot(movingFrame.yaw, movingFrame.pitch)).toBeGreaterThan(Math.hypot(stillFrame.yaw, stillFrame.pitch));

  const turning = new AimController();
  const steady = new AimController();
  turning.advance(step());
  steady.advance(step());
  const turnedFrame = turning.advance(step({ yaw: 0.6 }));
  const steadyFrame = steady.advance(step());
  expect(Math.abs(turnedFrame.yaw)).toBeGreaterThan(Math.abs(steadyFrame.yaw));
});

it('committed recoil recovers in simulation time and equal inputs stay deterministic', () => {
  const first = new AimController();
  const second = new AimController();
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
  const aim = new AimController();
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
      aim.advance(step({ dt, firing: true }));
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
    aim.advance(step({ dt, firing: false }));
    applyViewShift();
  }
  expect(viewPitch).toBeCloseTo(retainedViewPitch, 8);
  expect(Math.hypot(aim.frame.yaw, aim.frame.pitch)).toBeLessThan(heldOffset);
});

it('hands pitch beyond the aim-frame boundary to the view without losing it', () => {
  const aim = new AimController();
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

it('expert firearms skill reduces the same moving shot-recoil sway', () => {
  const novice = new AimController();
  const experienced = new AimController();
  novice.recordShot(73, 0.02, firearmsSkillEffects(0).recoilKickScale);
  experienced.recordShot(73, 0.02, firearmsSkillEffects(SKILL_LEVEL_MAX).recoilKickScale);
  const noviceFrame = novice.advance(step({ velocity: [2, 0, 0], variance: firearmsSkillEffects(0).variance }));
  const experiencedFrame = experienced.advance(
    step({ velocity: [2, 0, 0], variance: firearmsSkillEffects(SKILL_LEVEL_MAX).variance }),
  );
  expect(Math.hypot(experiencedFrame.yaw, experiencedFrame.pitch)).toBeLessThan(
    Math.hypot(noviceFrame.yaw, noviceFrame.pitch),
  );
});

it('expert firearms skill recovers the same released recoil faster', () => {
  const novice = new AimController();
  const experienced = new AimController();
  novice.recordShot(73, 0.08);
  experienced.recordShot(73, 0.08);
  for (let tick = 0; tick < 20; tick++) {
    novice.advance(step({ recoilRecoveryRate: firearmsSkillEffects(0).recoilRecoveryRate }));
    experienced.advance(step({ recoilRecoveryRate: firearmsSkillEffects(SKILL_LEVEL_MAX).recoilRecoveryRate }));
  }
  expect(Math.hypot(experienced.frame.yaw, experienced.frame.pitch)).toBeLessThan(
    Math.hypot(novice.frame.yaw, novice.frame.pitch),
  );
});

it('lighter firearm kick builds less aim displacement over the same full-auto burst', () => {
  const cadenceSeconds = 0.075;
  const { variance } = firearmsSkillEffects(0);
  const lightKick = burstPeak(0.004, variance, cadenceSeconds);
  const heavyKick = burstPeak(0.03, variance, cadenceSeconds);
  expect(lightKick).toBeLessThan(heavyKick);
});

it('firearms skill never adds recoil climb across the same full-auto burst', () => {
  const cadenceSeconds = 0.075;
  const levels = [0, Math.floor(SKILL_LEVEL_MAX / 2), SKILL_LEVEL_MAX];
  const peaks = levels.map((level) => {
    const effects = firearmsSkillEffects(level);
    return burstPeak(0.03 * effects.recoilKickScale, effects.variance, cadenceSeconds);
  });
  for (let index = 1; index < peaks.length; index++) {
    expect(peaks[index]).toBeLessThanOrEqual(peaks[index - 1]!);
  }
  expect(peaks.at(-1)).toBeLessThan(peaks[0]!);
});

it("expert firearms skill scales a committed shot's immediate aim kick", () => {
  const novice = new AimController();
  const experienced = new AimController();
  novice.recordShot(73, 0.02, firearmsSkillEffects(0).recoilKickScale);
  experienced.recordShot(73, 0.02, firearmsSkillEffects(SKILL_LEVEL_MAX).recoilKickScale);
  expect(Math.hypot(experienced.frame.yaw, experienced.frame.pitch)).toBeLessThan(
    Math.hypot(novice.frame.yaw, novice.frame.pitch),
  );
});

it('skill-0 AK full-auto climb and spread are about three times the main baseline', () => {
  const baseline = akBurstMetrics({ ...firearmsSkillEffects(0), recoilKickScale: 1 });
  const novice = akBurstMetrics(firearmsSkillEffects(0));
  const expert = akBurstMetrics(firearmsSkillEffects(SKILL_LEVEL_MAX));
  for (const metric of ['climb', 'spread'] as const) {
    const ratio = novice[metric] / baseline[metric];
    expect(ratio).toBeGreaterThanOrEqual(2.75);
    expect(ratio).toBeLessThanOrEqual(3.25);
    expect(novice[metric]).toBeGreaterThan(expert[metric]);
  }
});

it('firearms skill effects improve through expert level and legendary matches expert', () => {
  const novice = firearmsSkillEffects(0);
  const experienced = firearmsSkillEffects(SKILL_LEVEL_MAX);
  const legendary = firearmsSkillEffects(SKILL_LEVEL_LEGENDARY);
  expect(experienced.variance).toBeLessThan(novice.variance);
  expect(experienced.recoilKickScale).toBeLessThan(novice.recoilKickScale);
  expect(experienced.recoilKickScale).toBe(experienced.variance);
  expect(experienced.recoilRecoveryRate).toBe(2 - experienced.variance);
  expect(experienced.recoilRecoveryRate).toBeGreaterThan(novice.recoilRecoveryRate);
  expect(experienced.reloadDuration).toBeLessThan(novice.reloadDuration);
  expect(experienced.rackDuration).toBeLessThan(novice.rackDuration);
  const noviceStance = firearmStanceEffects(0, stanceTuning);
  const experiencedStance = firearmStanceEffects(SKILL_LEVEL_MAX, stanceTuning);
  const legendaryStance = firearmStanceEffects(SKILL_LEVEL_LEGENDARY, stanceTuning);
  expect(experiencedStance.raiseDuration).toBeLessThan(noviceStance.raiseDuration);
  expect(experiencedStance.readyMovementFactor).toBeGreaterThan(noviceStance.readyMovementFactor);
  expect(legendary).toEqual(experienced);
  expect(legendaryStance).toEqual(experiencedStance);
});
