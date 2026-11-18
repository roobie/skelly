import { contentVehicleFrame, type FurnitureDef, type Registry, type VehicleFittingDef } from '@skelly/engine/content';
import { BLOCK_SIZE, type BlockEntity, rotationOf } from '@skelly/engine/world';
import { BoxGeometry, Group, Matrix4, Mesh, MeshLambertMaterial, type Object3D, Vector3 } from 'three';
import { applyItemStateLook } from './itemStateLook.ts';
import type { ModelLibrary } from './models.ts';

/** A furniture def's vehicle: its content blueprint and the fittings the wreck is without. */
export type VehicleLook = NonNullable<FurnitureDef['vehicle']>;

const liftMaterial = new MeshLambertMaterial({ color: '#277e78' });
const armMaterial = new MeshLambertMaterial({ color: '#e4b62f' });
const LIFT_ARM_HEIGHT = 0.12;
const boxGeometry = new BoxGeometry(1, 1, 1);

interface BoxShape {
  position: readonly [number, number, number];
  size: readonly [number, number, number];
}

const addBox = (group: Group, material: MeshLambertMaterial, blockSize: number, shape: BoxShape): void => {
  const mesh = new Mesh(boxGeometry, material);
  mesh.scale.set(shape.size[0] * blockSize, shape.size[1] * blockSize, shape.size[2] * blockSize);
  const [x, y, z] = shape.position;
  mesh.position.set(x * blockSize, y * blockSize, z * blockSize);
  group.add(mesh);
};

interface VehicleView {
  readonly blockSize?: number;
  readonly content?: ContentVehicleView | undefined;
}

/** What a vehicle look is drawn from: the registry that holds its blueprint, and the model library that draws its parts. */
export interface ContentVehicleView {
  readonly registry: Registry;
  readonly models: ModelLibrary;
}

const contentGroups = new WeakMap<ModelLibrary, { version: number; groups: Map<string, Group> }>();

/** One kept fitting as a posed holder: its part model cloned and wearing its authored finish, or nothing yet. */
const contentPart = (fitting: VehicleFittingDef, content: ContentVehicleView): Group | undefined => {
  const model = content.registry.items.get(fitting.part)?.model;
  const part = model === undefined ? undefined : content.models.part(model);
  if (!part) {
    return undefined;
  }
  part.traverse((object: Object3D) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  if (fitting.finish !== undefined && model !== undefined) {
    const finishLook = content.registry.vehicleFinishes.get(fitting.finish);
    if (finishLook) {
      const { id: _id, ...finish } = finishLook;
      applyItemStateLook(part, { model, state: { finish }, slots: [], hidden: [], key: '' }, content.registry);
    }
  }
  const holder = new Group();
  holder.position.set(fitting.at[0], fitting.at[1], fitting.at[2]);
  holder.scale.x = fitting.mirror === true ? -1 : 1;
  holder.add(part);
  return holder;
};

/**
 * A blueprint's fitted part models, cached per blueprint and `removed` set, in the piece's pose. The parts' own
 * models are authored in the model frame — z forward, y up, the near side at −x, metres, origin at the vehicle's
 * ground centre — and the piece's front is local −z, so each part turns 180° about y when it is placed. The kept
 * parts stand in the piece by `packages/engine/src/core/vehicleShapeSolid.ts`, `contentVehicleFrame`, the frame its
 * collision is read in, so the piece is drawn where it stops movement. A part whose model is still loading is
 * skipped, and the piece restages when the library's version rises (see `furniture.ts`, `sync`).
 */
const contentDisplay = (look: VehicleLook, content: ContentVehicleView): Group => {
  let cache = contentGroups.get(content.models);
  if (cache === undefined || cache.version !== content.models.version) {
    cache = { version: content.models.version, groups: new Map() };
    contentGroups.set(content.models, cache);
  }
  const key = JSON.stringify([look.blueprint, look.removed]);
  let group = cache.groups.get(key);
  if (group === undefined) {
    group = new Group();
    const { cx, cy, cz } = contentVehicleFrame(content.registry, look);
    const centre = new Group();
    centre.position.set(cx, -cy, cz);
    for (const fitting of content.registry.vehicleBlueprints.get(look.blueprint)?.fittings ?? []) {
      if (!look.removed.includes(fitting.id)) {
        const holder = contentPart(fitting, content);
        if (holder) {
          centre.add(holder);
        }
      }
    }
    centre.rotation.y = Math.PI;
    group.add(centre);
    cache.groups.set(key, group);
  }
  return group.clone();
};

/**
 * Renders a furniture def's vehicle look in the piece's pose, standing on the piece's own floor. Collision turns the
 * piece about its box's centre (`packages/engine/src/core/orientation.ts`, `rotatedPoint`), so the look is anchored
 * there too: the box's centre less half the piece's own height along its local up, which is the world floor centre
 * only while the piece stands upright.
 */
export const vehicleModel = (
  entity: BlockEntity,
  look: VehicleLook,
  { blockSize = BLOCK_SIZE, content }: VehicleView = {},
): Group => {
  const group = new Group();
  if (!content) {
    return group;
  }
  const [right, up, back] = rotationOf(entity).map((axis) => new Vector3(...axis));
  group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right!, up!, back!));
  const [x, y, z] = entity.pos;
  const [width, height, depth] = entity.size;
  // The world box is the turned piece, so the piece's own height is the box's extent along its local up.
  const ownHeight = Math.abs(up!.x) * width + Math.abs(up!.y) * height + Math.abs(up!.z) * depth;
  group.position
    .set(x + width / 2, y + height / 2, z + depth / 2)
    .addScaledVector(up!, -ownHeight / 2)
    .multiplyScalar(blockSize);
  group.add(contentDisplay(look, content));
  return group;
};

/** A two-post lift whose collisionless arms support the raised vehicle visually. */
export const workshopLift = (entity: BlockEntity, blockSize = BLOCK_SIZE): Group => {
  const group = new Group();
  const [width, height, length] = entity.size;
  const feetY = entity.pos[1] - 1;
  const liftTop = entity.pos[1] + height - feetY;
  group.position.set(entity.pos[0] * blockSize, feetY * blockSize, entity.pos[2] * blockSize);
  const postX = [0.25, width - 0.45] as const;
  const postZ = length / 2;
  for (const x of postX) {
    addBox(group, liftMaterial, blockSize, {
      position: [x, liftTop / 2, postZ],
      size: [0.2, liftTop, 0.2],
    });
    for (const zOffset of [-2.1, 2.1]) {
      addBox(group, armMaterial, blockSize, {
        position: [x + (x < width / 2 ? 0.65 : -0.65), liftTop - LIFT_ARM_HEIGHT / 2, postZ + zOffset],
        size: [1.3, LIFT_ARM_HEIGHT, 0.18],
      });
    }
  }
  return group;
};
