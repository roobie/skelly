import { html, render } from 'lit-html';
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
  MeshPhongMaterial,
  type Object3D,
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
import { CATALOGUE } from '../vehicles/catalogue.ts';
import { HATCHBACK, HATCHBACK_ADD_ONS } from '../vehicles/hatchback.ts';
import { MATERIALS } from '../vehicles/materials.ts';
import {
  addFitting,
  type Blueprint,
  type Fitting,
  fittingById,
  isClearMaterial,
  latticeVoxels,
  type MassReport,
  measure,
  newInstance,
  noiseRadius,
  PART_CELL,
  PART_LAYERS,
  type Paint,
  type PartLayer,
  PartLibrary,
  partTypeOf,
  removeFitting,
  type VehicleInstance,
  VOXEL,
  VOXELS_PER_CELL,
} from '../vehicles/model.ts';
import { MOTORBIKE } from '../vehicles/motorbike.ts';
import { PICKUP } from '../vehicles/pickup.ts';
import { RANGE_ROVER, STRIPPED_REMOVED, wheel } from '../vehicles/rangeRover.ts';
import { gridBounds, type MeshBuffers, meshGrid, type Rgb, type VoxelGrid } from '../vehicles/voxels.ts';
import { fittingWear, type WearSite, wearGrid, wearKey, wearPalette } from '../vehicles/wear.ts';
import { type PanelActions, type PanelModel, panelTemplate } from './vehicleSpikePanel.ts';

