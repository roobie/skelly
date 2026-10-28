import { attachmentFrame } from './attachmentFrame.ts';
import type { ModelDef, Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { modelToView } from './heldPose.ts';
import { defOf, type Item } from './items.ts';
import { add, rotateVector, sub } from './spatial.ts';

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

export interface LeanPrimitive {
  readonly center: Vec3;
  readonly halfAxes: readonly Vec3[];
  readonly corners: readonly Vec3[];
}

export const prepareLeanGeometry = (registry: Registry, item: Item, model: ModelDef): LeanPrimitive[] =>
  collisionPoints(registry, item, model).map((points) => {
    const view = points.map((point) => modelToView(model, sub(point, model.grip!.at)));
    return {
      center: view[0]!.map((value, axis) => (value + view[7]![axis]!) / 2) as Vec3,
      halfAxes: [4, 2, 1].map((index) => view[index]!.map((value, axis) => (value - view[0]![axis]!) / 2) as Vec3),
      corners: view,
    };
  });
