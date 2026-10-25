import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { BlockEntity } from '../core/blockEntities.ts';
import type { FurnitureDef } from '../core/content.ts';
import { rotationOf } from '../core/orientation.ts';
import { BLOCK_SIZE } from '../core/scale.ts';
import { BLUEPRINTS } from '../vehicles/catalogue.ts';
import { MATERIALS } from '../vehicles/materials.ts';
import { newInstance, type Paint, VOXEL } from '../vehicles/model.ts';
import { fittedGrid } from '../vehicles/solid.ts';
import { GLASS, keyVoxel, type MeshBuffers, meshGrid, quadColors, type Rgb, voxelKey } from '../vehicles/voxels.ts';
import { addSkyOpeningAnchors } from './skyAnchor.ts';

/** A furniture def's procedural variant of a vehicle: its blueprint, paint, dirt and absent parts. */
export type VehicleLook = NonNullable<FurnitureDef['vehicle']>;

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

/** A shape's uncoloured geometry beside the buffers whose quad materials colour it. */
interface Part {
  readonly buffers: MeshBuffers;
  readonly geometry: BufferGeometry;
}

interface Shape {
  readonly solidBaseY: number;
  readonly solid: Part | undefined;
  readonly clear: Part | undefined;
}

const geometryOf = (
  buffers: MeshBuffers,
  lattice: readonly [number, number, number],
  materialAt: (cell: readonly [number, number, number]) => string | undefined,
  openings: readonly [number, number, number][],
): Part | undefined => {
  if (buffers.quads === 0) {
    return undefined;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(buffers.normals, 3));
  geometry.setIndex(new BufferAttribute(buffers.indices, 1));
  geometry.scale(VOXEL, VOXEL, VOXEL);
  const [length, , width] = lattice;
  geometry.translate((-length * 4 * VOXEL) / 2, 0, (-width * 4 * VOXEL) / 2);
  addSkyOpeningAnchors(geometry, {
    size: lattice.map((cells) => cells * 4 * VOXEL) as [number, number, number],
    cellSize: VOXEL,
    materialAt,
    isOpening: (material) => material === GLASS,
    openings,
  });
  geometry.computeBoundingSphere();
  return { buffers, geometry };
};

const shapes = new Map<string, Shape>();
const shapeOf = (blueprint: string, removed: readonly string[]): Shape => {
  const key = JSON.stringify([blueprint, removed]);
  let shape = shapes.get(key);
  if (shape === undefined) {
    const { grid, baseY } = fittedGrid(blueprint, removed);
    const { solid, clear } = meshGrid(grid, (material) => material === GLASS);
    const { lattice } = BLUEPRINTS[blueprint]!;
    const materialAt = (cell: readonly [number, number, number]) => grid.get(voxelKey(...cell));
    const openings = [...grid].filter(([, voxel]) => voxel === GLASS).map(([voxelAt]) => keyVoxel(voxelAt));
    shape = {
      solidBaseY: baseY * VOXEL,
      solid: geometryOf(solid, lattice, materialAt, openings),
      clear: geometryOf(clear, lattice, materialAt, openings),
    };
    shapes.set(key, shape);
  }
  return shape;
};

/** The shape's geometry with this look's colours; every other attribute is the shape's own, so it uploads once. */
const painted = (part: Part | undefined, colorOf: (material: string) => Rgb): BufferGeometry | undefined => {
  if (!part) {
    return undefined;
  }
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(part.geometry.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(part.geometry.index);
  geometry.setAttribute('color', new BufferAttribute(quadColors(part.buffers, colorOf), 3));
  geometry.boundingSphere = part.geometry.boundingSphere;
  return geometry;
};

// Paint and dirt change only colours, so looks that share a blueprint and stripped parts share one mesh.
const displays = new Map<string, Display>();
const displayOf = (look: VehicleLook): Display => {
  const key = JSON.stringify(look);
  let display = displays.get(key);
  if (display === undefined) {
    const { paint } = vehicleInstanceOf(look);
    const shape = shapeOf(look.blueprint, look.removed);
    const colorOf = (material: string) => rgb(paint, look.dirt, material);
    display = {
      solidBaseY: shape.solidBaseY,
      solidGeometry: painted(shape.solid, colorOf),
      clearGeometry: painted(shape.clear, colorOf),
    };
    displays.set(key, display);
  }
  return display;
};

const solidMaterial = new MeshLambertMaterial({ vertexColors: true });
solidMaterial.defines = { SKY_ANCHOR: '' };
const glassMaterial = new MeshPhongMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.36,
  shininess: 80,
  specular: 0x9a_aa_b4,
  depthWrite: false,
});
glassMaterial.defines = { SKY_ANCHOR: '' };

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

/** The model's forward +x turned to the piece's front, local −z. */
const FORWARD_TO_FRONT = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

/** Renders a furniture def's vehicle look in the piece's pose, standing on its lowest solid voxel. */
export const vehicleModel = (
  entity: BlockEntity,
  look: VehicleLook,
  pieceHeight: number,
  blockSize = BLOCK_SIZE,
): Group => {
  const group = new Group();
  const { solidBaseY, solidGeometry, clearGeometry } = displayOf(look);
  const [right, up, back] = rotationOf(entity).map((axis) => new Vector3(...axis));
  group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right!, up!, back!)).multiply(FORWARD_TO_FRONT);
  const [x, y, z] = entity.pos;
  const [width, height, depth] = entity.size;
  group.position
    .set(x + width / 2, y + height / 2, z + depth / 2)
    .addScaledVector(up!, -pieceHeight / 2)
    .multiplyScalar(blockSize)
    .addScaledVector(up!, -solidBaseY);
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
