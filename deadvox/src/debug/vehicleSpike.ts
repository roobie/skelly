// biome-ignore lint/correctness/noUndeclaredDependencies: Deadvox reuses Mobgen's template through its existing source alias.
import { shambler } from '@mobgen/mob/templates.ts';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
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
if (!(stage && error)) {
  throw new Error('Vehicle spike page is missing its stage or error element');
}

const scene = new Scene();
const camera = new PerspectiveCamera(45, 1, 0.05, 96);
camera.position.set(2, 10, 35);
camera.layers.enable(PLAYER_FIGURE_LAYER);
camera.lookAt(2, 0.6, 4.1);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
renderer.outputColorSpace = SRGBColorSpace;
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

const sunlight = new DirectionalLight();
const ambient = new HemisphereLight();
scene.add(sunlight, sunlight.target, ambient);
applySky({ scene, light: sunlight, ambient, camera, radiusM: 96 }, DAY_SKY);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1024, 1024);
sunlight.shadow.camera.left = -20;
sunlight.shadow.camera.right = 20;
sunlight.shadow.camera.top = 18;
sunlight.shadow.camera.bottom = -18;
sunlight.shadow.camera.near = 0.1;
sunlight.shadow.camera.far = 55;
sunlight.shadow.bias = -0.0005;
renderer.shadowMap.enabled = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(2, 0.65, 4.1);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 12;
controls.maxDistance = 48;
controls.maxPolarAngle = Math.PI * 0.48;