const required = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Vehicle parts spike is missing ${selector}`);
  }
  return element;
};

const stage = required<HTMLElement>('#stage');
const sceneCanvas = required<HTMLCanvasElement>('#scene');
const controlsPanel = required<HTMLElement>('#controls');
const viewLabel = required<HTMLElement>('#vehicle-label');
/** Rendered by the panel template, so it exists once the panel has rendered. */
const schematicCanvas = (): HTMLCanvasElement => required<HTMLCanvasElement>('#schematic');

/** A part on the workshop floor: drawn from its type alone, at a place in world metres and radians. */
interface LooseItem {
  readonly type: string;
  readonly position: Vec3;
  readonly rotation: Vec3;
}
type FloorPlace = Pick<LooseItem, 'position' | 'rotation'>;
interface BuildSpec {
  /** On the stage. */
  readonly label: string;
  /** On the build switcher. */
  readonly button: string;
  readonly blueprint: Blueprint;
  /** Blueprint fittings the vehicle is made without. */
  readonly removed: readonly string[];
  /** Parts outside the factory build, where the page offers to fit them. */
  readonly addOns?: readonly Fitting[];
  readonly lift?: true;
  /** Removed parts of one type lie on the floor, the k-th of them at `place(k)`. */
  readonly floor?: { readonly type: string; readonly place: (k: number) => FloorPlace };
  /** Scales the camera presets about the vehicle's centre (not the 20 m view's distance), for its size. */
  readonly viewScale?: number;
  /** A preset this vehicle frames differently, such as its own way into the cabin. */
  readonly views?: Partial<Record<ViewId, ViewOverride>>;
}
type ViewOverride = Pick<ViewPreset, 'position' | 'target'> & { readonly label?: string };

/** Metres from a seated rider's hips to their eyes, and to the road ahead, low enough to keep the bars in view. */
const RIDER_EYE = [0.05, 0.8, 0] as const;
const RIDER_LOOK = [2.05, 0, 0] as const;

/** The view from the saddle, above the seat's rider anchor: a vehicle with no cabin to look into. */
const riderView = (blueprint: Blueprint): ViewOverride => {
  const [hips] = blueprint.fittings.flatMap((fitting) => {
    const { rider } = partTypeOf(CATALOGUE, fitting);
    return rider ? [[fitting.at[0] + rider[0], fitting.at[1] + rider[1], fitting.at[2] + rider[2]] as const] : [];
  });
  if (!hips) {
    throw new Error(`${blueprint.id} has no rider position`);
  }
  const [lx, , lz] = latticeVoxels(blueprint);
  const [x, y, z] = [(hips[0] - lx / 2) * VOXEL, hips[1] * VOXEL, (hips[2] - lz / 2) * VOXEL];
  const from = ([dx, dy, dz]: readonly [number, number, number]): Vec3 => [x + dx, y + dy, z + dz];
  return { label: 'Rider', position: from(RIDER_EYE), target: from(RIDER_LOOK) };
};

const WHEEL_THICKNESS = 7 * VOXEL;
const wheelStack = (k: number): FloorPlace => ({
  position: [1.2 + 0.02 * k, (k + 0.5) * WHEEL_THICKNESS, -2.3],
  rotation: [-Math.PI / 2, 0, 0],
});

const BUILDS = {
  rover: { label: 'Range Rover-type 4×4', button: '4×4', blueprint: RANGE_ROVER, removed: [] },
  stripped: {
    label: 'Same 4×4 · stripped on the lift',
    button: 'Same 4×4 · stripped on the lift',
    blueprint: RANGE_ROVER,
    removed: STRIPPED_REMOVED,
    lift: true,
    floor: { type: wheel.type.id, place: wheelStack },
  },
  pickup: {
    label: 'Hilux-type pickup',
    button: 'Pickup',
    blueprint: PICKUP,
    removed: [],
    viewScale: 1.06,
    views: { interior: { position: [0.45, 1.7, 1.9], target: [0.85, 0.95, -0.35] } },
  },
  motorbike: {
    label: 'CG125-type motorbike',
    button: 'Motorbike',
    blueprint: MOTORBIKE,
    removed: [],
    viewScale: 0.5,
    views: { interior: riderView(MOTORBIKE) },
  },
  hatchback: {
    label: 'Hatchback · cutaway (round 3)',
    button: 'Hatchback (round 3)',
    blueprint: HATCHBACK,
    removed: ['hatch-door-near'],
    addOns: HATCHBACK_ADD_ONS,
  },
} as const satisfies Record<string, BuildSpec>;
type BuildId = keyof typeof BUILDS;
const isBuildId = (id: string | null | undefined): id is BuildId => id !== null && id !== undefined && id in BUILDS;

/** Camera presets in world metres around the vehicle's origin; a lifted car raises them with it. */
interface ViewPreset {
  readonly label: string;
  readonly key: string;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  readonly doors?: true;
}
const VIEWS = {
  front34: { label: 'Front ¾', key: '1', position: [5.6, 1.75, 4.6], target: [0.25, 0.8, 0], fov: 38 },
  side: { label: 'Side', key: '2', position: [0.2, 0.95, 12.5], target: [0.2, 0.9, 0], fov: 26 },
  rear34: { label: 'Rear ¾', key: '3', position: [-5.6, 1.85, 4.4], target: [-0.25, 0.8, 0], fov: 38 },
  top: { label: 'Top', key: '4', position: [0.2, 13, 0.01], target: [0.2, 0, 0], fov: 26 },
  far: { label: '20 m', key: '5', position: [14.5, 2.2, 13.6], target: [0, 0.9, 0], fov: 38 },
  interior: {
    label: 'Interior',
    key: '6',
    position: [0.15, 1.7, 1.9],
    target: [0.65, 0.95, -0.35],
    fov: 55,
    doors: true,
  },
  front: { label: 'Front', key: '7', position: [12.5, 0.95, 0], target: [0, 0.9, 0], fov: 26 },
} as const satisfies Record<string, ViewPreset>;
type ViewId = keyof typeof VIEWS;
const isViewId = (id: string | null | undefined): id is ViewId => id !== null && id !== undefined && id in VIEWS;

const LIFT_HEIGHT = 1;
const DEFAULT_WEAR = 0.4;
const DOOR_OPEN = (65 * Math.PI) / 180;
const WHEEL_SPIN = 1.8;

const params = new URLSearchParams(globalThis.location.search);
const buildParam = params.get('build');
let activeBuild: BuildId = isBuildId(buildParam) ? buildParam : 'rover';
const layerParam = params.get('layer') as PartLayer | null;
let activeLayer: PartLayer = layerParam && PART_LAYERS.includes(layerParam) ? layerParam : 'body';
const viewParam = params.get('view');
let activeView: ViewId = isViewId(viewParam) ? viewParam : 'front34';
let doorsOpen = params.get('doors') === 'open';
const wearParam = Number.parseInt(params.get('wear') ?? '', 10);
/** The vehicle's paint wear, 0 to 1; each fitting wears around it (`fittingWear`). */
let wearLevel = Number.isFinite(wearParam) ? Math.min(Math.max(wearParam, 0), 100) / 100 : DEFAULT_WEAR;
let wheelsSpinning = params.get('spin') === '1';
let notice = '';
let statsText = '';
let perfText = '';
let errorText = '';
let massReport: MassReport = { massKg: 0, centre: [0, 0, 0] };

const library = new PartLibrary(CATALOGUE);

/** Each build is its own vehicle, made from its blueprint the first time it's shown. */
const vehicles = new Map<BuildId, VehicleInstance>();
const vehicleFor = (id: BuildId): VehicleInstance => {
  let vehicle = vehicles.get(id);
  if (!vehicle) {
    const spec: BuildSpec = BUILDS[id];
    vehicle = newInstance(spec.blueprint, id, spec.removed);
    vehicles.set(id, vehicle);
  }
  return vehicle;
};

const wearColours = new Map<string, Readonly<Record<string, string>>>();
/** A material's colour: the vehicle's paint and the wear shades derived from it, the shared table, else the name is a colour. */
const hexOf = (paint: Paint, mat: string): string => {
  if (mat === 'paint') {
    return paint.body;
  }
  if (mat === 'seam') {
    return paint.seam;
  }
  let wear = wearColours.get(paint.body);
  if (!wear) {
    wear = wearPalette(paint.body);
    wearColours.set(paint.body, wear);
  }
  return wear[mat] ?? MATERIALS[mat] ?? mat;
};

const rgbCache = new Map<string, Rgb>();
const rgbOf = (paint: Paint, mat: string): Rgb => {
  const hex = hexOf(paint, mat);
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const color = new Color(hex);
    rgb = [color.r, color.g, color.b];
    rgbCache.set(hex, rgb);
  }
  return rgb;
};

const toGeometry = (buffers: MeshBuffers): BufferGeometry | undefined => {
  if (buffers.quads === 0) {
    return undefined;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(buffers.colors, 3));
  geometry.setIndex(new BufferAttribute(buffers.indices, 1));
  geometry.scale(VOXEL, VOXEL, VOXEL);
  geometry.computeBoundingSphere();
  return geometry;
};

interface PartMeshes {
  readonly solid: BufferGeometry | undefined;
  readonly clear: BufferGeometry | undefined;
}
const meshCache = new Map<string, PartMeshes>();
const meshCost = { types: 0, ms: 0 };
const cachedMeshes = (paint: Paint, part: string, gridOf: () => VoxelGrid): PartMeshes => {
  const key = `${part}:${paint.body}:${paint.seam}`;
  let meshes = meshCache.get(key);
  if (!meshes) {
    const started = performance.now();
    const { solid, clear } = meshGrid(gridOf(), (mat) => rgbOf(paint, mat), isClearMaterial);
    meshes = { solid: toGeometry(solid), clear: toGeometry(clear) };
    meshCache.set(key, meshes);
    meshCost.types += 1;
    meshCost.ms += performance.now() - started;
  }
  return meshes;
};

/** One geometry per part type, side and paint while its paint is unworn. */
const partMeshes = (typeId: string, mirror: boolean, paint: Paint): PartMeshes =>
  cachedMeshes(paint, `${typeId}:${mirror}`, () => library.grid(typeId, mirror));

const paintedTypes = new Map<string, boolean>();
const isPainted = (typeId: string): boolean => {
  let painted = paintedTypes.get(typeId);
  if (painted === undefined) {
    painted = [...library.grid(typeId, false).values()].some((mat) => mat === 'paint' || mat === 'seam');
    paintedTypes.set(typeId, painted);
  }
  return painted;
};

const wheelCentres = new Map<Blueprint, WearSite['wheels']>();
/** Where the blueprint's wheels turn, in vehicle voxels: dirt gathers around them whether they're fitted or not. */
const wheelsOf = (blueprint: Blueprint): WearSite['wheels'] => {
  let wheels = wheelCentres.get(blueprint);
  if (!wheels) {
    wheels = blueprint.fittings.flatMap((fitting) => {
      const { pivot } = partTypeOf(CATALOGUE, fitting);
      if (fitting.motion !== 'spin' || !pivot) {
        return [];
      }
      const [x, y] = fitting.at;
      return [[x + pivot[0], y + pivot[1], pivot[1]] as const];
    });
    wheelCentres.set(blueprint, wheels);
  }
  return wheels;
};

/** A painted fitting's own geometry once its paint wears; anything else shares its type's. */
const fittingMeshes = (spec: BuildSpec, vehicle: VehicleInstance, fitting: Fitting): PartMeshes => {
  const mirror = fitting.mirror === true;
  const key = wearKey(vehicle.id, fitting.id);
  const amount = fittingWear(key, wearLevel);
  if (amount <= 0 || !isPainted(fitting.type)) {
    return partMeshes(fitting.type, mirror, vehicle.paint);
  }
  return cachedMeshes(vehicle.paint, `${key}:${fitting.type}:${mirror}:wear ${amount}`, () =>
    wearGrid(library.grid(fitting.type, mirror), key, amount, {
      origin: fitting.at,
      wheels: wheelsOf(spec.blueprint),
    }),
  );
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

const partObject = ({ solid, clear }: PartMeshes): Group => {
  const holder = new Group();
  if (solid) {
    const mesh = new Mesh(solid, solidMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    holder.add(mesh);
  }
  if (clear) {
    const mesh = new Mesh(clear, glassMaterial);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    holder.add(mesh);
  }
  return holder;
};

/** World metres from vehicle voxels: the blueprint's envelope is centred on the origin, on the ground. */
const voxelToWorld = (blueprint: Blueprint, [x, y, z]: readonly number[]): Vector3 => {
  const [lx, , lz] = latticeVoxels(blueprint);
  return new Vector3((x! - lx / 2) * VOXEL, y! * VOXEL, (z! - lz / 2) * VOXEL);
};

const scene = new Scene();
let vehicleGroup = new Group();
let liftGroup: Group | undefined;
let wheelPivots: Group[] = [];
let doorPivots: { readonly pivot: Group; readonly sign: number }[] = [];

/** A fitting in vehicle space: wheels spin about their axle and doors swing about their hinge line. */
const placeFitting = (spec: BuildSpec, vehicle: VehicleInstance, fitting: Fitting): Object3D => {
  const holder = partObject(fittingMeshes(spec, vehicle, fitting));
  const origin = voxelToWorld(spec.blueprint, fitting.at);
  const type = partTypeOf(CATALOGUE, fitting);
  if (!(fitting.motion && type.pivot)) {
    holder.position.copy(origin);
    return holder;
  }
  const [px, py, pz] = type.pivot;
  const local = new Vector3(px, py, fitting.mirror ? -pz : pz).multiplyScalar(VOXEL);
  const pivot = new Group();
  pivot.position.copy(origin).add(local);
  holder.position.copy(local).negate();
  pivot.add(holder);
  if (fitting.motion === 'spin') {
    wheelPivots.push(pivot);
  } else {
    const sign = fitting.mirror ? -1 : 1;
    pivot.rotation.y = doorsOpen ? sign * DOOR_OPEN : 0;
    doorPivots.push({ pivot, sign });
  }
  return pivot;
};

/** A part on the floor, drawn from its type in the given paint, its voxels centred on the item's position. */
const looseObject = (item: LooseItem, paint: Paint): Object3D => {
  const { min, max } = gridBounds(library.grid(item.type, false));
  const centre = new Vector3(min[0] + max[0] + 1, min[1] + max[1] + 1, min[2] + max[2] + 1).multiplyScalar(VOXEL / 2);
  const part = partObject(partMeshes(item.type, false, paint));
  part.position.copy(centre).negate();
  const holder = new Group();
  holder.add(part);
  holder.position.set(...item.position);
  holder.rotation.set(...item.rotation);
  return holder;
};

const liftMaterials = {
  column: new MeshLambertMaterial({ color: '#2f5b86' }),
  arm: new MeshLambertMaterial({ color: '#c9a640' }),
  pad: new MeshLambertMaterial({ color: '#202426' }),
  plate: new MeshLambertMaterial({ color: '#5d6163' }),
};

/** In line with the 4×4's B-pillars, so the columns hide a pillar rather than a door opening. */
const LIFT_COLUMN_X = -0.33;
/** The arm pads, under the 4×4's sills just ahead of the rear arch and behind the front one. */
const LIFT_PADS_X = [-0.55, 0.78] as const;
const SILL_UNDERSIDE = 12 * VOXEL;

/** A two-post lift: columns beside the car, arms under the sills, a beam across the top. */
const buildLift = (blueprint: Blueprint): Group => {
  const group = new Group();
  const add = (size: Vec3, at: Vec3, material: MeshLambertMaterial, yaw = 0): void => {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.position.set(...at);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const [, , lz] = latticeVoxels(blueprint);
  const halfWidth = (lz / 2 - 4) * VOXEL;
  const columnZ = halfWidth + 0.38;
  const columnX = LIFT_COLUMN_X;
  const sillUnderside = LIFT_HEIGHT + SILL_UNDERSIDE;
  for (const side of [-1, 1]) {
    const z = side * columnZ;
    add([0.26, 2.95, 0.26], [columnX, 1.475, z], liftMaterials.column);
    add([0.56, 0.04, 0.5], [columnX, 0.02, z], liftMaterials.plate);
    add([0.34, 0.4, 0.3], [columnX, sillUnderside - 0.12, z - side * 0.26], liftMaterials.arm);
    for (const padX of LIFT_PADS_X) {
      const padZ = side * (halfWidth - 0.06);
      const fromX = columnX;
      const fromZ = z - side * 0.26;
      const length = Math.hypot(padX - fromX, padZ - fromZ);
      const yaw = -Math.atan2(padZ - fromZ, padX - fromX);
      add([length, 0.09, 0.14], [(padX + fromX) / 2, sillUnderside - 0.1, (padZ + fromZ) / 2], liftMaterials.arm, yaw);
      add([0.16, 0.07, 0.16], [padX, sillUnderside - 0.035, padZ], liftMaterials.pad);
    }
  }
  add([0.22, 0.2, columnZ * 2 + 0.26], [columnX, 2.95, 0], liftMaterials.column);
  return group;
};

const renderer = new WebGLRenderer({ antialias: true, canvas: sceneCanvas });
const camera = new PerspectiveCamera(38, 1, 0.05, 96);

/** The blueprint's parts of the floor's type that aren't on the vehicle, one item each. */
const floorItems = (spec: BuildSpec, vehicle: VehicleInstance): LooseItem[] => {
  const { floor } = spec;
  if (!floor) {
    return [];
  }
  const fitted = fittingById(vehicle.fittings);
  return spec.blueprint.fittings
    .filter((fitting) => fitting.type === floor.type && !fitted.has(fitting.id))
    .map((fitting, k) => ({ type: fitting.type, ...floor.place(k) }));
};

const renderVehicle = (): void => {
  const started = performance.now();
  const spec: BuildSpec = BUILDS[activeBuild];
  const vehicle = vehicleFor(activeBuild);
  if (liftGroup) {
    scene.remove(liftGroup);
    liftGroup = undefined;
  }
  scene.remove(vehicleGroup);
  vehicleGroup = new Group();
  wheelPivots = [];
  doorPivots = [];
  for (const fitting of vehicle.fittings) {
    vehicleGroup.add(placeFitting(spec, vehicle, fitting));
  }
  if (spec.lift) {
    liftGroup = buildLift(spec.blueprint);
    for (const item of floorItems(spec, vehicle)) {
      liftGroup.add(looseObject(item, vehicle.paint));
    }
    scene.add(liftGroup);
    vehicleGroup.position.y = LIFT_HEIGHT;
  }
  scene.add(vehicleGroup);
  const shift = (spec.viewScale ?? 1) - 1;
  playerGroup.position.set(PLAYER_AT[0] * shift, 0, PLAYER_AT[2] * shift);
  const assemblyMs = performance.now() - started;
  massReport = measure(library, vehicle.fittings);
  const { massKg, centre } = massReport;
  const [lx, , lz] = latticeVoxels(spec.blueprint);
  const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  const noise = noiseRadius(CATALOGUE, vehicle.fittings);
  statsText = `${vehicle.fittings.length} fittings · ${Math.round(massKg).toLocaleString('en')} kg · centre of mass ${signed((centre[0] - lx / 2) * VOXEL)} m forward, ${(centre[1] * VOXEL).toFixed(2)} m up, ${signed((centre[2] - lz / 2) * VOXEL)} m toward the near side · engine noise heard to ${Math.round(noise)} m at idle`;
  renderPanel();
  drawSchematic();
  renderScene();
  perfText = `${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString('en')} triangles · ${meshCost.types} part meshes built since load, in ${meshCost.ms.toFixed(0)} ms · assembly ${assemblyMs.toFixed(1)} ms`;
  renderPanel();
};

interface CellRect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}
const fittingCells = (fitting: Fitting): CellRect => {
  const { min, max } = library.placed(fitting).bounds;
  return {
    x0: Math.floor(min[0] / VOXELS_PER_CELL),
    z0: Math.floor(min[2] / VOXELS_PER_CELL),
    x1: Math.floor(max[0] / VOXELS_PER_CELL) + 1,
    z1: Math.floor(max[2] / VOXELS_PER_CELL) + 1,
  };
};

const schematicLayout = (
  blueprint: Blueprint,
): { readonly cell: number; readonly left: number; readonly top: number } => {
  const schematic = schematicCanvas();
  const [cx, , cz] = blueprint.lattice;
  const cell = Math.min((schematic.width - 100) / cx, (schematic.height - 40) / cz);
  return {
    cell,
    left: Math.round((schematic.width - cell * cx) / 2),
    top: Math.round((schematic.height - cell * cz) / 2),
  };
};

/** The vehicle's fittings, then the blueprint's and the add-ons' that aren't on it, which the page offers to fit. */
const offeredFittings = (spec: BuildSpec, vehicle: VehicleInstance): readonly Fitting[] => {
  const fitted = fittingById(vehicle.fittings);
  const absent = [...spec.blueprint.fittings, ...(spec.addOns ?? [])].filter((fitting) => !fitted.has(fitting.id));
  return [...vehicle.fittings, ...absent];
};

const layerFittings = (spec: BuildSpec, vehicle: VehicleInstance): readonly Fitting[] =>
  offeredFittings(spec, vehicle).filter((fitting) => partTypeOf(CATALOGUE, fitting).layer === activeLayer);

const drawGrid = (
  ctx: CanvasRenderingContext2D,
  blueprint: Blueprint,
  layout: ReturnType<typeof schematicLayout>,
): void => {
  const [cx, , cz] = blueprint.lattice;
  const { cell, left, top } = layout;
  ctx.fillStyle = '#d9cda8';
  ctx.fillText('REAR', left - 28, top + (cell * cz) / 2);
  ctx.fillText('FRONT →', left + cell * cx + 40, top + (cell * cz) / 2);
  ctx.strokeStyle = '#343b42';
  ctx.lineWidth = 1;
  for (let x = 0; x <= cx; x += 1) {
    ctx.beginPath();
    ctx.moveTo(left + x * cell, top);
    ctx.lineTo(left + x * cell, top + cz * cell);
    ctx.stroke();
  }
  for (let z = 0; z <= cz; z += 1) {
    ctx.beginPath();
    ctx.moveTo(left, top + z * cell);
    ctx.lineTo(left + cx * cell, top + z * cell);
    ctx.stroke();
  }
};

const fittingColor = (paint: Paint, fitting: Fitting): string => {
  const [first] = partTypeOf(CATALOGUE, fitting).shape;
  return first ? hexOf(paint, first.mat) : '#777777';
};

/** Top-down lattice: each fitting of the selected layer as the cells its voxels cover; z grows downward. */
const drawSchematic = (): void => {
  const schematic = schematicCanvas();
  const ctx = schematic.getContext('2d');
  if (!ctx) {
    throw new Error('Vehicle schematic canvas is unavailable');
  }
  const spec: BuildSpec = BUILDS[activeBuild];
  const vehicle = vehicleFor(activeBuild);
  const [, , cz] = spec.blueprint.lattice;
  const layout = schematicLayout(spec.blueprint);
  const { cell, left, top } = layout;
  ctx.fillStyle = '#171b20';
  ctx.fillRect(0, 0, schematic.width, schematic.height);
  ctx.font = `${Math.max(10, cell * 0.75)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawGrid(ctx, spec.blueprint, layout);
  const fitted = fittingById(vehicle.fittings);
  for (const fitting of layerFittings(spec, vehicle)) {
    const rect = fittingCells(fitting);
    const x = left + rect.x0 * cell;
    const y = top + (cz - rect.z1) * cell;
    const width = (rect.x1 - rect.x0) * cell;
    const height = (rect.z1 - rect.z0) * cell;
    const present = fitted.has(fitting.id);
    ctx.globalAlpha = present ? 0.75 : 0.3;
    ctx.fillStyle = present ? fittingColor(vehicle.paint, fitting) : '#252a2d';
    ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = present ? '#d9ddcf' : '#8a8f88';
    ctx.setLineDash(present ? [] : [4, 3]);
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    ctx.setLineDash([]);
  }
  const { massKg, centre } = massReport;
  if (massKg > 0) {
    const comX = left + (centre[0] / VOXELS_PER_CELL) * cell;
    const comY = top + (cz - centre[2] / VOXELS_PER_CELL) * cell;
    ctx.strokeStyle = '#ffcf67';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(comX - 7, comY);
    ctx.lineTo(comX + 7, comY);
    ctx.moveTo(comX, comY - 7);
    ctx.lineTo(comX, comY + 7);
    ctx.stroke();
    ctx.fillStyle = '#ffcf67';
    ctx.fillText('COM', comX, comY - 11);
  }
};

