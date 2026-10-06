// biome-ignore lint/correctness/noUndeclaredDependencies: Deadvox reuses Mobgen's template through its existing source alias.
import { shambler } from '@mobgen/mob/templates.ts';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Vec3 } from '../core/coords.ts';
import { BLOCK_SIZE } from '../core/scale.ts';
import { DAY_SKY } from '../core/sky.ts';
import { FIGURE_BOXES } from '../core/zombieRegions.ts';
import { BUNDLED_CONTENT } from '../game/bundledContent.ts';
import { PlayerMeshes } from '../render/playerFigure.ts';
import { PLAYER_FIGURE_LAYER } from '../render/shadowFlags.ts';
import { applySky } from '../render/sky.ts';

const required = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Vehicle parts spike is missing ${selector}`);
  }
  return element;
};

const stage = required<HTMLElement>('#stage');
const error = required<HTMLElement>('#error');
const schematic = required<HTMLCanvasElement>('#schematic');
const schematicContext = schematic.getContext('2d');
if (!schematicContext) {
  throw new Error('Vehicle schematic canvas is unavailable');
}
const partsList = required<HTMLElement>('#parts-list');
const stats = required<HTMLElement>('#stats');
const layerButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-layer]')];
const buildButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-build]')];
const spinWheels = required<HTMLInputElement>('#spin-wheels');
const viewLabel = required<HTMLElement>('#vehicle-label');
const grainNote = required<HTMLElement>('#grain-note');

const PART_CELLS_PER_BLOCK = 4;
const PART_CELL = BLOCK_SIZE / PART_CELLS_PER_BLOCK;
const VOXEL_EDGE = shambler.voxelSize * 0.75;
const VOXELS_PER_PART_CELL = Math.round(PART_CELL / VOXEL_EDGE);
const CAR_CELLS = { x: 36, z: 16 } as const;
const VIEW_LAYERS = ['frame', 'under', 'interior', 'body', 'roof'] as const;
type PartLayer = (typeof VIEW_LAYERS)[number];
interface Voxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: string;
}
type VoxelBox = readonly [x: number, y: number, z: number, width: number, height: number, depth: number, color: string];
type Cell = readonly [x: number, z: number];
type Footprint = readonly [x: number, z: number];
interface PartInstance {
  readonly id: string;
  readonly type: PartId;
  readonly cell: Cell;
  readonly installed?: boolean;
  readonly elevation?: number;
}
interface PartDefinition {
  readonly id: string;
  readonly label: string;
  readonly short: string;
  readonly footprint: Footprint;
  readonly layer: PartLayer;
  readonly massKg: number;
  readonly elevation: number;
  readonly voxels: readonly Voxel[];
  readonly axlePivot?: boolean;
}

const isBoxSurface = (point: Vec3, origin: Vec3, size: Vec3): boolean => {
  const [x, y, z] = point;
  const [x0, y0, z0] = origin;
  const [width, height, depth] = size;
  return x === x0 || x === x0 + width - 1 || y === y0 || y === y0 + height - 1 || z === z0 || z === z0 + depth - 1;
};

const voxelBoxes = (...boxes: readonly VoxelBox[]): readonly Voxel[] => {
  const points = new Map<string, Voxel>();
  for (const [x0, y0, z0, width, height, depth, color] of boxes) {
    for (let x = x0; x < x0 + width; x += 1) {
      for (let y = y0; y < y0 + height; y += 1) {
        for (let z = z0; z < z0 + depth; z += 1) {
          if (!isBoxSurface([x, y, z], [x0, y0, z0], [width, height, depth])) {
            continue;
          }
          const voxel = { x, y, z, color };
          points.set(`${x},${y},${z}`, voxel);
        }
      }
    }
  }
  return [...points.values()];
};

const wheelColor = (radius: number): string | undefined => {
  if (radius >= 8.5 && radius <= 11.5) {
    return '#292e31';
  }
  if (radius >= 5 && radius < 8.5) {
    return '#9b9d91';
  }
  if (radius < 2.5) {
    return '#555b5b';
  }
  return undefined;
};

const wheelVoxels = (): readonly Voxel[] => {
  const points: Voxel[] = [];
  for (let x = 0; x < 24; x += 1) {
    for (let y = 0; y < 24; y += 1) {
      const radius = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
      const color = wheelColor(radius);
      if (!color) {
        continue;
      }
      for (let z = 0; z < 8; z += 1) {
        points.push({ x, y, z, color });
      }
    }
  }
  return points;
};

// Part models are local voxel data; build records below only place these fittings.
const PART_TYPES = {
  'frame-rail': {
    id: 'frame-rail',
    label: 'Frame rail',
    short: 'rail',
    footprint: [4, 1],
    layer: 'frame',
    massKg: 10,
    elevation: 0,
    voxels: voxelBoxes([0, 0, 0, 16, 3, 4, '#596263'], [2, 3, 0, 12, 2, 4, '#747d78']),
  },
  crossmember: {
    id: 'crossmember',
    label: 'Crossmember',
    short: 'cross',
    footprint: [2, 10],
    layer: 'frame',
    massKg: 14,
    elevation: 0,
    voxels: voxelBoxes([0, 0, 0, 8, 4, 40, '#68716d'], [0, 4, 12, 8, 2, 16, '#859087']),
  },
  'floor-section': {
    id: 'floor-section',
    label: 'Floor section',
    short: 'floor',
    footprint: [4, 10],
    layer: 'under',
    massKg: 15,
    elevation: 4,
    voxels: voxelBoxes([0, 0, 0, 16, 2, 40, '#626a67']),
  },
  suspension: {
    id: 'suspension',
    label: 'Suspension mount',
    short: 'susp',
    footprint: [2, 2],
    layer: 'under',
    massKg: 9,
    elevation: 2,
    voxels: voxelBoxes([0, 0, 0, 8, 4, 8, '#6b706a'], [2, 4, 2, 4, 4, 4, '#8d8776']),
  },
  wheel: {
    id: 'wheel',
    label: 'Wheel and axle',
    short: 'wheel',
    footprint: [6, 2],
    layer: 'under',
    massKg: 19,
    elevation: 0,
    voxels: wheelVoxels(),
    axlePivot: true,
  },
  engine: {
    id: 'engine',
    label: 'Engine',
    short: 'engine',
    footprint: [6, 6],
    layer: 'under',
    massKg: 145,
    elevation: 6,
    voxels: voxelBoxes(
      [0, 0, 0, 24, 12, 24, '#5b6260'],
      [4, 12, 3, 16, 7, 18, '#8a765c'],
      [7, 19, 7, 10, 3, 10, '#474c4a'],
    ),
  },
  transmission: {
    id: 'transmission',
    label: 'Transmission',
    short: 'gear',
    footprint: [4, 4],
    layer: 'under',
    massKg: 34,
    elevation: 4,
    voxels: voxelBoxes([0, 0, 0, 16, 9, 16, '#68685f'], [4, 9, 4, 8, 4, 8, '#898576']),
  },
  'fuel-tank': {
    id: 'fuel-tank',
    label: 'Fuel tank',
    short: 'tank',
    footprint: [6, 5],
    layer: 'under',
    massKg: 48,
    elevation: 4,
    voxels: voxelBoxes([0, 0, 0, 24, 9, 20, '#405d4b'], [3, 9, 3, 18, 3, 14, '#586e56']),
  },
  seat: {
    id: 'seat',
    label: 'Seat',
    short: 'seat',
    footprint: [3, 3],
    layer: 'interior',
    massKg: 16,
    elevation: 18,
    voxels: voxelBoxes(
      [0, 0, 0, 12, 4, 12, '#907859'],
      [4, 4, 1, 4, 18, 10, '#a48b67'],
      [5, 22, 2, 2, 3, 8, '#5d5142'],
    ),
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    short: 'dash',
    footprint: [4, 12],
    layer: 'interior',
    massKg: 18,
    elevation: 20,
    voxels: voxelBoxes([0, 0, 0, 16, 9, 48, '#343a3a'], [2, 9, 4, 12, 4, 40, '#676c63']),
  },
  steering: {
    id: 'steering',
    label: 'Steering wheel',
    short: 'steer',
    footprint: [2, 2],
    layer: 'interior',
    massKg: 4,
    elevation: 24,
    voxels: voxelBoxes([2, 0, 2, 4, 15, 4, '#77786e'], [0, 12, 2, 8, 2, 4, '#b4aa90'], [2, 10, 0, 4, 5, 8, '#8b8d82']),
  },
  door: {
    id: 'door',
    label: 'Door',
    short: 'door',
    footprint: [10, 1],
    layer: 'body',
    massKg: 31,
    elevation: 17,
    voxels: voxelBoxes(
      [0, 0, 0, 40, 11, 4, '#68726f'],
      [5, 11, 0, 30, 9, 4, '#78939a'],
      [0, 20, 0, 40, 2, 4, '#727c77'],
    ),
  },
  hood: {
    id: 'hood',
    label: 'Hood',
    short: 'hood',
    footprint: [8, 12],
    layer: 'body',
    massKg: 37,
    elevation: 22,
    voxels: voxelBoxes([0, 0, 0, 32, 4, 48, '#68726f'], [5, 4, 5, 22, 2, 38, '#7c8580']),
  },
  tailgate: {
    id: 'tailgate',
    label: 'Tailgate',
    short: 'tail',
    footprint: [5, 12],
    layer: 'body',
    massKg: 29,
    elevation: 6,
    voxels: voxelBoxes([0, 0, 0, 20, 22, 4, '#69736e'], [4, 13, 0, 12, 7, 4, '#78939a']),
  },
  windshield: {
    id: 'windshield',
    label: 'Windshield',
    short: 'glass',
    footprint: [1, 12],
    layer: 'body',
    massKg: 11,
    elevation: 24,
    voxels: voxelBoxes([0, 0, 0, 4, 20, 48, '#8aabb0']),
  },
  'roof-panel': {
    id: 'roof-panel',
    label: 'Roof panel',
    short: 'roof',
    footprint: [16, 12],
    layer: 'roof',
    massKg: 42,
    elevation: 43,
    voxels: voxelBoxes([0, 0, 0, 64, 3, 48, '#626b66'], [3, 3, 3, 58, 2, 42, '#778078']),
  },
  'roof-rack': {
    id: 'roof-rack',
    label: 'Roof rack',
    short: 'rack',
    footprint: [8, 8],
    layer: 'roof',
    massKg: 24,
    elevation: 48,
    voxels: voxelBoxes(
      [0, 0, 0, 32, 2, 3, '#6e716a'],
      [0, 0, 29, 32, 2, 3, '#6e716a'],
      [0, 0, 0, 3, 2, 32, '#8a8c7e'],
      [29, 0, 0, 3, 2, 32, '#8a8c7e'],
    ),
  },
  'armour-plate': {
    id: 'armour-plate',
    label: 'Armour plate',
    short: 'armour',
    footprint: [4, 12],
    layer: 'body',
    massKg: 58,
    elevation: 16,
    voxels: voxelBoxes([0, 0, 0, 16, 19, 4, '#565c56'], [3, 19, 0, 10, 3, 4, '#858a7b']),
  },
  bumper: {
    id: 'bumper',
    label: 'Bumper',
    short: 'bumper',
    footprint: [2, 14],
    layer: 'body',
    massKg: 22,
    elevation: 3,
    voxels: voxelBoxes([0, 0, 0, 8, 5, 56, '#74796f'], [1, 5, 4, 6, 2, 48, '#484e4c']),
  },
  'roof-support': {
    id: 'roof-support',
    label: 'Roof support',
    short: 'post',
    footprint: [1, 1],
    layer: 'body',
    massKg: 8,
    elevation: 18,
    voxels: voxelBoxes([0, 0, 0, 4, 25, 4, '#65706c']),
  },
} as const satisfies Record<string, PartDefinition>;
type PartId = keyof typeof PART_TYPES;

const part = (
  id: string,
  type: PartId,
  cell: Cell,
  options: { readonly installed?: boolean; readonly elevation?: number } = {},
): PartInstance => ({ id, type, cell, ...options });

const CHASSIS: readonly PartInstance[] = [
  part('rail-near-0', 'frame-rail', [0, 2]),
  part('rail-near-1', 'frame-rail', [4, 2]),
  part('rail-near-2', 'frame-rail', [8, 2]),
  part('rail-near-3', 'frame-rail', [12, 2]),
  part('rail-near-4', 'frame-rail', [16, 2]),
  part('rail-near-5', 'frame-rail', [20, 2]),
  part('rail-near-6', 'frame-rail', [24, 2]),
  part('rail-near-7', 'frame-rail', [28, 2]),
  part('rail-near-8', 'frame-rail', [32, 2]),
  part('rail-far-0', 'frame-rail', [0, 13]),
  part('rail-far-1', 'frame-rail', [4, 13]),
  part('rail-far-2', 'frame-rail', [8, 13]),
  part('rail-far-3', 'frame-rail', [12, 13]),
  part('rail-far-4', 'frame-rail', [16, 13]),
  part('rail-far-5', 'frame-rail', [20, 13]),
  part('rail-far-6', 'frame-rail', [24, 13]),
  part('rail-far-7', 'frame-rail', [28, 13]),
  part('rail-far-8', 'frame-rail', [32, 13]),
  part('cross-rear', 'crossmember', [2, 3]),
  part('cross-rear-seat', 'crossmember', [8, 3]),
  part('cross-front-seat', 'crossmember', [17, 3]),
  part('cross-front', 'crossmember', [28, 3]),
  part('floor-rear-0', 'floor-section', [0, 3]),
  part('floor-rear-1', 'floor-section', [4, 3]),
  part('floor-mid-0', 'floor-section', [8, 3]),
  part('floor-mid-1', 'floor-section', [12, 3]),
  part('floor-mid-2', 'floor-section', [16, 3]),
  part('floor-mid-3', 'floor-section', [20, 3]),
  part('floor-front-0', 'floor-section', [24, 3]),
];

const RUNNING_GEAR: readonly PartInstance[] = [
  part('suspension-rear-near', 'suspension', [4, 1]),
  part('suspension-rear-far', 'suspension', [4, 13]),
  part('suspension-front-near', 'suspension', [27, 1]),
  part('suspension-front-far', 'suspension', [27, 13]),
  part('wheel-rear-near', 'wheel', [3, 0]),
  part('wheel-rear-far', 'wheel', [3, 14]),
  part('wheel-front-near', 'wheel', [27, 0]),
  part('wheel-front-far', 'wheel', [27, 14]),
  part('transmission', 'transmission', [21, 6]),
  part('engine', 'engine', [28, 5]),
  part('fuel-tank', 'fuel-tank', [3, 5]),
];

const CABIN: readonly PartInstance[] = [
  part('seat-driver', 'seat', [19, 4]),
  part('seat-passenger', 'seat', [19, 9]),
  part('seat-rear-near', 'seat', [10, 4]),
  part('seat-rear-far', 'seat', [10, 9]),
  part('dashboard', 'dashboard', [26, 2]),
  part('steering-wheel', 'steering', [29, 5]),
];

const HATCHBACK_PARTS: readonly PartInstance[] = [
  ...CHASSIS,
  ...RUNNING_GEAR,
  ...CABIN,
  part('hatch-hood', 'hood', [28, 2]),
  part('hatch-windshield', 'windshield', [27, 2]),
  part('hatch-tailgate', 'tailgate', [1, 2]),
  part('hatch-door-near', 'door', [13, 15], { installed: false, elevation: 17 }),
  part('hatch-door-far', 'door', [13, 0], { elevation: 17 }),
  part('hatch-roof', 'roof-panel', [11, 2]),
  part('hatch-roof-rack', 'roof-rack', [15, 4], { installed: false }),
  part('hatch-armour', 'armour-plate', [17, 0], { installed: false }),
  part('hatch-front-bumper', 'bumper', [34, 1]),
  part('hatch-rear-bumper', 'bumper', [0, 1]),
];

const RANGE_ROVER_PARTS: readonly PartInstance[] = [
  ...CHASSIS,
  ...RUNNING_GEAR,
  ...CABIN,
  part('rover-hood', 'hood', [28, 2]),
  part('rover-windshield', 'windshield', [27, 2]),
  part('rover-tailgate', 'tailgate', [1, 2]),
  part('rover-door-front-near', 'door', [13, 15], { elevation: 17 }),
  part('rover-door-front-far', 'door', [13, 0], { elevation: 17 }),
  part('rover-door-rear-near', 'door', [21, 15], { elevation: 17 }),
  part('rover-door-rear-far', 'door', [21, 0], { elevation: 17 }),
  part('rover-roof-front', 'roof-panel', [4, 2], { elevation: 43 }),
  part('rover-roof-rear', 'roof-panel', [20, 2], { elevation: 43 }),
  part('rover-roof-rack', 'roof-rack', [17, 4]),
  part('rover-armour-front-near', 'armour-plate', [28, 0]),
  part('rover-armour-front-far', 'armour-plate', [28, 4]),
  part('rover-armour-rear-near', 'armour-plate', [3, 0]),
  part('rover-armour-rear-far', 'armour-plate', [3, 4]),
  part('rover-front-post-near', 'roof-support', [27, 1]),
  part('rover-front-post-far', 'roof-support', [27, 14]),
  part('rover-rear-post-near', 'roof-support', [10, 1]),
  part('rover-rear-post-far', 'roof-support', [10, 14]),
  part('rover-front-bumper', 'bumper', [34, 1]),
  part('rover-rear-bumper', 'bumper', [0, 1]),
];

const VEHICLES = {
  hatchback: { id: 'hatchback', label: 'Hatchback · cutaway', parts: HATCHBACK_PARTS, removed: [] },
  rover: { id: 'rover', label: 'Boxy 4×4', parts: RANGE_ROVER_PARTS, removed: [] },
  stripped: {
    id: 'stripped',
    label: 'Same 4×4 · stripped on lift',
    base: 'rover',
    removed: [
      'rover-hood',
      'rover-windshield',
      'rover-tailgate',
      'rover-door-front-near',
      'rover-door-front-far',
      'rover-door-rear-near',
      'rover-door-rear-far',
      'rover-roof-front',
      'rover-roof-rear',
      'rover-roof-rack',
      'rover-armour-front-near',
      'rover-armour-front-far',
      'rover-armour-rear-near',
      'rover-armour-rear-far',
      'rover-front-post-near',
      'rover-front-post-far',
      'rover-rear-post-near',
      'rover-rear-post-far',
      'rover-front-bumper',
      'rover-rear-bumper',
    ],
  },
} as const;
type VehicleId = keyof typeof VEHICLES;

const fittingsFor = (vehicle: VehicleId): readonly PartInstance[] => {
  const spec = VEHICLES[vehicle];
  return 'base' in spec ? VEHICLES[spec.base].parts : spec.parts;
};

const colorFor = (type: PartId): string => PART_TYPES[type].voxels[0]?.color ?? '#777777';
const geometryCache = new Map<PartId, BufferGeometry>();
const voxelMaterial = new MeshLambertMaterial({ vertexColors: true });
const buildStates = new Map<VehicleId, Set<string>>();
let activeBuild: VehicleId = 'hatchback';
let activeLayer: PartLayer = 'body';
let vehicleGroup = new Group();
let wheelPivots: Group[] = [];
let liftGroup: Group | undefined;

const initialState = (vehicle: VehicleId): Set<string> => {
  const spec = VEHICLES[vehicle];
  const removed = new Set<string>(spec.removed);
  return new Set(
    fittingsFor(vehicle)
      .filter((fitting) => fitting.installed !== false && !removed.has(fitting.id))
      .map((fitting) => fitting.id),
  );
};

const getBuildState = (vehicle: VehicleId): Set<string> => {
  let state = buildStates.get(vehicle);
  if (!state) {
    state = initialState(vehicle);
    buildStates.set(vehicle, state);
  }
  return state;
};

const occupiedVoxels = (voxels: readonly Voxel[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const voxel of voxels) {
    map.set(`${voxel.x},${voxel.y},${voxel.z}`, voxel.color);
  }
  return map;
};

const faceCorners: readonly { readonly neighbor: Vec3; readonly normal: Vec3; readonly corners: readonly Vec3[] }[] = [
  {
    neighbor: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    neighbor: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    neighbor: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    neighbor: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    neighbor: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
  },
  {
    neighbor: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
];

const buildPartGeometry = (type: PartId): BufferGeometry => {
  const cached = geometryCache.get(type);
  if (cached) {
    return cached;
  }
  const points = occupiedVoxels(PART_TYPES[type].voxels);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  for (const [key, color] of points) {
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    const tint = new Color(color);
    for (const face of faceCorners) {
      const [nx, ny, nz] = face.neighbor;
      if (points.has(`${x + nx},${y + ny},${z + nz}`)) {
        continue;
      }
      const corners = [
        face.corners[0]!,
        face.corners[1]!,
        face.corners[2]!,
        face.corners[0]!,
        face.corners[2]!,
        face.corners[3]!,
      ];
      for (const corner of corners) {
        const [cx, cy, cz] = corner;
        positions.push((x + cx) * VOXEL_EDGE, (y + cy) * VOXEL_EDGE, (z + cz) * VOXEL_EDGE);
        normals.push(...face.normal);
        colors.push(tint.r, tint.g, tint.b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.computeBoundingSphere();
  geometryCache.set(type, geometry);
  return geometry;
};

const installedInstances = (): readonly PartInstance[] => {
  const state = getBuildState(activeBuild);
  return fittingsFor(activeBuild).filter((fitting) => state.has(fitting.id));
};

const measureVehicle = (installed: readonly PartInstance[]): { mass: number; comX: number; comZ: number } => {
  let mass = 0;
  let weightedX = 0;
  let weightedZ = 0;
  for (const fitting of installed) {
    const definition = PART_TYPES[fitting.type];
    const x = (fitting.cell[0] + definition.footprint[0] / 2 - CAR_CELLS.x / 2) * PART_CELL;
    const z = (fitting.cell[1] + definition.footprint[1] / 2 - CAR_CELLS.z / 2) * PART_CELL;
    mass += definition.massKg;
    weightedX += x * definition.massKg;
    weightedZ += z * definition.massKg;
  }
  return { mass, comX: mass ? weightedX / mass : 0, comZ: mass ? weightedZ / mass : 0 };
};

const addLift = (): Group => {
  const group = new Group();
  const steel = new MeshLambertMaterial({ color: '#6c706a' });
  const yellow = new MeshLambertMaterial({ color: '#b3985d' });
  const add = (size: Vec3, at: Vec3, material: MeshLambertMaterial): void => {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.position.set(...at);
    group.add(mesh);
  };
  for (const x of [-1.7, 1.7]) {
    for (const z of [-0.8, 0.8]) {
      add([0.12, 1.35, 0.12], [x, 0.68, z], steel);
    }
    add([0.18, 0.12, 2.0], [x, 1.32, 0], yellow);
  }
  return group;
};

const clearGroup = (group: Group): void => {
  for (const child of [...group.children]) {
    group.remove(child);
  }
};

const renderVehicle = (): void => {
  if (liftGroup) {
    scene.remove(liftGroup);
    liftGroup = undefined;
  }
  scene.remove(vehicleGroup);
  clearGroup(vehicleGroup);
  wheelPivots = [];
  vehicleGroup = new Group();
  const installed = installedInstances();
  for (const fitting of installed) {
    const definition = PART_TYPES[fitting.type];
    const startX = fitting.cell[0] * PART_CELL - (CAR_CELLS.x * PART_CELL) / 2;
    const startZ = fitting.cell[1] * PART_CELL - (CAR_CELLS.z * PART_CELL) / 2;
    const geometry = buildPartGeometry(fitting.type);
    if ('axlePivot' in definition && definition.axlePivot) {
      const pivot = new Group();
      const width = definition.footprint[0] * PART_CELL;
      const depth = definition.footprint[1] * PART_CELL;
      pivot.position.set(
        startX + width / 2,
        (fitting.elevation ?? definition.elevation) * VOXEL_EDGE + 12 * VOXEL_EDGE,
        startZ + depth / 2,
      );
      const mesh = new Mesh(geometry, voxelMaterial);
      mesh.position.set(-width / 2, -12 * VOXEL_EDGE, -depth / 2);
      pivot.add(mesh);
      vehicleGroup.add(pivot);
      wheelPivots.push(pivot);
    } else {
      const mesh = new Mesh(geometry, voxelMaterial);
      mesh.position.set(startX, (fitting.elevation ?? definition.elevation) * VOXEL_EDGE, startZ);
      vehicleGroup.add(mesh);
    }
  }
  if (activeBuild === 'stripped') {
    liftGroup = addLift();
    scene.add(liftGroup);
    vehicleGroup.position.y = 1.35;
  }
  scene.add(vehicleGroup);
  const { mass, comX, comZ } = measureVehicle(installed);
  stats.textContent = `${installed.length} installed fittings · ${mass.toLocaleString()} kg · centre of mass ${comX >= 0 ? '+' : ''}${comX.toFixed(2)} m forward, ${comZ >= 0 ? '+' : ''}${comZ.toFixed(2)} m passenger-side`;
  viewLabel.textContent = VEHICLES[activeBuild].label;
  for (const button of buildButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.build === activeBuild));
  }
  drawSchematic();
  drawPartsList();
  scheduleRender();
};

const drawSchematic = (): void => {
  const ctx = schematicContext;
  const { width, height } = schematic;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#171b20';
  ctx.fillRect(0, 0, width, height);
  const cell = Math.min((width - 100) / CAR_CELLS.x, (height - 72) / CAR_CELLS.z);
  const x0 = Math.round((width - cell * CAR_CELLS.x) / 2);
  const z0 = Math.round((height - cell * CAR_CELLS.z) / 2) + 8;
  ctx.font = `${Math.max(10, cell * 0.75)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d9cda8';
  ctx.fillText('REAR', x0 - 28, z0 + (cell * CAR_CELLS.z) / 2);
  ctx.fillText('FRONT →', x0 + cell * CAR_CELLS.x + 40, z0 + (cell * CAR_CELLS.z) / 2);
  ctx.strokeStyle = '#343b42';
  ctx.lineWidth = 1;
  for (let x = 0; x <= CAR_CELLS.x; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x0 + x * cell, z0);
    ctx.lineTo(x0 + x * cell, z0 + CAR_CELLS.z * cell);
    ctx.stroke();
  }
  for (let z = 0; z <= CAR_CELLS.z; z += 1) {
    ctx.beginPath();
    ctx.moveTo(x0, z0 + z * cell);
    ctx.lineTo(x0 + CAR_CELLS.x * cell, z0 + z * cell);
    ctx.stroke();
  }
  const state = getBuildState(activeBuild);
  const visible = fittingsFor(activeBuild).filter((fitting) => PART_TYPES[fitting.type].layer === activeLayer);
  for (const fitting of visible) {
    const definition = PART_TYPES[fitting.type];
    const [x, z] = fitting.cell;
    const [footX, footZ] = definition.footprint;
    const left = x0 + x * cell;
    const top = z0 + z * cell;
    const present = state.has(fitting.id);
    ctx.fillStyle = present ? colorFor(fitting.type) : '#252a2d';
    ctx.globalAlpha = present ? 0.82 : 0.35;
    ctx.fillRect(left + 1, top + 1, footX * cell - 2, footZ * cell - 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = present ? '#d9ddcf' : colorFor(fitting.type);
    ctx.setLineDash(present ? [] : [4, 3]);
    ctx.strokeRect(left + 1, top + 1, footX * cell - 2, footZ * cell - 2);
    ctx.setLineDash([]);
    if (footX * cell > 34 && footZ * cell > 16) {
      ctx.fillStyle = '#101416';
      ctx.fillText(definition.short, left + (footX * cell) / 2, top + (footZ * cell) / 2);
    }
  }
  const { mass, comX, comZ } = measureVehicle(installedInstances());
  if (mass) {
    const cx = x0 + (CAR_CELLS.x / 2 + comX / PART_CELL) * cell;
    const cz = z0 + (CAR_CELLS.z / 2 + comZ / PART_CELL) * cell;
    ctx.strokeStyle = '#ffcf67';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cz);
    ctx.lineTo(cx + 7, cz);
    ctx.moveTo(cx, cz - 7);
    ctx.lineTo(cx, cz + 7);
    ctx.stroke();
    ctx.fillStyle = '#ffcf67';
    ctx.fillText('COM', cx, cz - 10);
  }
};

