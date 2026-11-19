import type { FurnitureDef } from '@skelly/engine/content';
import { type BlockEntity, rotationOf } from '@skelly/engine/world';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

type SlotAnchor = NonNullable<FurnitureDef['slotAnchors']>[number];
type Orientation = NonNullable<SlotAnchor['orientationDegrees']>;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

// Content turns about the housing's fixed X, then Y, then Z axis, which is three.js's intrinsic order 'ZYX'.
export const anchorTurn = ([x, y, z]: Orientation = [0, 0, 0]) =>
  new Quaternion().setFromEuler(new Euler(radians(x), radians(y), radians(z), 'ZYX'));

/** The world transform of a housing's own frame, where instrument looks and slot anchors stand. */
export const housingFrame = (entity: BlockEntity, def: FurnitureDef, blockSize: number): Matrix4 => {
  const [right, up, back] = rotationOf(entity).map((axis) => new Vector3(...axis));
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right!, up!, back!));
  const origin = new Vector3()
    .fromArray(def.size.map((size) => 0.5 - size / 2))
    .applyQuaternion(rotation)
    .add(new Vector3().fromArray(entity.pos.map((value, axis) => value + entity.size[axis]! / 2)))
    .multiplyScalar(blockSize);
  return new Matrix4().compose(origin, rotation, new Vector3().setScalar(blockSize));
};

/** Each slot anchor's pick box as its world corners, for a view of the piece to project the slot's pick from. */
export const socketBoxes = (
  entity: BlockEntity,
  def: FurnitureDef,
  blockSize: number,
): { readonly slot: string; readonly corners: readonly Vector3[] }[] => {
  const frame = housingFrame(entity, def, blockSize);
  const unit = [-0.5, 0.5];
  return (def.slotAnchors ?? []).map(({ slot, position, orientationDegrees, pickSize }) => {
    const box = frame
      .clone()
      .multiply(
        new Matrix4().compose(new Vector3(...position), anchorTurn(orientationDegrees), new Vector3(...pickSize)),
      );
    const corners = unit.flatMap((x) => unit.flatMap((y) => unit.map((z) => new Vector3(x, y, z).applyMatrix4(box))));
    return { slot, corners };
  });
};
