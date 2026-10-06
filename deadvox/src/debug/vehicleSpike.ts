// biome-ignore lint/correctness/noUndeclaredDependencies: Deadvox reuses Mobgen's template through its existing source alias.
import { shambler } from '@mobgen/mob/templates.ts';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
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

const stage = document.querySelector<HTMLElement>('#stage');
const error = document.querySelector<HTMLElement>('#error');
const spinWheels = document.querySelector<HTMLInputElement>('#spin-wheels');
const grainNote = document.querySelector<HTMLElement>('#grain-note');
if (!(stage && error && spinWheels && grainNote)) {
  throw new Error('Vehicle spike page is missing a required element');
}

const scene = new Scene();
const camera = new PerspectiveCamera(45, 1, 0.05, 96);
camera.position.set(2, 9, 32);
camera.layers.enable(PLAYER_FIGURE_LAYER);
camera.lookAt(2, 0.6, 4.1);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 1));
renderer.outputColorSpace = SRGBColorSpace;
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

const sunlight = new DirectionalLight();
const ambient = new HemisphereLight();
scene.add(sunlight, sunlight.target, ambient);
applySky({ scene, light: sunlight, ambient, camera, radiusM: 96 }, DAY_SKY);
// A large voxel cutaway is a static visual sample; omitting the shadow-map pass keeps it responsive.

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(2, 0.65, 4.1);
controls.enableDamping = false;
controls.minDistance = 12;
controls.maxDistance = 48;
controls.maxPolarAngle = Math.PI * 0.48;

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
  const distance = 0.8;
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
  camera.position.addScaledVector(movement, distance);
  controls.target.addScaledVector(movement, distance);
  scheduleRender();
});