const togglePart = (id: string): void => {
  const state = getBuildState(activeBuild);
  if (state.has(id)) {
    state.delete(id);
  } else {
    state.add(id);
  }
  renderVehicle();
};

const drawPartsList = (): void => {
  partsList.replaceChildren();
  const state = getBuildState(activeBuild);
  const visible = fittingsFor(activeBuild).filter((fitting) => PART_TYPES[fitting.type].layer === activeLayer);
  for (const fitting of visible) {
    const definition = PART_TYPES[fitting.type];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'part-toggle';
    button.setAttribute('aria-pressed', String(state.has(fitting.id)));
    button.textContent = `${state.has(fitting.id) ? '●' : '○'} ${definition.label} · ${fitting.id}`;
    button.addEventListener('click', () => togglePart(fitting.id));
    partsList.append(button);
  }
  for (const button of layerButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.layer === activeLayer));
  }
};

const setBuild = (id: VehicleId): void => {
  activeBuild = id;
  renderVehicle();
};

for (const button of buildButtons) {
  button.addEventListener('click', () => {
    const id = button.dataset.build as VehicleId | undefined;
    if (id && id in VEHICLES) {
      setBuild(id);
    }
  });
}
for (const button of layerButtons) {
  button.addEventListener('click', () => {
    const layer = button.dataset.layer as PartLayer | undefined;
    if (layer && VIEW_LAYERS.includes(layer)) {
      activeLayer = layer;
      drawSchematic();
      drawPartsList();
    }
  });
}

