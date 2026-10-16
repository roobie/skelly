import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
} from 'three';
import type { BlockEntity } from '../core/blockEntities.ts';
import type { FurnitureDef } from '../core/content.ts';
import { BLOCK_SIZE } from '../core/scale.ts';
import { BLUEPRINTS, CATALOGUE } from '../vehicles/catalogue.ts';
import { MATERIALS } from '../vehicles/materials.ts';
import { newInstance, type Paint, PartLibrary, VOXEL } from '../vehicles/model.ts';
import { GLASS, keyVoxel, type MeshBuffers, meshGrid, type Rgb, type VoxelGrid } from '../vehicles/voxels.ts';

/** A furniture def's procedural variant of a vehicle: its blueprint, paint, dirt and absent parts. */
export type VehicleLook = NonNullable<FurnitureDef['vehicle']>;

const partLibrary = new PartLibrary(CATALOGUE);
const SEAM_DARKENING = 0.72;
const GRIME = new Color('#4a3b2c');
const GRIME_ON_PAINT = 0.65;
const GRIME_ON_PARTS = 0.4;

export const vehicleInstanceOf = (look: VehicleLook) => {
  const blueprint = BLUEPRINTS[look.blueprint]!;
  const seam = new Color(look.body).multiplyScalar(SEAM_DARKENING);
  return {
    ...newInstance(blueprint, `${look.blueprint}-${look.body}-${look.dirt}`, look.removed),
    paint: { body: look.body, seam: `#${seam.getHexString()}` } satisfies Paint,
  };
};

const rgb = (paint: Paint, dirt: number, material: string): Rgb => {
  const hex = material === 'paint' ? paint.body : (MATERIALS[material] ?? material);
  const color = new Color(material === 'seam' ? paint.seam : hex);
  if (material !== GLASS) {
    color.lerp(GRIME, dirt * (material === 'paint' || material === 'seam' ? GRIME_ON_PAINT : GRIME_ON_PARTS));
  }
  return [color.r, color.g, color.b];
};

interface Display {
  readonly solidBaseY: number;
  readonly solidGeometry: BufferGeometry | undefined;
  readonly clearGeometry: BufferGeometry | undefined;
}

const geometryOf = (buffers: MeshBuffers, lattice: readonly [number, number, number]): BufferGeometry | undefined => {
  if (buffers.quads === 0) {
    return undefined;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(buffers.colors, 3));
  geometry.setIndex(new BufferAttribute(buffers.indices, 1));
  geometry.scale(VOXEL, VOXEL, VOXEL);
  const [length, , width] = lattice;
  geometry.translate((-length * 4 * VOXEL) / 2, 0, (-width * 4 * VOXEL) / 2);
  geometry.computeBoundingSphere();
  return geometry;
};

const displays = new Map<string, Display>();
const displayOf = (look: VehicleLook): Display => {
  const key = JSON.stringify(look);
  let display = displays.get(key);
  if (display === undefined) {
    const instance = vehicleInstanceOf(look);
    const grid: VoxelGrid = new Map();
    for (const fitting of instance.fittings) {
      for (const [voxel, material] of partLibrary.placed(fitting).grid) {
        grid.set(voxel, material);
      }
    }
    const { solid, clear } = meshGrid(
      grid,
      (material) => rgb(instance.paint, look.dirt, material),
      (material) => material === GLASS,
    );
    const { lattice } = BLUEPRINTS[look.blueprint]!;
    display = {
      solidBaseY: Math.min(
        ...[...grid].flatMap(([voxel, material]) => (material === GLASS ? [] : [keyVoxel(voxel)[1] * VOXEL])),
      ),
      solidGeometry: geometryOf(solid, lattice),
      clearGeometry: geometryOf(clear, lattice),
    };
    displays.set(key, display);
  }
  return display;
};

const solidMaterial = new MeshLambertMaterial({ vertexColors: true });
const glassMaterial = new MeshPhongMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.36,
  shininess: 80,
  specular: 0x9a_aa_b4,
  depthWrite: false,
});

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

/** Renders a furniture def's vehicle look, standing on its lowest solid voxel. */
export const vehicleModel = (entity: BlockEntity, look: VehicleLook, blockSize = BLOCK_SIZE): Group => {
  const group = new Group();
  const { solidBaseY, solidGeometry, clearGeometry } = displayOf(look);
  group.position.set(
    (entity.pos[0] + entity.size[0] / 2) * blockSize,
    entity.pos[1] * blockSize - solidBaseY,
    (entity.pos[2] + entity.size[2] / 2) * blockSize,
  );
  group.rotation.y = Math.PI / 2;
  if (solidGeometry) {
    const mesh = new Mesh(solidGeometry, solidMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (clearGeometry) {
    const mesh = new Mesh(clearGeometry, glassMaterial);
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
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
