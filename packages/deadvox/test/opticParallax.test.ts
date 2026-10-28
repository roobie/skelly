import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { adsCameraEye } from '../src/core/adsView.ts';
import { AimController } from '../src/core/aim.ts';
import { sightedFirearmModel } from '../src/core/firearmSight.ts';
import { firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import { heldFirearmTransform } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { playerLookPose } from '../src/core/playerLookPose.ts';
import { firearmsCombatTuning } from '../src/core/skillTraining.ts';
import { baseRegistry } from './baseRegistry.ts';
import { withDefaultAttachment } from './firearmAttachmentFixture.ts';
import { PLAYER } from './playerFixture.ts';

it('allows skill-dependent unity optic parallax and adds walking misalignment', () => {
  const { registry } = withDefaultAttachment(baseRegistry(), 'rifle_assault', 'optic_mini_reflex');
  const model = sightedFirearmModel(registry, new Inventory(registry).create('rifle_assault'))!;
  const figure = registry.figures.get('player')!;
  const base = firearmsCombatTuning(registry);
  const tuning = {
    ...base,
    wobbleSkillTenVariance: 1e-6,
    skillZeroHandling: {
      ...base.skillZeroHandling,
      singleShot: { ...base.skillZeroHandling.singleShot, variance: 1 },
    },
  };
  const offset = (level: number, moving: boolean) => {
    const effects = firearmsSkillEffects(level, tuning);
    const aim = new AimController({
      tuning: PLAYER.aim,
      wobbleLimitRadians: 0.2,
      wobbleShape: { verticalToHorizontalRatio: 0.5, archPower: 1, phaseOffsetRadians: 0 },
      wobbleSeed: 7,
      wobbleNoise: { reversionRatePerSimSecond: 1, sigmaRadiansPerSqrtSecond: 0, smoothingSimSeconds: 0.1 },
      breathHold: tuning.breathHold,
    });
    const step = {
      dt: 1 / 60,
      velocity: [moving ? 2 : 0, 0, 0] as [number, number, number],
      blockSize: 0.5,
      yaw: 0,
      pitch: 0,
      variance: effects.variance,
      firing: false,
      recoilRecoveryRate: effects.recoilRecoveryRate,
      stridePhase: 0.25,
    };
    aim.advance(step);
    const aimFrame = aim.advance({ ...step, yaw: 0.02 });
    const ads = { model, side: 'right' as const, aimFrame };
    const pose = playerLookPose({ figure, models: registry.models, pitch: 0, stance: 'standing', ads });
    const camera = adsCameraEye({ figure, pose, ads, pitch: 0 });
    expect(camera.fits).toBe(true);
    const gun = heldFirearmTransform({
      holds: figure.holds,
      model,
      side: ads.side,
      leadingSide: ads.side,
      twoHanded: true,
      progress: 1,
      aimingDownSights: true,
      aimFrame,
      stockSeat: pose.stockSeats[ads.side],
      adsEyes: pose.eyes,
      loweredPitchRadians: 0,
    });
    return new Vector3(...camera.eye)
      .sub(new Vector3(...pose.eye))
      .sub(new Vector3(...gun.rootOffset))
      .sub(new Vector3(...gun.sightEyeOffset!))
      .cross(new Vector3(...gun.sightDirection!))
      .length();
  };
  const novice = offset(0, false);
  const expert = offset(10, false);
  expect(novice).toBeGreaterThan(1e-9);
  expect(expert).toBeCloseTo(0, 6);
  expect(expert).toBeLessThan(novice);
  expect(offset(10, true)).toBeGreaterThan(expert);
});