/** Fits or removes a fitting, refusing a removal something still rests on and a fit whose supports are off. */
const togglePart = (id: string): void => {
  const spec: BuildSpec = BUILDS[activeBuild];
  const vehicle = vehicleFor(activeBuild);
  const offered = fittingById(offeredFittings(spec, vehicle));
  const labelOf = (fittingId: string): string => {
    const fitting = offered.get(fittingId);
    return fitting ? `${partTypeOf(CATALOGUE, fitting).label.toLowerCase()} (${fittingId})` : fittingId;
  };
  const fitting = offered.get(id);
  if (!fitting) {
    return;
  }
  if (vehicle.fittings.includes(fitting)) {
    const blockers = removeFitting(vehicle, id);
    if (blockers.length > 0) {
      notice = `Can't take off ${labelOf(id)}: ${blockers.map((f) => labelOf(f.id)).join(', ')} rest on it.`;
      renderPanel();
      return;
    }
  } else {
    const missing = addFitting(vehicle, fitting);
    if (missing.length > 0) {
      notice = `Can't fit ${labelOf(id)}: it rests on ${missing.map(labelOf).join(', ')}.`;
      renderPanel();
      return;
    }
  }
  notice = '';
  renderVehicle();
};

const selectBuild = (id: string): void => {
  if (isBuildId(id)) {
    activeBuild = id;
    notice = '';
    renderVehicle();
    applyView(activeView);
  }
};

