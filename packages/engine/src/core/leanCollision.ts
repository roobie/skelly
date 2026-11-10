import type { AimFrame } from './aim.ts';
import { claimed } from './capabilities.ts';
import type { ModelDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { sightedFirearmModel } from './firearmSight.ts';
import { heldFirearmTransform } from './heldPose.ts';
import type { HandSide, Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { LeanBox } from './lean.ts';
import { type LeanPrimitive, prepareLeanGeometry } from './leanGeometry.ts';
import { type PlayerLookPose, playerHeldSeatFrame } from './playerLookPose.ts';
import { add, axisRotation, multiplyRotation, rotateVector, sub } from './spatial.ts';

const geometry = new WeakMap<Inventory, { version: number; items: Map<Item, readonly LeanPrimitive[]> }>();

const itemGeometry = (inventory: Inventory, item: Item, model: ModelDef): readonly LeanPrimitive[] => {
  let cached = geometry.get(inventory);
  if (cached?.version !== inventory.version) {
    cached = { version: inventory.version, items: new Map() };
    geometry.set(inventory, cached);
  }
  let primitives = cached.items.get(item);
  if (!primitives) {
    primitives = prepareLeanGeometry(inventory.registry, item, model);
    cached.items.set(item, primitives);
  }
  return primitives;
};

type Basis = readonly Vec3[];
const turn = (basis: Basis, point: Vec3): Vec3 => [
  basis[0]![0] * point[0] + basis[1]![0] * point[1] + basis[2]![0] * point[2],
  basis[0]![1] * point[0] + basis[1]![1] * point[1] + basis[2]![1] * point[2],
  basis[0]![2] * point[0] + basis[1]![2] * point[1] + basis[2]![2] * point[2],
];

const primitiveRadius = (primitive: LeanPrimitive, basis: Basis, offset: Vec3): number => {
  let squared = -1;
  let farX = 0;
  let farY = 0;
  let farZ = 0;
  for (const point of primitive.corners) {
    const x = offset[0] + basis[0]![0] * point[0] + basis[1]![0] * point[1] + basis[2]![0] * point[2];
    const y = offset[1] + basis[0]![1] * point[0] + basis[1]![1] * point[1] + basis[2]![1] * point[2];
    const z = offset[2] + basis[0]![2] * point[0] + basis[1]![2] * point[1] + basis[2]![2] * point[2];
    const distance = x * x + y * y + z * z;
    if (distance > squared) {
      squared = distance;
      farX = x;
      farY = y;
      farZ = z;
    }
  }
  if (!Number.isFinite(squared)) {
    return Math.max(...primitive.corners.map((point) => Math.hypot(...add(offset, turn(basis, point)))));
  }
  return Math.hypot(farX, farY, farZ);
};

const projectedExtent = (basis: Basis, axes: readonly Vec3[], row: number): number => {
  let extent = 0;
  for (const axis of axes) {
    extent += Math.abs(basis[0]![row]! * axis[0] + basis[1]![row]! * axis[1] + basis[2]![row]! * axis[2]);
  }
  return extent;
};

export const playerLeanBoxes = ({
  inventory,
  pose,
  feet,
  blockSize,
  yaw,
  pitch,
  aimFrame,
  ads,
  progress,
  loweredPitchRadians,
}: {
  inventory: Inventory;
  pose: PlayerLookPose;
  feet: Vec3;
  blockSize: number;
  yaw: number;
  pitch: number;
  aimFrame: AimFrame;
  ads: boolean;
  progress: (uid: number) => number;
  loweredPitchRadians: number;
}): LeanBox[] => {
  const figure = claimed(inventory.registry.figures, 'player')!;
  const yawTurn = axisRotation([0, 1, 0], yaw);
  const viewTurn = multiplyRotation(yawTurn, axisRotation([1, 0, 0], pitch));
  const eye = add(feet, rotateVector(yawTurn, pose.eye).map((v) => v / blockSize) as Vec3);
  const pivot: Vec3 = [pose.hip[0], pose.hip[1] - pose.hipDrop, pose.hip[2]];
  const eyeRadius = Math.hypot(...sub((pose.unleaned ?? pose).eye, pivot));
  const result: LeanBox[] = [{ min: eye, max: eye, radius: eyeRadius / blockSize }];
  for (const side of ['left', 'right'] as const satisfies readonly HandSide[]) {
    const item = inventory.hands[side];
    if (!(item && defOf(inventory.registry, item.type).firearm)) {
      continue;
    }
    const model = sightedFirearmModel(inventory.registry, item);
    if (!(model?.grip && model.anchors?.muzzle)) {
      continue;
    }
    const transform = heldFirearmTransform({
      holds: figure.holds,
      model,
      side,
      leadingSide: side,
      twoHanded: Boolean(defOf(inventory.registry, item.type).twoHanded),
      progress: progress(item.uid),
      aimingDownSights: ads,
      aimFrame,
      lookPitchRadians: pitch,
      loweredPitchRadians,
      stockSeat: pose.stockSeats[side],
      seatFrame: playerHeldSeatFrame(pose, pitch),
      adsEyes: pose.eyes,
      leanRollRadians: pose.lateralLean?.frame.rollRadians,
    });
    const worldBasis = transform.rootRotation.map(
      (column) => rotateVector(viewTurn, column).map((v) => v / blockSize) as Vec3,
    );
    const origin = add(eye, rotateVector(viewTurn, transform.rootOffset).map((v) => v / blockSize) as Vec3);
    for (const primitive of itemGeometry(inventory, item, model)) {
      const center = turn(worldBasis, primitive.center);
      const x = origin[0] + center[0];
      const y = origin[1] + center[1];
      const z = origin[2] + center[2];
      // Project each original primitive, not its enclosing view-space AABB: rotating that would enlarge the envelope.
      const ex = projectedExtent(worldBasis, primitive.halfAxes, 0);
      const ey = projectedExtent(worldBasis, primitive.halfAxes, 1);
      const ez = projectedExtent(worldBasis, primitive.halfAxes, 2);
      result.push({
        min: [x - ex, y - ey, z - ez],
        max: [x + ex, y + ey, z + ez],
        radius: (eyeRadius + primitiveRadius(primitive, transform.rootRotation, transform.rootOffset)) / blockSize,
      });
    }
  }
  return result;
};