const ground = new Mesh(new PlaneGeometry(500, 500), new MeshLambertMaterial({ color: 0x66_66_5e }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.035;
scene.add(ground);
const blockGrid = new Group();
const lineMaterial = new MeshLambertMaterial({
  color: new Color(0x79_79_70),
  transparent: true,
  opacity: 0.3,
  side: DoubleSide,
});
for (let x = -23; x <= 23; x += BLOCK_SIZE) {
  const line = new Mesh(new BoxGeometry(0.008, 0.006, 28), lineMaterial);
  line.position.set(x, 0.002, 0);
  blockGrid.add(line);
}
for (let z = -10; z <= 18; z += BLOCK_SIZE) {
  const line = new Mesh(new BoxGeometry(46, 0.006, 0.008), lineMaterial);
  line.position.set(0, 0.002, z);
  blockGrid.add(line);
}
scene.add(blockGrid);

const MOBGEN_VOXEL = shambler.voxelSize;
const FINE_VOXEL = MOBGEN_VOXEL * 0.75;
const unitCube = new BoxGeometry(1, 1, 1);
const cubeTransform = new Object3D();
const rollingWheels: Group[] = [];
interface VoxelBin {
  color: string;
  points: Vec3[];
}

const isSurfaceCell = ([ix, iy, iz]: Vec3, [nx, ny, nz]: Vec3): boolean =>
  ix === 0 || ix === nx - 1 || iy === 0 || iy === ny - 1 || iz === 0 || iz === nz - 1;

class VoxelShape {
  private readonly bins = new Map<string, VoxelBin>();
  private readonly voxelSize: number;

  constructor(voxelSize = MOBGEN_VOXEL) {
    this.voxelSize = voxelSize;
  }

  box(center: Vec3, size: Vec3, color: string, omitPositiveZ = false): void {
    const counts = size.map((length) => Math.max(1, Math.round(length / this.voxelSize))) as Vec3;
    const [nx, ny, nz] = counts;
    for (let ix = 0; ix < nx; ix += 1) {
      for (let iy = 0; iy < ny; iy += 1) {
        for (let iz = 0; iz < nz; iz += 1) {
          if (!isSurfaceCell([ix, iy, iz], counts)) {
            continue;
          }
          if (omitPositiveZ && iz === nz - 1) {
            continue;
          }
          this.voxel(
            [
              center[0] + (ix + 0.5 - nx / 2) * this.voxelSize,
              center[1] + (iy + 0.5 - ny / 2) * this.voxelSize,
              center[2] + (iz + 0.5 - nz / 2) * this.voxelSize,
            ],
            color,
          );
        }
      }
    }
  }

  disk(center: Vec3, radius: number, depth: number, color: string): void {
    const r = Math.max(1, Math.round(radius / this.voxelSize));
    const layers = Math.max(1, Math.round(depth / this.voxelSize));
    for (let ix = -r; ix <= r; ix += 1) {
      for (let iy = -r; iy <= r; iy += 1) {
        if (ix * ix + iy * iy > r * r) {
          continue;
        }
        for (let iz = 0; iz < layers; iz += 1) {
          this.voxel(
            [
              center[0] + ix * this.voxelSize,
              center[1] + iy * this.voxelSize,
              center[2] + (iz + 0.5 - layers / 2) * this.voxelSize,
            ],
            color,
          );
        }
      }
    }
  }

  segment(from: Vec3, to: Vec3, color: string): void {
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const steps = Math.ceil((distance / this.voxelSize) * 1.4);
    for (let index = 0; index <= steps; index += 1) {
      const t = steps === 0 ? 0 : index / steps;
      this.voxel(
        [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t],
        color,
      );
    }
  }

  finish(): Group {
    const group = new Group();
    for (const { color, points } of this.bins.values()) {
      const material = new MeshLambertMaterial({ color });
      const mesh = new InstancedMesh(unitCube, material, points.length);
      for (const [index, point] of points.entries()) {
        cubeTransform.position.set(...point);
        cubeTransform.scale.setScalar(this.voxelSize * 1.025);
        cubeTransform.updateMatrix();
        mesh.setMatrixAt(index, cubeTransform.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
    return group;
  }

  private voxel(point: Vec3, color: string): void {
    let bin = this.bins.get(color);
    if (!bin) {
      bin = { color, points: [] };
      this.bins.set(color, bin);
    }
    bin.points.push(point);
  }
}

const paint = '#626c6d';
const trim = '#30383a';
const glass = '#78939a';
const rubber = '#202326';
const rim = '#9b9b8b';
const rust = '#765443';
const interior = '#514b43';

interface WheelLayout {
  readonly xs: readonly number[];
  readonly y: number;
  readonly halfWidth: number;
  readonly radius: number;
  readonly voxelSize?: number;
}

const addWheels = (parent: Group, { xs, y, halfWidth, radius, voxelSize = MOBGEN_VOXEL }: WheelLayout): void => {
  for (const x of xs) {
    for (const side of [-1, 1]) {
      const pivot = new Group();
      pivot.position.set(x, y, side * halfWidth);
      const wheel = new VoxelShape(voxelSize);
      wheel.disk([0, 0, 0], radius, 0.18, rubber);
      wheel.disk([0, 0, side * 0.12], radius * 0.47, 0.035, rim);
      wheel.disk([0, 0, side * 0.145], radius * 0.14, 0.04, trim);
      pivot.add(wheel.finish());
      parent.add(pivot);
      rollingWheels.push(pivot);
    }
  }
};

interface HatchbackOptions {
  readonly voxelSize?: number;
  readonly cutaway?: boolean;
}

const hatchback = ({ voxelSize = MOBGEN_VOXEL, cutaway = false }: HatchbackOptions = {}): Group => {
  const group = new Group();
  const shape = new VoxelShape(voxelSize);
  const bodyColor = cutaway ? '#677270' : paint;

  shape.box([0.06, 0.75, 0], [4.0, 0.55, 1.58], bodyColor, cutaway);
  shape.box([1.28, 1.08, 0], [1.55, 0.18, 1.43], bodyColor);
  shape.box([-0.22, 1.42, 0], [1.72, 0.68, 1.25], bodyColor, cutaway);
  shape.box([-0.2, 1.81, 0], [1.24, 0.1, 1.28], '#747d7d');

  for (const side of [-1, 1]) {
    if (!cutaway || side < 0) {
      shape.box([-0.55, 1.48, side * 0.635], [0.72, 0.38, 0.035], glass);
      shape.box([0.12, 1.48, side * 0.635], [0.35, 0.38, 0.035], glass);
      shape.segment([-0.98, 1.12, side * 0.79], [-0.72, 1.82, side * 0.64], trim);
    }
    shape.segment([-1.68, 1.05, side * 0.64], [-1.08, 1.78, side * 0.64], bodyColor);
    shape.box([2.02, 0.76, side * 0.44], [0.035, 0.12, 0.18], '#d1bd87');
    shape.box([-1.91, 0.76, side * 0.5], [0.035, 0.12, 0.18], '#a84737');
  }
  shape.box([0.62, 1.46, 0], [0.04, 0.38, 0.92], glass);
  shape.box([-1.5, 1.4, 0], [0.035, 0.35, 0.87], glass);
  shape.segment([-1.68, 1.08, -0.66], [-1.08, 1.78, -0.64], '#aeb9b7');

  if (cutaway) {
    for (const seatZ of [-0.34, 0.34]) {
      shape.box([0.02, 1.03, seatZ], [0.52, 0.12, 0.42], '#b29a72');
      shape.box([-0.18, 1.34, seatZ], [0.14, 0.55, 0.42], '#a88d68');
    }
    shape.box([0.62, 1.28, 0], [0.28, 0.19, 1.08], '#393d3c');
    shape.box([0.7, 1.39, 0], [0.08, 0.08, 0.78], '#77796f');
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      shape.segment(
        [0.66, 1.48 + Math.cos(angle) * 0.14, 0.36 + Math.sin(angle) * 0.14],
        [0.66, 1.48 + Math.cos(angle + 0.16) * 0.14, 0.36 + Math.sin(angle + 0.16) * 0.14],
        trim,
      );
    }
  }

  addWheels(group, { xs: [-1.35, 1.27], y: 0.44, halfWidth: 0.79, radius: 0.36, voxelSize });
  group.add(shape.finish());
  return group;
};

const pickup = (): Group => {
  const group = new Group();
  const shape = new VoxelShape();
  shape.box([0, 0.78, 0], [4.7, 0.62, 1.72], '#686e6a');
  shape.box([1.42, 1.17, 0], [1.3, 0.19, 1.54], '#686e6a');
  shape.box([-1.48, 1.12, 0], [1.25, 0.5, 1.55], '#565e5f');
  shape.box([-1.48, 0.95, 0], [1.26, 0.055, 1.5], '#303a3c');
  shape.box([-1.48, 1.25, -0.7], [1.15, 0.35, 0.1], '#71746c');
  shape.box([-1.48, 1.25, 0.7], [1.15, 0.35, 0.1], '#71746c');
  shape.box([-2.05, 1.25, 0], [0.08, 0.35, 1.42], '#77786e');
  shape.box([-0.95, 1.48, 0], [0.06, 0.37, 1.22], '#535d5c');
  for (const side of [-1, 1]) {
    shape.box([-1.72, 1.17, side * 0.79], [0.45, 0.28, 0.04], glass);
    shape.box([-1.2, 1.17, side * 0.79], [0.34, 0.28, 0.04], glass);
    shape.box([0.05, 1.0, side * 0.86], [0.035, 0.42, 0.03], trim);
    shape.box([0.26, 1.0, side * 0.86], [0.1, 0.035, 0.025], '#b4b1a1');
    shape.box([2.36, 0.78, side * 0.43], [0.035, 0.12, 0.2], '#d1bd87');
  }
  addWheels(group, { xs: [-1.35, 1.3], y: 0.48, halfWidth: 0.86, radius: 0.4 });
  group.add(shape.finish());
  return group;
};

const motorbike = (): Group => {
  const group = new Group();
  const shape = new VoxelShape();
  shape.box([-0.06, 0.67, 0], [0.95, 0.09, 0.14], '#9b9c8b');
  shape.box([0.18, 0.86, 0], [0.45, 0.3, 0.42], '#78775d');
  shape.box([-0.34, 0.91, 0], [0.5, 0.13, 0.34], '#292e30');
  shape.box([-0.48, 1.12, 0], [0.12, 0.22, 0.12], '#9b9c8b');
  shape.box([0.64, 1.0, 0], [0.1, 0.57, 0.1], '#94988a');
  shape.box([0.78, 1.26, 0], [0.54, 0.08, 0.08], '#858b84');
  shape.box([0.84, 1.18, 0], [0.1, 0.12, 0.1], '#c4b182');
  shape.box([-0.9, 0.52, 0], [0.18, 0.09, 0.28], '#a54c3d');
  addWheels(group, { xs: [-0.72, 0.72], y: 0.41, halfWidth: 0, radius: 0.4, voxelSize: MOBGEN_VOXEL });
  group.add(shape.finish());
  return group;
};

const liftedRangeRover = (): Group => {
  const frame = new VoxelShape();
  for (const x of [-1.7, 1.65]) {
    for (const side of [-1, 1]) {
      frame.box([x, 1.08, side * 0.96], [0.2, 2.16, 0.2], '#727a71');
    }
    frame.box([x, 2.13, 0], [0.32, 0.12, 2.2], '#c09b56');
  }
  const lift = frame.finish();
  const rover = new Group();
  const shell = new VoxelShape();
  shell.box([0, 0.83, 0], [4.9, 0.62, 1.9], rust, true);
  shell.box([1.52, 1.36, 0], [1.65, 0.45, 1.85], '#716b5d', true);
  shell.box([-0.38, 1.82, 0], [2.8, 1.08, 1.76], '#626963', true);
  shell.box([-0.38, 2.4, 0], [2.72, 0.12, 1.92], '#817d70');
  shell.box([1.05, 1.94, -0.9], [0.72, 0.66, 0.05], glass);
  shell.box([-0.1, 1.94, -0.9], [0.78, 0.66, 0.05], glass);
  shell.box([-1.08, 1.92, -0.9], [0.66, 0.68, 0.05], glass);
  shell.box([2.46, 1.35, 0], [0.1, 0.34, 1.78], '#363c3b');
  shell.box([2.53, 1.38, -0.45], [0.035, 0.18, 0.25], '#d1bd87');
  shell.box([-2.43, 1.18, -0.4], [0.04, 0.16, 0.22], '#a84737');
  for (const x of [-1.55, 1.48]) {
    for (const side of [-1, 1]) {
      shell.box([x, 0.84, side * 0.88], [0.2, 0.23, 0.16], '#9d9b8b');
      shell.box([x, 0.91, side * 1.0], [0.1, 0.12, 0.08], '#b39b6d');
    }
  }
  rover.add(shell.finish());
  const strippedSide = new VoxelShape();
  strippedSide.box([-0.25, 1.48, 0.94], [2.25, 0.76, 0.04], rust);
  strippedSide.box([-0.25, 1.9, 0.94], [2.25, 0.05, 0.04], '#b39b6d');
  strippedSide.box([-1.32, 1.88, 0.94], [0.06, 0.92, 0.06], '#b39b6d');
  strippedSide.box([0.82, 1.88, 0.94], [0.06, 0.92, 0.06], '#b39b6d');
  strippedSide.box([-0.55, 1.03, 0.96], [1.7, 0.14, 0.04], '#363c3b');
  strippedSide.box([-0.76, 1.34, 0.4], [0.42, 0.12, 0.38], interior);
  strippedSide.box([-0.9, 1.61, 0.4], [0.12, 0.48, 0.38], '#5a5147');
  strippedSide.box([0.1, 1.34, 0.4], [0.42, 0.12, 0.38], interior);
  strippedSide.box([-0.04, 1.61, 0.4], [0.12, 0.48, 0.38], '#5a5147');
  rover.add(strippedSide.finish());
  rover.position.y = 1.72;
  lift.add(rover);
  return lift;
};

const voxelHatch = hatchback();
const interiorHatch = hatchback({ voxelSize: FINE_VOXEL, cutaway: true });
const voxelTruck = pickup();
const voxelBike = motorbike();
const lifted = liftedRangeRover();
voxelHatch.position.set(-7, 0, 4.1);
interiorHatch.position.set(-1, 0, 4.1);
voxelTruck.position.set(5, 0, 4.1);
voxelBike.position.set(11, 0, 4.1);
lifted.position.set(17, 0, 4.1);
scene.add(voxelHatch, interiorHatch, voxelTruck, voxelBike, lifted);

const countVoxels = (group: Group): number => {
  let count = 0;
  group.traverse((object) => {
    if (object instanceof InstancedMesh) {
      count += object.count;
    }
  });
  return count;
};
grainNote.textContent = `Mobgen cell ${(MOBGEN_VOXEL * 100).toFixed(2)} cm: ${countVoxels(voxelHatch).toLocaleString()} voxels · fine cell ${(FINE_VOXEL * 100).toFixed(2)} cm: ${countVoxels(interiorHatch).toLocaleString()} voxels`;

const player = BUNDLED_CONTENT.registry.figures.get('player');
if (!player) {
  throw new Error('The bundled player figure is missing');
}
const person = new PlayerMeshes(BLOCK_SIZE, player.palette);
person.sync({
  body: { pos: [-13 / BLOCK_SIZE, 0, 4.1 / BLOCK_SIZE], vel: [0, 0, 0], halfWidth: 0.3, height: 1.8, onGround: true },
  yaw: 0,
  stepOffset: 0,
  gaitPhase: 0,
  moving: false,
});
const headBox = FIGURE_BOXES.head;
const head = new Mesh(new BoxGeometry(...headBox.size), new MeshLambertMaterial({ color: player.palette.skin }));
head.position.set(-13, headBox.at[1], 4.1 + headBox.at[2]);
head.castShadow = true;
person.group.add(head);
scene.add(person.group);

const addLabel = (text: string, x: number, y = 3.05, z = 4.1): void => {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.fillStyle = '#18212a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#c8c4ae';
  context.lineWidth = 5;
  context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  context.fillStyle = '#f0eee5';
  context.font = 'bold 38px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.set(x, y, z);
  sprite.scale.set(5.1, 0.9, 1);
  scene.add(sprite);
};

addLabel('1.8 m PLAYER', -13);
addLabel('HATCHBACK · MOBGEN GRAIN', -7);
addLabel('HATCHBACK · FINE CUTAWAY', -1);
addLabel('PICKUP', 5);
addLabel('MOTORBIKE', 11);
addLabel('RANGE-ROVER-TYPE 4×4 · LIFT', 17, 5.15);

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
let wheelFrame = 0;
let previousWheelFrame = 0;
let previousWheelRender = 0;
const animateWheels = (time: number): void => {
  const delta = previousWheelFrame === 0 ? 0 : Math.min((time - previousWheelFrame) / 1000, 0.1);
  previousWheelFrame = time;
  for (const wheel of rollingWheels) {
    wheel.rotation.z -= delta * 1.8;
  }
  if (time - previousWheelRender >= 160) {
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
renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.buttons !== 0) {
    scheduleRender();
  }
});
renderer.domElement.addEventListener('pointerup', scheduleRender);
renderer.domElement.addEventListener('wheel', scheduleRender);
renderScene();