const selectLayer = (id: string): void => {
  const layer = PART_LAYERS.find((candidate) => candidate === id);
  if (layer) {
    activeLayer = layer;
    drawSchematic();
    renderPanel();
  }
};

/** Toggles the smallest fitting of the selected layer under the clicked cell. */
const pickSchematic = (event: PointerEvent): void => {
  const schematic = schematicCanvas();
  const spec: BuildSpec = BUILDS[activeBuild];
  const [cx, , cz] = spec.blueprint.lattice;
  const bounds = schematic.getBoundingClientRect();
  const { cell, left, top } = schematicLayout(spec.blueprint);
  const x = Math.floor(((event.clientX - bounds.left) * (schematic.width / bounds.width) - left) / cell);
  const z = cz - 1 - Math.floor(((event.clientY - bounds.top) * (schematic.height / bounds.height) - top) / cell);
  if (x < 0 || z < 0 || x >= cx || z >= cz) {
    return;
  }
  const hits = layerFittings(spec, vehicleFor(activeBuild))
    .map((fitting) => ({ fitting, rect: fittingCells(fitting) }))
    .filter(({ rect }) => x >= rect.x0 && x < rect.x1 && z >= rect.z0 && z < rect.z1)
    .sort(
      (a, b) => (a.rect.x1 - a.rect.x0) * (a.rect.z1 - a.rect.z0) - (b.rect.x1 - b.rect.x0) * (b.rect.z1 - b.rect.z0),
    );
  const [hit] = hits;
  if (hit) {
    togglePart(hit.fitting.id);
  }
};

