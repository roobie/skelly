import { Matrix4, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
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
    const label = `${model.id} ${stance} ${pitch} ${side}`;
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

it('seats ADS sights at the anatomical eye without releasing either shoulder', () => {
  const figure = baseRegistry.figures.get('player')!;
  const cases = adsCases();
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
      loweredPitchRadians: 0,
      stockSeat: body.stockSeats[side],
    });
    const label = `${side} ${stance} ${pitch}`;
    expect(
      new Vector3(...pose.rootOffset).add(new Vector3(...pose.sightEyeOffset!)).length(),
      `${label}: sight eye`,
    ).toBeLessThan(1e-6);
    expect(new Vector3(...pose.sightDirection!).dot(new Vector3(...aimDirection(0, 0, aimFrame)))).toBeCloseTo(1);
    const rotation = new Matrix4().makeBasis(
      ...(pose.rootRotation.map((axis) => new Vector3(...axis)) as [Vector3, Vector3, Vector3]),
    );
    const seat = new Vector3(...heldButtOffset(model))
      .applyMatrix4(rotation)
      .add(new Vector3(...pose.rootOffset))
      .applyAxisAngle(new Vector3(1, 0, 0), pitch)
      .add(new Vector3(...body.eye));
    expect(seat.distanceTo(new Vector3(...body.shoulders[side])), `${label}: shoulder contact`).toBeLessThan(0.1);
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