const ground = new Mesh(new PlaneGeometry(46, 28), new MeshLambertMaterial({ color: 0x66_66_5e }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.035;
ground.receiveShadow = true;
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

const unitCube = new BoxGeometry(1, 1, 1);
const cubeTransform = new Object3D();
const VOXEL = shambler.voxelSize;
interface VoxelBin {
  color: string;
  points: Vec3[];
}

class VoxelShape {
  private readonly bins = new Map<string, VoxelBin>();

  box(center: Vec3, size: Vec3, color: string): void {
    const counts = size.map((length) => Math.max(1, Math.round(length / VOXEL))) as Vec3;
    const [nx, ny, nz] = counts;
    for (let ix = 0; ix < nx; ix += 1) {
      for (let iy = 0; iy < ny; iy += 1) {
        for (let iz = 0; iz < nz; iz += 1) {
          if (ix !== 0 && ix !== nx - 1 && iy !== 0 && iy !== ny - 1 && iz !== 0 && iz !== nz - 1) {
            continue;
          }
          this.point(
            [
              center[0] + (ix + 0.5 - nx / 2) * VOXEL,
              center[1] + (iy + 0.5 - ny / 2) * VOXEL,
              center[2] + (iz + 0.5 - nz / 2) * VOXEL,
            ],
            color,
          );
        }
      }
    }
  }

  disk(center: Vec3, radius: number, depth: number, color: string): void {
    const r = Math.max(1, Math.round(radius / VOXEL));
    const layers = Math.max(1, Math.round(depth / VOXEL));
    for (let ix = -r; ix <= r; ix += 1) {
      for (let iy = -r; iy <= r; iy += 1) {
        if (ix * ix + iy * iy > r * r) {
          continue;
        }
        for (let iz = 0; iz < layers; iz += 1) {
          this.point(
            [center[0] + ix * VOXEL, center[1] + iy * VOXEL, center[2] + (iz + 0.5 - layers / 2) * VOXEL],
            color,
          );
        }
      }
    }
  }

  finish(): Group {
    const group = new Group();
    for (const { color, points } of this.bins.values()) {
      const material = new MeshLambertMaterial({ color });
      const mesh = new InstancedMesh(unitCube, material, points.length);
      mesh.count = points.length;
      for (const [index, point] of points.entries()) {
        cubeTransform.position.set(...point);
        cubeTransform.scale.setScalar(VOXEL * 1.025);
        cubeTransform.updateMatrix();
        mesh.setMatrixAt(index, cubeTransform.matrix);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
    return group;
  }

  private point(point: Vec3, color: string): void {
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

const carWheels = (shape: VoxelShape, radius = 0.37): void => {
  for (const x of [-1.32, 1.28]) {
    for (const side of [-1, 1]) {
      const z = side * 0.82;
      shape.disk([x, radius + 0.08, z], radius, 0.18, rubber);
      shape.disk([x, radius + 0.08, z + side * 0.1], radius * 0.48, 0.035, rim);
      shape.disk([x, radius + 0.08, z + side * 0.125], radius * 0.16, 0.04, trim);
    }
  }
};

const voxelHatchback = (stripped = false): Group => {
  const shape = new VoxelShape();
  if (stripped) {
    // A deliberately incomplete shell: missing doors, glass and wheels, with the engine exposed.
    shape.box([0, 0.68, 0], [4.0, 0.3, 1.48], rust);
    shape.box([0, 0.47, 0], [3.7, 0.12, 1.25], trim);
    shape.box([1.4, 0.91, 0], [0.95, 0.25, 1.1], '#8b7656');
    shape.box([-0.55, 1.0, 0], [1.8, 0.08, 1.22], '#5d5a50');
    for (const side of [-1, 1]) {
      shape.box([-0.5, 1.3, side * 0.58], [0.04, 0.67, 0.04], rust);
      shape.box([0.44, 1.3, side * 0.58], [0.04, 0.67, 0.04], rust);
    }
    for (const x of [-1.3, 1.2]) {
      shape.box([x, 1.18, -0.5], [0.12, 0.26, 0.12], '#b39b6d');
      shape.box([x, 1.18, 0.5], [0.12, 0.26, 0.12], '#b39b6d');
    }
    return shape.finish();
  }

  shape.box([0, 0.79, 0], [4.25, 0.66, 1.58], paint);
  shape.box([1.28, 1.18, 0], [1.45, 0.22, 1.44], paint);
  shape.box([-0.45, 1.48, 0], [1.9, 0.67, 1.28], paint);
  shape.box([-0.45, 1.84, 0], [1.18, 0.09, 1.3], '#747d7d');
  for (const side of [-1, 1]) {
    shape.box([-0.83, 1.53, side * 0.65], [0.68, 0.38, 0.04], glass);
    shape.box([-0.12, 1.53, side * 0.65], [0.49, 0.38, 0.04], glass);
    shape.box([-0.46, 1.16, side * 0.8], [0.025, 0.47, 0.025], trim);
    shape.box([0.22, 1.16, side * 0.8], [0.025, 0.47, 0.025], trim);
    shape.box([-0.05, 1.0, side * 0.82], [0.12, 0.035, 0.025], '#b4b1a1');
  }
  shape.box([0.58, 1.49, 0], [0.04, 0.38, 0.92], glass);
  shape.box([-1.48, 1.49, 0], [0.04, 0.38, 0.92], glass);
  shape.box([2.1, 0.79, 0], [0.12, 0.2, 1.55], '#a79d82');
  shape.box([-2.1, 0.79, 0], [0.12, 0.2, 1.55], trim);
  for (const side of [-1, 1]) {
    shape.box([2.17, 0.93, side * 0.43], [0.035, 0.13, 0.2], '#d1bd87');
    shape.box([-2.17, 0.92, side * 0.55], [0.035, 0.1, 0.18], '#a84737');
  }
  carWheels(shape);
  return shape.finish();
};

const voxelPickup = (): Group => {
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
  carWheels(shape, 0.4);
  return shape.finish();
};

const voxelMotorbike = (): Group => {
  const shape = new VoxelShape();
  for (const x of [-0.72, 0.72]) {
    shape.disk([x, 0.41, 0], 0.4, 0.11, rubber);
    shape.disk([x, 0.41, 0.07], 0.14, 0.035, rim);
    shape.disk([x, 0.41, 0.1], 0.055, 0.04, trim);
  }
  shape.box([-0.06, 0.67, 0], [0.95, 0.09, 0.14], '#9b9c8b');
  shape.box([0.18, 0.86, 0], [0.45, 0.3, 0.42], '#78775d');
  shape.box([-0.34, 0.91, 0], [0.5, 0.13, 0.34], '#292e30');
  shape.box([-0.48, 1.12, 0], [0.12, 0.22, 0.12], '#9b9c8b');
  shape.box([0.64, 1.0, 0], [0.1, 0.57, 0.1], '#94988a');
  shape.box([0.78, 1.26, 0], [0.54, 0.08, 0.08], '#858b84');
  shape.box([0.84, 1.18, 0], [0.1, 0.12, 0.1], '#c4b182');
  shape.box([-0.9, 0.52, 0], [0.18, 0.09, 0.28], '#a54c3d');
  return shape.finish();
};

const solid = (parent: Group, size: Vec3, position: Vec3, color: string): Mesh => {
  const mesh = new Mesh(
    new BoxGeometry(...size),
    new MeshStandardMaterial({ color, roughness: 0.88, flatShading: true }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

const addPolyWheel = (parent: Group, x: number, zSide: number): void => {
  const tire = new Mesh(
    new CylinderGeometry(0.37, 0.37, 0.18, 9, 1),
    new MeshStandardMaterial({ color: rubber, roughness: 1, flatShading: true }),
  );
  tire.rotation.x = Math.PI / 2;
  tire.position.set(x, 0.45, zSide * 0.82);
  tire.castShadow = true;
  parent.add(tire);
  const hub = new Mesh(
    new CylinderGeometry(0.18, 0.18, 0.2, 8, 1),
    new MeshStandardMaterial({ color: rim, roughness: 0.8, flatShading: true }),
  );
  hub.rotation.x = Math.PI / 2;
  hub.position.set(x, 0.45, zSide * 0.82 + zSide * 0.08);
  parent.add(hub);
};

const extrudedSide = (points: readonly Vec3[], width: number, color: string): Mesh => {
  const profile = new Shape();
  const first = points[0]!;
  profile.moveTo(first[0], first[1]);
  for (const [x, y] of points.slice(1)) {
    profile.lineTo(x, y);
  }
  profile.closePath();
  const geometry = new ExtrudeGeometry(profile, { depth: width, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -width / 2);
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ color, roughness: 0.82, flatShading: true, side: DoubleSide }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const lowPolyHatchback = (): Group => {
  const group = new Group();
  group.add(
    extrudedSide(
      [
        [-2.15, 0.46, 0],
        [2.12, 0.46, 0],
        [2.12, 1.06, 0],
        [1.55, 1.22, 0],
        [0.55, 1.25, 0],
        [0.12, 1.92, 0],
        [-0.96, 1.92, 0],
        [-1.43, 1.18, 0],
        [-2.15, 1.12, 0],
      ],
      1.64,
      paint,
    ),
  );
  solid(group, [0.78, 0.4, 0.045], [-0.81, 1.53, 0.84], glass);
  solid(group, [0.78, 0.4, 0.045], [-0.81, 1.53, -0.84], glass);
  solid(group, [0.55, 0.39, 0.045], [-0.05, 1.53, 0.84], glass);
  solid(group, [0.55, 0.39, 0.045], [-0.05, 1.53, -0.84], glass);
  solid(group, [0.08, 0.48, 1.08], [0.58, 1.48, 0], '#87999c');
  solid(group, [0.08, 0.48, 1.08], [-1.38, 1.48, 0], '#87999c');
  solid(group, [0.14, 0.2, 1.68], [2.12, 0.8, 0], '#a79d82');
  for (const x of [-1.32, 1.28]) {
    addPolyWheel(group, x, -1);
    addPolyWheel(group, x, 1);
  }
  return group;
};

const liftCar = (): Group => {
  const lift = new Group();
  for (const x of [-1.35, 1.22]) {
    for (const side of [-1, 1]) {
      solid(lift, [0.16, 1.45, 0.16], [x, 0.73, side * 0.87], '#68716c');
    }
    solid(lift, [0.32, 0.1, 1.95], [x, 1.48, 0], '#c09b56');
  }
  const stripped = voxelHatchback(true);
  stripped.position.y = 1.55;
  lift.add(stripped);
  return lift;
};

const voxelHatch = voxelHatchback();
const voxelTruck = voxelPickup();
const voxelBike = voxelMotorbike();
voxelHatch.position.set(-7, 0, 4.1);
voxelTruck.position.set(5, 0, 4.1);
voxelBike.position.set(11, 0, 4.1);
const comparison = lowPolyHatchback();
comparison.position.set(-1, 0, 4.1);
const lifted = liftCar();
lifted.position.set(17, 0, 4.1);
scene.add(voxelHatch, comparison, voxelTruck, voxelBike, lifted);

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

const addLabel = (text: string, x: number, z: number): void => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
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
  context.font = 'bold 42px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.set(x, 3.05, z);
  sprite.scale.set(4.5, 0.9, 1);
  scene.add(sprite);
};

addLabel('1.8 m PLAYER', -13, 4.1);
addLabel('HATCHBACK · VOXEL', -7, 4.1);
addLabel('HATCHBACK · LOW POLY', -1, 4.1);
addLabel('PICKUP', 5, 4.1);
addLabel('MOTORBIKE', 11, 4.1);
addLabel('STRIPPED CAR · LIFT', 17, 4.1);

const resize = (): void => {
  const width = Math.max(stage.clientWidth, 1);
  const height = Math.max(stage.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};
new ResizeObserver(resize).observe(stage);
globalThis.addEventListener('error', (event) => {
  error.textContent = event.message;
});
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