camera.layers.enable(PLAYER_FIGURE_LAYER);
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 1));
renderer.outputColorSpace = SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.setSize(stage.clientWidth, stage.clientHeight);
const sunlight = new DirectionalLight();
const ambient = new HemisphereLight();
scene.add(sunlight, sunlight.target, ambient);
applySky({ scene, light: sunlight, ambient, camera, radiusM: 96 }, DAY_SKY);
sunlight.position.normalize().multiplyScalar(20);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.left = -6;
sunlight.shadow.camera.right = 6;
sunlight.shadow.camera.top = 6;
sunlight.shadow.camera.bottom = -6;
sunlight.shadow.camera.near = 1;
sunlight.shadow.camera.far = 45;
sunlight.shadow.bias = -0.0004;
sunlight.shadow.normalBias = 0.02;
const ground = new Mesh(new PlaneGeometry(500, 500), new MeshLambertMaterial({ color: 0x66_66_5e }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.minDistance = 0.3;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.495;

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

const setDoors = (open: boolean): void => {
  doorsOpen = open;
  for (const { pivot, sign } of doorPivots) {
    pivot.rotation.y = open ? sign * DOOR_OPEN : 0;
  }
  renderPanel();
  scheduleRender();
};

const applyView = (id: ViewId): void => {
  activeView = id;
  const view: ViewPreset = VIEWS[id];
  const spec: BuildSpec = BUILDS[activeBuild];
  const lift = spec.lift ? LIFT_HEIGHT : 0;
  const scale = spec.viewScale ?? 1;
  const override = spec.views?.[id];
  const position = override?.position ?? (id === 'far' ? view.position : view.position.map((v) => v * scale));
  const target = override?.target ?? view.target.map((v) => v * scale);
  camera.position.set(position[0]!, position[1]! + lift, position[2]!);
  controls.target.set(target[0]!, target[1]! + lift, target[2]!);
  camera.fov = view.fov;
  camera.updateProjectionMatrix();
  if (view.doors) {
    setDoors(true);
  }
  renderPanel();
  scheduleRender();
};

const panDirection = new Vector3();
const panRight = new Vector3();
const panUp = new Vector3(0, 1, 0);
const viewForKey = (key: string): ViewId | undefined =>
  (Object.entries(VIEWS) as [ViewId, ViewPreset][]).find(([, view]) => view.key === key)?.[0];
globalThis.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement) {
    return;
  }
  const view = viewForKey(event.key);
  if (view) {
    event.preventDefault();
    applyView(view);
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
  camera.position.addScaledVector(movement, 0.4);
  controls.target.addScaledVector(movement, 0.4);
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
  errorText = event.message;
  renderPanel();
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
    pivot.rotation.z -= delta * WHEEL_SPIN;
  }
  if (time - previousWheelRender >= 60) {
    previousWheelRender = time;
    scheduleRender();
  }
  if (wheelsSpinning) {
    wheelFrame = requestAnimationFrame(animateWheels);
  }
};
const startWheels = (): void => {
  previousWheelFrame = 0;
  previousWheelRender = 0;
  wheelFrame = requestAnimationFrame(animateWheels);
};
const setSpin = (on: boolean): void => {
  wheelsSpinning = on;
  if (on) {
    startWheels();
  } else {
    cancelAnimationFrame(wheelFrame);
    scheduleRender();
  }
  renderPanel();
};