schematic.addEventListener('pointerdown', (event) => {
  const bounds = schematic.getBoundingClientRect();
  const px = (event.clientX - bounds.left) * (schematic.width / bounds.width);
  const py = (event.clientY - bounds.top) * (schematic.height / bounds.height);
  const cell = Math.min((schematic.width - 100) / CAR_CELLS.x, (schematic.height - 72) / CAR_CELLS.z);
  const x0 = Math.round((schematic.width - cell * CAR_CELLS.x) / 2);
  const z0 = Math.round((schematic.height - cell * CAR_CELLS.z) / 2) + 8;
  const x = Math.floor((px - x0) / cell);
  const z = Math.floor((py - z0) / cell);
  if (x < 0 || z < 0 || x >= CAR_CELLS.x || z >= CAR_CELLS.z) {
    return;
  }
  const visible = fittingsFor(activeBuild).filter((fitting) => PART_TYPES[fitting.type].layer === activeLayer);
  const hit = [...visible].reverse().find(({ type, cell: [left, top] }) => {
    const [width, depth] = PART_TYPES[type].footprint;
    return x >= left && x < left + width && z >= top && z < top + depth;
  });
  if (hit) {
    togglePart(hit.id);
  }
});

const scene = new Scene();
const camera = new PerspectiveCamera(42, 1, 0.05, 96);
camera.position.set(5.8, 4.7, 7.2);
camera.lookAt(0, 0.7, 0);
camera.layers.enable(PLAYER_FIGURE_LAYER);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 1));
renderer.outputColorSpace = SRGBColorSpace;
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);
const sunlight = new DirectionalLight();
const ambient = new HemisphereLight();
scene.add(sunlight, sunlight.target, ambient);
applySky({ scene, light: sunlight, ambient, camera, radiusM: 96 }, DAY_SKY);
const ground = new Mesh(new PlaneGeometry(500, 500), new MeshLambertMaterial({ color: 0x66_66_5e }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.04;
scene.add(ground);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);
controls.enableDamping = false;
controls.minDistance = 5;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.48;

const renderScene = (): void => {
  controls.update();
  renderer.render(scene, camera);
};
let scheduledRender: number | undefined;
const scheduleRender = (): void => {
  if (scheduledRender !== undefined) {
    return;
  }
  scheduledRender = requestAnimationFrame(() => {
    scheduledRender = undefined;
    renderScene();
  });
};

const panDirection = new Vector3();
const panRight = new Vector3();
const panUp = new Vector3(0, 1, 0);
globalThis.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || document.activeElement === spinWheels) {
    return;
  }
  camera.getWorldDirection(panDirection);
  panDirection.y = 0;
  panDirection.normalize();
  panRight.crossVectors(panDirection, panUp).normalize();
  const movement = new Vector3();
  if (event.key === 'ArrowLeft') {
    movement.copy(panRight).negate();
  } else if (event.key === 'ArrowRight') {
    movement.copy(panRight);
  } else if (event.key === 'ArrowUp') {
    movement.copy(panDirection);
  } else if (event.key === 'ArrowDown') {
    movement.copy(panDirection).negate();
  } else {
    return;
  }
  event.preventDefault();
  camera.position.addScaledVector(movement, 0.8);
  controls.target.addScaledVector(movement, 0.8);
  scheduleRender();
});

