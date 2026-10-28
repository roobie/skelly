import type { AimFrame } from './aim.ts';
import { attachmentFrame } from './attachmentFrame.ts';
import type { ModelDef, Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import { sightedFirearmModel } from './firearmSight.ts';
import { heldFirearmTransform, modelToView } from './heldPose.ts';
import type { HandSide, Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { LeanBox } from './lean.ts';
import { type PlayerLookPose, playerHeldSeatFrame } from './playerLookPose.ts';
import { add, axisRotation, multiplyRotation, rotateVector, sub } from './spatial.ts';

const corners = ({ min, max }: { readonly min: Vec3; readonly max: Vec3 }): Vec3[] =>
  [min[0], max[0]].flatMap((x) => [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z): Vec3 => [x, y, z])));

const itemModel = (registry: Registry, item: Item): ModelDef | undefined => {
  const id = defOf(registry, item.type).model;
  return id === undefined ? undefined : registry.models.get(id);
};

const collisionPoints = (registry: Registry, item: Item, model: ModelDef): Vec3[][] => {
  const boxes = [
    ...(model.collision ?? []),
    ...Object.values(model.parts ?? {}).flatMap((part) => part.collision ?? []),
  ].map(corners);
  if (boxes.length === 0) {
    throw new Error(`Model ${model.id} needs drawn collision for lean`);
  }
  for (const [id, child] of Object.entries(item.slots ?? {})) {
    const slot = model.gun?.attachmentSlots?.find((entry) => entry.id === id);
    const childModel = child && itemModel(registry, child);
    const mountFrame = childModel?.gun?.attachment?.mountFrame;
    const magazineSlot = id === 'magazine' ? model.gun?.slots?.magazine : undefined;
    if (!(child && childModel && (magazineSlot || (slot && mountFrame)))) {
      continue;
    }
    const seat = magazineSlot
      ? attachmentFrame(magazineSlot)
      : attachmentFrame({ at: slot!.position, direction: slot!.direction, up: slot!.up, mountFrame: mountFrame! });
    boxes.push(
      ...collisionPoints(registry, child, childModel).map((points) =>
        points.map((point) => add(seat.at, rotateVector(seat.rotation, point))),
      ),
    );
  }
  return boxes;
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
  const figure = inventory.registry.figures.get(CORE_CONTENT_IDS.player)!;
  const yawTurn = axisRotation([0, 1, 0], yaw);
  const viewTurn = multiplyRotation(yawTurn, axisRotation([1, 0, 0], pitch));
  const eye = add(feet, rotateVector(yawTurn, pose.eye).map((v) => v / blockSize) as Vec3);
  const pivot: Vec3 = [pose.hip[0], pose.hip[1] - pose.hipDrop, pose.hip[2]];
  const box = (points: Vec3[], radius: number): LeanBox => ({
    min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]!))) as Vec3,
    max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]!))) as Vec3,
    radius,
  });
  const result = [box([eye], Math.hypot(...sub((pose.unleaned ?? pose).eye, pivot)) / blockSize)];
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
    for (const points of collisionPoints(inventory.registry, item, model)) {
      const local = points.map((point) => {
        const view = modelToView(model, sub(point, model.grip!.at));
        return add(
          transform.rootOffset,
          [0, 1, 2].map((axis) =>
            transform.rootRotation.reduce((sum, column, index) => sum + column[axis]! * view[index]!, 0),
          ) as Vec3,
        );
      });
      const world = local.map((point) => add(eye, rotateVector(viewTurn, point).map((v) => v / blockSize) as Vec3));
      const radius =
        (Math.hypot(...sub((pose.unleaned ?? pose).eye, pivot)) +
          Math.max(...local.map((point) => Math.hypot(...point)))) /
        blockSize;
      result.push(box(world, radius));
    }
  }
  return result;
};