/** Behind the far rear corner: in the side view for scale; a car hides it from the three-quarter views, a bike doesn't. */
const PLAYER_AT = [-3.4, 0, -1.9] as const;
/** Holds the player and its label, moved with the build's view scale so they keep their place beside it. */
const playerGroup = new Group();
scene.add(playerGroup);

const addPlayer = (): void => {
  const player = BUNDLED_CONTENT.registry.figures.get('player');
  if (!player) {
    throw new Error('The bundled player figure is missing');
  }
  const person = new PlayerMeshes(BLOCK_SIZE, player.palette);
  const [px, , pz] = PLAYER_AT;
  person.sync({
    body: {
      pos: [px / BLOCK_SIZE, 0, pz / BLOCK_SIZE],
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
  head.position.set(px, headBox.at[1], pz + headBox.at[2]);
  person.group.add(head);
  person.group.traverse((object) => {
    object.castShadow = true;
  });
  playerGroup.add(person.group);
};

const addTitleSprite = (): void => {
  const canvas = new OffscreenCanvas(512, 96);
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
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true }));
  sprite.position.set(PLAYER_AT[0], 2.1, PLAYER_AT[2]);
  sprite.scale.set(1.7, 0.32, 1);
  playerGroup.add(sprite);
};

const GRAIN_NOTE = `Part cell ${(PART_CELL * 100).toFixed(1)} cm · voxel ${(VOXEL * 100).toFixed(3)} cm (${VOXELS_PER_CELL} per cell, ${VOXELS_PER_CELL * (BLOCK_SIZE / PART_CELL)} per block). Each part type is greedy-meshed once per side and paint, and every unworn fitting of it reuses that geometry.`;
const LAYER_LABELS: Readonly<Record<PartLayer, string>> = {
  frame: 'Frame',
  under: 'Under',
  interior: 'Interior',
  body: 'Body',
  roof: 'Roof',
};

