import { Euler, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { AimController, aimBasis, aimDirection, NEUTRAL_AIM } from '../src/core/aim.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, skillSaturation } from '../src/core/character.ts';
import { type FirearmsSkillShotKind, firearmStanceEffects, firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';

const stanceTuning = BUNDLED_CONTENT.registry.skills.get('firearms_combat')!.combat!.firearms!;
const skillEffects = (level: number, kind: FirearmsSkillShotKind = 'singleShot') =>
  firearmsSkillEffects(level, stanceTuning, kind);

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

it('expert firearm effects retain the established curve endpoint regardless of skill-zero tuning', () => {
  const alternate = {
    ...stanceTuning,
    skillZeroHandling: {
      singleShot: { variance: 17, recoilKickScale: 23, recoilRecoveryScale: 0.07 },
      automaticFollowup: { variance: 31, recoilKickScale: 41, recoilRecoveryScale: 0.03 },
    },
  };
  expect(skillEffects(SKILL_LEVEL_MAX)).toEqual(firearmsSkillEffects(SKILL_LEVEL_MAX, alternate));
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
  const novice = new AimController();
  const expert = new AimController();
  novice.recordShot(73, 0.02, skillEffects(0).recoilKickScale);
  expert.recordShot(73, 0.02, skillEffects(SKILL_LEVEL_MAX).recoilKickScale);
  expect(novice.snapshotState().recoilPitch).toBeGreaterThan(expert.snapshotState().recoilPitch);
  expect(Math.abs(novice.snapshotState().recoilYaw)).toBeGreaterThan(Math.abs(expert.snapshotState().recoilYaw));
});

it('expert recovery scale decays the same released recoil faster', () => {
  const novice = new AimController();
  const expert = new AimController();
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

it('expert firearms skill reduces moving sway', () => {
  const novice = new AimController();
  const expert = new AimController();
  const noviceFrame = novice.advance(step({ velocity: [2, 0, 0], variance: skillEffects(0).variance }));
  const expertFrame = expert.advance(step({ velocity: [2, 0, 0], variance: skillEffects(SKILL_LEVEL_MAX).variance }));
  expect(Math.hypot(expertFrame.yaw, expertFrame.pitch)).toBeLessThan(Math.hypot(noviceFrame.yaw, noviceFrame.pitch));
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

it('reload and rack curves preserve skill-zero time, halve the old skill-ten time, and stay monotonic', () => {
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
  expect(reloadDurations[SKILL_LEVEL_MAX]! / skillSaturation(SKILL_LEVEL_MAX, 0.55, 5)).toBeCloseTo(0.5, 6);
  expect(rackDurations[SKILL_LEVEL_MAX]! / skillSaturation(SKILL_LEVEL_MAX, 0.62, 3)).toBeCloseTo(0.5, 6);
  expect(reloadDurations[SKILL_LEVEL_LEGENDARY]).toBe(reloadDurations[SKILL_LEVEL_MAX]);
  expect(rackDurations[SKILL_LEVEL_LEGENDARY]).toBe(rackDurations[SKILL_LEVEL_MAX]);
});

it('firearms skill effects improve through expert level and legendary matches expert', () => {
  const novice = skillEffects(0);
  const experienced = skillEffects(SKILL_LEVEL_MAX);
  const legendary = skillEffects(SKILL_LEVEL_LEGENDARY);
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