const resize = (): void => {
  const width = Math.max(stage.clientWidth, 1);
  const height = Math.max(stage.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderScene();
};
new ResizeObserver(resize).observe(stage);
globalThis.addEventListener('error', (event) => {
  error.textContent = event.message;
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.buttons !== 0) {
    scheduleRender();
  }
});
renderer.domElement.addEventListener('pointerup', scheduleRender);
renderer.domElement.addEventListener('wheel', scheduleRender);

let wheelFrame = 0;
let previousWheelFrame = 0;
let previousWheelRender = 0;
const animateWheels = (time: number): void => {
  const delta = previousWheelFrame === 0 ? 0 : Math.min((time - previousWheelFrame) / 1000, 0.1);
  previousWheelFrame = time;
  for (const pivot of wheelPivots) {
    pivot.rotation.z -= delta * 1.8;
  }
  if (time - previousWheelRender >= 120) {
    previousWheelRender = time;
    scheduleRender();
  }
  if (spinWheels.checked) {
    wheelFrame = requestAnimationFrame(animateWheels);
  }
};
spinWheels.addEventListener('change', () => {
  if (spinWheels.checked) {
    previousWheelFrame = 0;
    previousWheelRender = 0;
    wheelFrame = requestAnimationFrame(animateWheels);
  } else {
    cancelAnimationFrame(wheelFrame);
    previousWheelFrame = 0;
    previousWheelRender = 0;
    scheduleRender();
  }
});