const panelModel = (): PanelModel => {
  const active: BuildSpec = BUILDS[activeBuild];
  const vehicle = vehicleFor(activeBuild);
  const fitted = fittingById(vehicle.fittings);
  return {
    builds: (Object.entries(BUILDS) as [BuildId, BuildSpec][]).map(([id, spec]) => ({ id, label: spec.button })),
    build: activeBuild,
    views: (Object.entries(VIEWS) as [ViewId, ViewPreset][]).map(([id, view]) => ({
      id,
      label: `${view.key} · ${active.views?.[id]?.label ?? view.label}`,
      title: `Key ${view.key}`,
    })),
    view: activeView,
    layers: PART_LAYERS.map((id) => ({ id, label: LAYER_LABELS[id] })),
    layer: activeLayer,
    stats: statsText,
    notice,
    spin: wheelsSpinning,
    doors: doorsOpen,
    wear: Math.round(wearLevel * 100),
    fittings: layerFittings(active, vehicle).map((fitting) => ({
      id: fitting.id,
      label: partTypeOf(CATALOGUE, fitting).label,
      fitted: fitted.has(fitting.id),
    })),
    grain: GRAIN_NOTE,
    perf: perfText,
    error: errorText,
  };
};

const panelActions: PanelActions = {
  onBuild: selectBuild,
  onView: (id) => {
    if (isViewId(id)) {
      applyView(id);
    }
  },
  onLayer: selectLayer,
  onSpin: setSpin,
  onDoors: setDoors,
  onWear: (percent) => {
    wearLevel = percent / 100;
    renderVehicle();
  },
  onFitting: togglePart,
  onSchematic: pickSchematic,
};

const renderPanel = (): void => {
  render(panelTemplate(panelModel(), panelActions), controlsPanel);
  render(html`${BUILDS[activeBuild].label}`, viewLabel);
};

addPlayer();
addTitleSprite();
renderVehicle();
applyView(activeView);
if (wheelsSpinning) {
  startWheels();
}
document.body.dataset.ready = 'true';
