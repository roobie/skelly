import { Matrix4, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { adsCameraEye, adsLimits } from '../src/core/adsView.ts';
import { aimDirection, NEUTRAL_AIM } from '../src/core/aim.ts';
import { sightedFirearmModel } from '../src/core/firearmSight.ts';
import { heldButtOffset, heldFirearmTransform } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { playerLookPose } from '../src/core/playerLookPose.ts';
import { LOOK_PITCH_LIMIT } from '../src/game/input.ts';
import { itemLook } from '../src/render/itemLook.ts';
import { fittedPartFrame } from '../src/render/models.ts';
import { baseRegistry as loadBaseRegistry } from './baseRegistry.ts';
import { withDefaultAttachment } from './firearmAttachmentFixture.ts';

const baseRegistry = loadBaseRegistry();

const adsCases = () =>
  [...baseRegistry.models.values()]
    .filter((model) => model.hands && model.gun?.sight)
    .flatMap((model) =>
      (['standing', 'crouching', 'prone'] as const).flatMap((stance) =>
        [-LOOK_PITCH_LIMIT, -LOOK_PITCH_LIMIT / 2, 0, LOOK_PITCH_LIMIT / 2, LOOK_PITCH_LIMIT].flatMap((pitch) =>
          (['right', 'left'] as const).flatMap((side) =>
            [NEUTRAL_AIM, { yaw: 0.02, pitch: -0.03 }].map((aimFrame) => ({ model, stance, pitch, side, aimFrame })),
          ),
        ),
      ),
    );

it('bounds ADS neck length and joint turns for every sighted long gun and legal stance', () => {
  const figure = baseRegistry.figures.get('player')!;
  const tolerance = figure.aimPose.ads.neckLengthToleranceFraction;
  const cases = adsCases();
  expect(cases.length).toBeGreaterThan(0);
  for (const { model, stance, pitch, side, aimFrame } of cases) {
    const body = playerLookPose({ figure, models: baseRegistry.models, pitch, stance, ads: { model, side, aimFrame } });
    const label = `${model.id} ${stance} ${pitch} ${side} aim ${aimFrame.yaw},${aimFrame.pitch}`;
    expect(body.neckScale, `${label}: neck length`).toBeGreaterThanOrEqual(1 - tolerance - 1e-12);
    expect(body.neckScale, `${label}: neck length`).toBeLessThanOrEqual(1 + tolerance + 1e-12);
    for (const [rotation, limits, joint] of [
      [body.neckRotation, figure.aimPose.neckLimitDegrees, 'neck'],
      [body.headRotation, figure.aimPose.headLimitDegrees, 'head'],
    ] as const) {
      const angle = new Quaternion(...rotation).angleTo(new Quaternion());
      expect(angle, `${label}: ${joint} turn`).toBeLessThanOrEqual(
        (limits[rotation[0] < 0 ? 0 : 1] * Math.PI) / 180 + 1e-12,
      );
    }
  }
});

it('seats ADS stocks within the per-gun shoulder bound in every stance', () => {
  const figure = baseRegistry.figures.get('player')!;
  const cases = adsCases().filter(({ model }) => model.hands?.butt);
  expect(cases.some(({ model }) => model.gun?.sight?.kind === 'iron')).toBe(true);
  expect(cases.some(({ model }) => model.gun?.sight?.kind === 'optic')).toBe(true);
  for (const { model, stance, pitch, side, aimFrame } of cases) {
    const body = playerLookPose({ figure, models: baseRegistry.models, pitch, stance, ads: { model, side, aimFrame } });
    const pose = heldFirearmTransform({
      holds: figure.holds,
      model,
      side,
      leadingSide: side,
      twoHanded: true,
      progress: 1,
      aimingDownSights: true,
      aimFrame,
      lookPitchRadians: pitch,
      loweredPitchRadians: 0,
      stockSeat: body.stockSeats[side],
    });
    const label = `${model.id} ${side} ${stance} ${pitch} aim ${aimFrame.yaw},${aimFrame.pitch}`;
    expect(new Vector3(...pose.sightDirection!).dot(new Vector3(...aimDirection(0, 0, aimFrame)))).toBeCloseTo(1);
    const rotation = new Matrix4().makeBasis(
      ...(pose.rootRotation.map((axis) => new Vector3(...axis)) as [Vector3, Vector3, Vector3]),
    );
    const seat = new Vector3(...heldButtOffset(model))
      .applyMatrix4(rotation)
      .add(new Vector3(...pose.rootOffset))
      .applyAxisAngle(new Vector3(1, 0, 0), pitch)
      .add(new Vector3(...body.eye));
    expect(seat.distanceTo(new Vector3(...body.shoulders[side])), `${label}: shoulder contact`).toBeLessThanOrEqual(
      adsLimits(figure, model).stockShoulderMetres + 1e-12,
    );
  }
});

const cameraCases = () => {
  const cases = adsCases();
  if (!cases.some(({ stance }) => stance === 'prone')) {
    throw new Error('ADS camera checks need a prone sighted firearm');
  }
  return cases;
};

const cameraCase = ({ model, stance, pitch, side, aimFrame }: ReturnType<typeof adsCases>[number]) => {
  const figure = baseRegistry.figures.get('player')!;
  const ads = { model, side, aimFrame };
  const body = playerLookPose({ figure, models: baseRegistry.models, pitch, stance, ads });
  const camera = adsCameraEye({ figure, pose: body, ads, pitch });
  const gun = heldFirearmTransform({
    holds: figure.holds,
    model,
    side,
    leadingSide: side,
    twoHanded: true,
    progress: 1,
    aimingDownSights: true,
    aimFrame,
    lookPitchRadians: pitch,
    loweredPitchRadians: 0,
    stockSeat: body.stockSeats[side],
    adsEyes: body.eyes,
  });
  const offset = new Vector3(...camera.eye).sub(new Vector3(...body.eye)).applyAxisAngle(new Vector3(1, 0, 0), -pitch);
  return { camera, gun, offset, label: `${model.id} ${stance} ${pitch} ${side} aim ${aimFrame.yaw},${aimFrame.pitch}` };
};

it('uses per-gun ADS limits before figure defaults', () => {
  const figure = baseRegistry.figures.get('player')!;
  const { model } = adsCases()[0]!;
  const overrides = { cameraOffsetLimitMetres: 0.03, stockShoulderLimitMetres: 0.07 };
  const withLimits = { ...model, hands: { ...model.hands!, ads: overrides } };
  expect(adsLimits(figure, withLimits)).toEqual({
    cameraOffsetMetres: overrides.cameraOffsetLimitMetres,
    stockShoulderMetres: overrides.stockShoulderLimitMetres,
  });
  expect(adsLimits(figure, { ...withLimits, hands: { ...withLimits.hands, ads: {} } })).toEqual({
    cameraOffsetMetres: figure.aimPose.ads.cameraOffsetLimitMetres,
    stockShoulderMetres: figure.aimPose.ads.stockShoulderLimitMetres,
  });
});

const alignedCameraCases = () =>
  cameraCases().filter(({ model, aimFrame }) => model.gun?.sight?.kind !== 'optic' || aimFrame === NEUTRAL_AIM);

it('keeps irons and unswayed optics on the physical sight line', () => {
  const cases = alignedCameraCases();
  for (const entry of cases) {
    const { gun, offset, label } = cameraCase(entry);
    const linePoint = new Vector3(...gun.rootOffset).add(new Vector3(...gun.sightEyeOffset!));
    expect(
      offset
        .sub(linePoint)
        .cross(new Vector3(...gun.sightDirection!))
        .length(),
      label,
    ).toBeLessThan(1e-9);
  }
});

it('keeps the camera inside the iron range or at the unswayed optic eye', () => {
  for (const entry of alignedCameraCases()) {
    const { gun, offset, label } = cameraCase(entry);
    if (gun.sightEyeRangeOffsets) {
      const near = new Vector3(...gun.rootOffset).add(new Vector3(...gun.sightEyeRangeOffsets[0]));
      const far = new Vector3(...gun.rootOffset).add(new Vector3(...gun.sightEyeRangeOffsets[1]));
      const span = far.sub(near);
      const fraction = offset.sub(near).dot(span) / span.lengthSq();
      expect(fraction, label).toBeGreaterThanOrEqual(-1e-12);
      expect(fraction, label).toBeLessThanOrEqual(1 + 1e-12);
    } else {
      expect(
        offset.distanceTo(new Vector3(...gun.rootOffset).add(new Vector3(...gun.sightEyeOffset!))),
        label,
      ).toBeLessThan(1e-9);
    }
  }
});

it('fits ADS inside the authored camera-to-body-eye offset budget', () => {
  for (const entry of cameraCases()) {
    const { camera, label } = cameraCase(entry);
    expect(camera.distanceMetres, label).toBeLessThanOrEqual(camera.limitMetres + 1e-12);
  }
});

it('twists the prone ADS torso the opposite way to a standing one, as a shooter lying along the ground does', () => {
  const figure = baseRegistry.figures.get('player')!;
  // A free-held gun overrides the roll with its own, so the figure's prone roll is read off a stocked long gun.
  const { model } = adsCases().find(({ model: gun }) => gun.hands?.proneSupport)!;
  const yawOf = (stance: 'standing' | 'prone', side: 'right' | 'left') => {
    const { spineRotation } = playerLookPose({
      figure,
      models: baseRegistry.models,
      pitch: 0,
      stance,
      ads: { model, side, aimFrame: NEUTRAL_AIM },
    });
    // The roll about the model's z axis shows in the rotation's z component.
    return Math.sign(spineRotation[2]);
  };
  for (const side of ['right', 'left'] as const) {
    expect(yawOf('prone', side)).toBe(-yawOf('standing', side));
  }
});

it('puts the eye on a scoped long gun sight line in every stance within the camera budget', () => {
  const { registry } = withDefaultAttachment(baseRegistry, 'rifle_hunting', 'optic_hunting_3_9x');
  const scoped = sightedFirearmModel(registry, new Inventory(registry).create('rifle_hunting'))!;
  expect(scoped.gun?.sight?.kind).toBe('optic');
  const figure = registry.figures.get('player')!;
  const stances = ['standing', 'crouching', 'prone'] as const;
  for (const stance of stances) {
    // Straight down, a standing scoped rifle sits just past the budget; that is not prone's to fix, so only prone adds it.
    const pitches = [-LOOK_PITCH_LIMIT / 2, 0, LOOK_PITCH_LIMIT / 2, LOOK_PITCH_LIMIT];
    for (const pitch of stance === 'prone' ? [-LOOK_PITCH_LIMIT, ...pitches] : pitches) {
      const ads = { model: scoped, side: 'right' as const, aimFrame: NEUTRAL_AIM };
      const pose = playerLookPose({ figure, models: registry.models, pitch, stance, ads });
      const camera = adsCameraEye({ figure, pose, ads, pitch });
      expect(camera.fits, `scoped ${stance} ${pitch}`).toBe(true);
    }
  }
});

it('aligns ADS through the fitted optic frame and restores irons when removed', () => {
  const { registry, fitted } = withDefaultAttachment(baseRegistry, 'rifle_hunting', 'optic_hunting_3_9x');
  const inventory = new Inventory(registry);
  const rifle = inventory.create('rifle_hunting');
  const bare = registry.models.get(registry.items.get(rifle.type)!.model!)!;
  expect(bare.gun?.sight?.kind).toBe('iron');
  const look = itemLook(registry, rifle)!;
  const slot = look.slots.find((entry) => entry.slot === fitted.mountedAt)!;
  const optic = registry.models.get(slot.model!)!.gun!.attachment!.sight!;
  expect(optic.kind).toBe('optic');
  const seat = fittedPartFrame(slot);
  seat.updateMatrix();
  const eye = new Vector3(...optic.eye).applyMatrix4(seat.matrix);
  const direction = new Vector3(...optic.direction).transformDirection(seat.matrix);
  const up = new Vector3(...optic.up).transformDirection(seat.matrix);
  const resolved = sightedFirearmModel(registry, rifle)!;
  expect(resolved.gun?.sight?.kind).toBe('optic');
  expect(resolved.gun?.sight?.eye).toEqual(eye.toArray());
  expect(resolved.gun?.sight?.direction).toEqual(direction.toArray());
  expect(resolved.gun?.sight?.up).toEqual(up.toArray());
  expect(resolved.gun?.sight?.eyeReliefMetres).toBe(optic.eyeReliefMetres);
  expect(resolved.gun?.sight?.ocularDiameterMetres).toBe(optic.ocularDiameterMetres);
  expect(resolved.grip).toBe(bare.grip);
  const pose = heldFirearmTransform({
    holds: baseRegistry.figures.get('player')!.holds,
    model: resolved,
    side: 'right',
    leadingSide: 'right',
    twoHanded: true,
    progress: 1,
    aimingDownSights: true,
    aimFrame: NEUTRAL_AIM,
    loweredPitchRadians: 0,
  })!;
  expect(pose.sightEyeOffset).toBeDefined();
  for (const axis of [0, 1, 2] as const) {
    expect(pose.rootOffset[axis] + pose.sightEyeOffset![axis]).toBeCloseTo(0);
    expect(pose.sightDirection![axis]).toBeCloseTo([0, 0, -1][axis]!);
  }
  inventory.fitSlot(rifle, fitted.mountedAt, undefined);
  expect(sightedFirearmModel(registry, rifle)).toBe(bare);
  expect(bare.gun?.sight?.kind).toBe('iron');
});