const addPlayer = (): void => {
  const player = BUNDLED_CONTENT.registry.figures.get('player');
  if (!player) {
    throw new Error('The bundled player figure is missing');
  }
  const person = new PlayerMeshes(BLOCK_SIZE, player.palette);
  person.sync({
    body: {
      pos: [-3.25 / BLOCK_SIZE, 0, 1.2 / BLOCK_SIZE],
      vel: [0, 0, 0],
      halfWidth: 0.3,
      height: 1.8,
      onGround: true,
    },
    yaw: 0,
    stepOffset: 0,
    gaitPhase: 0,
    moving: false,
  });
  const headBox = FIGURE_BOXES.head;
  const head = new Mesh(new BoxGeometry(...headBox.size), new MeshLambertMaterial({ color: player.palette.skin }));
  head.position.set(-3.25, headBox.at[1], 1.2 + headBox.at[2]);
  person.group.add(head);
  scene.add(person.group);
};

const addTitleSprite = (): void => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.fillStyle = '#20282d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#cbc3a9';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = '#f1eee4';
  ctx.font = 'bold 36px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1.8 m PLAYER', canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.set(-3.25, 2.1, 1.2);
  sprite.scale.set(1.7, 0.32, 1);
  scene.add(sprite);
};

addPlayer();
addTitleSprite();
grainNote.textContent = `Part cell ${(PART_CELL * 100).toFixed(1)} cm · voxel edge ${(VOXEL_EDGE * 100).toFixed(2)} cm (${VOXELS_PER_PART_CELL} voxels per lattice cell); exposed voxel faces merge into one geometry per fitting.`;
renderVehicle();
renderScene();
