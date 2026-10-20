import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import { heldFirearmTransform } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { sightedFirearmModel } from '../src/render/firearmSight.ts';
import { itemLook } from '../src/render/itemLook.ts';
import { fittedPartFrame } from '../src/render/models.ts';
import { baseRegistry as loadBaseRegistry } from './baseRegistry.ts';
import { withDefaultAttachment } from './firearmAttachmentFixture.ts';

const baseRegistry = loadBaseRegistry();

it('aligns ADS through the fitted optic frame and restores irons when removed', () => {
  const { registry, fitted } = withDefaultAttachment(baseRegistry, 'rifle_hunting', 'optic_hunting_3_9x');
  const inventory = new Inventory(registry);
  const rifle = inventory.create('rifle_hunting');
  const bare = registry.models.get(registry.items.get(rifle.type)!.model!)!;
  expect(bare.sight?.kind).toBe('iron');
  const look = itemLook(registry, rifle)!;
  const slot = look.slots.find((entry) => entry.slot === fitted.mountedAt)!;
  const optic = registry.models.get(slot.model!)!.attachment!.sight!;
  expect(optic.kind).toBe('optic');
  const seat = fittedPartFrame(slot);
  seat.updateMatrix();
  const eye = new Vector3(...optic.eye).applyMatrix4(seat.matrix);
  const direction = new Vector3(...optic.direction).transformDirection(seat.matrix);
  const up = new Vector3(...optic.up).transformDirection(seat.matrix);
  const resolved = sightedFirearmModel(registry, rifle)!;
  expect(resolved.sight?.kind).toBe('optic');
  expect(resolved.sight?.eye).toEqual(eye.toArray());
  expect(resolved.sight?.direction).toEqual(direction.toArray());
  expect(resolved.sight?.up).toEqual(up.toArray());
  expect(resolved.sight?.eyeReliefMetres).toBe(optic.eyeReliefMetres);
  expect(resolved.sight?.ocularDiameterMetres).toBe(optic.ocularDiameterMetres);
  expect(resolved.grip).toBe(bare.grip);
  const pose = heldFirearmTransform({
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
  expect(bare.sight?.kind).toBe('iron');
});
