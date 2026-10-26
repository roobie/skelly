import {
  Box3,
  DirectionalLight,
  type Fog,
  Frustum,
  HemisphereLight,
  Matrix4,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import type { MeshData } from '../src/core/mesher.ts';
import { skyAt } from '../src/core/sky.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { ChunkMeshes } from '../src/render/chunks.ts';
import { applySky, type SkyTargets } from '../src/render/sky.ts';
import { BASE_DAY_CYCLE, phaseMidpoint } from './dayPhaseFixture.ts';

/** One upward face covering a chunk's bottom layer: a flat patch of ground. */
const floor: MeshData = {
  positions: new Float32Array([0, 1, 0, 0, 1, CHUNK, CHUNK, 1, CHUNK, CHUNK, 1, 0]),
  normals: new Int8Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  colors: new Uint8Array(12),
  patterns: new Uint8Array(4),
  weatherable: new Uint8Array(4),
  occlusion: new Uint8Array(4).fill(255),
  weathering: new Float32Array(8),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
};

const RADIUS_M = 96;
const BLOCK_M = 0.5;
// Test-owned: the schema's minimum, where the far plane sits closest to the fog's end.
const FAR_PLANE_SCALE = 1;
const fogFar = (scene: Scene) => (scene.fog as Fog).far;
const dayHour = phaseMidpoint('day') / 3600;
const nightHour = phaseMidpoint('night') / 3600;

const setup = () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 1000);
  camera.rotation.order = 'YXZ';
  const sky: SkyTargets = {
    scene,
    light: new DirectionalLight(),
    ambient: new HemisphereLight(),
    camera,
    radiusM: RADIUS_M,
    farPlaneScale: FAR_PLANE_SCALE,
  };
  const meshes = new ChunkMeshes(BLOCK_M, BUNDLED_CONTENT.registry);
  scene.add(meshes.group);
  return { scene, camera, sky, meshes };
};

/** Looks along −z from just above the origin, and culls. */
const cullFromOrigin = ({ scene, camera, meshes }: ReturnType<typeof setup>) => {
  camera.position.set(0, 2, 0);
  camera.rotation.set(0, 0, 0);
  camera.updateMatrixWorld();
  meshes.cull(camera, fogFar(scene));
};

const visible = (meshes: ChunkMeshes) =>
  meshes.group.children.filter((m) => m.visible).map((m) => m.position.toArray().join(','));

describe('culling', () => {
  it('puts the far plane where the fog ends, day and night', () => {
    const { scene, camera, sky } = setup();
    for (const hour of [dayHour, nightHour]) {
      applySky(sky, skyAt(hour, BASE_DAY_CYCLE));
      expect(camera.far).toBe(fogFar(scene) * FAR_PLANE_SCALE);
      expect(fogFar(scene)).toBeLessThanOrEqual(RADIUS_M);
    }
    applySky(sky, skyAt(dayHour, BASE_DAY_CYCLE));
    const day = fogFar(scene);
    applySky(sky, skyAt(nightHour, BASE_DAY_CYCLE));
    expect(fogFar(scene)).toBeLessThan(day / 2);
    // The projection follows, so culling does too.
    const fresh = camera.clone();
    fresh.updateProjectionMatrix();
    expect(camera.projectionMatrix.elements).toEqual(fresh.projectionMatrix.elements);
  });

  it('shows chunks ahead, and hides those behind the camera or beyond the fog', () => {
    const scene = setup();
    applySky(scene.sky, skyAt(dayHour, BASE_DAY_CYCLE)); // fog ends before the view radius
    const c = CHUNK; // in blocks: 16 m at 0.5 m blocks
    scene.meshes.set('ahead', [-c / 2, 0, -2 * c], floor); // 16–32 m ahead
    scene.meshes.set('behind', [-c / 2, 0, 2 * c], floor);
    scene.meshes.set('far', [-c / 2, 0, -7 * c], floor); // 96–112 m ahead
    cullFromOrigin(scene);
    expect(visible(scene.meshes)).toEqual([`${-c / 2},0,${-2 * c}`]);
  });

  it('culls with the tight box, not the whole chunk', () => {
    const scene = setup();
    applySky(scene.sky, skyAt(dayHour, BASE_DAY_CYCLE));
    const fogEnd = fogFar(scene.scene);
    // Just past the fog's end: the chunk's 16 m sphere would reach back inside it, but its
    // flat floor at the chunk's near edge is still beyond.
    const z = -Math.ceil((fogEnd + 1) / 0.5);
    scene.meshes.set('past', [-CHUNK / 2, 0, z - CHUNK], floor);
    cullFromOrigin(scene);
    expect(visible(scene.meshes)).toEqual([]);
    // Nearer, it shows.
    scene.meshes.set('past', [-CHUNK / 2, 0, z - CHUNK + 8], floor);
    cullFromOrigin(scene);
    expect(visible(scene.meshes)).toHaveLength(1);
  });

  it('draws the same horizontal disc at every yaw: shown exactly when in view and nearer than the fog end', () => {
    const scene = setup();
    applySky(scene.sky, skyAt(dayHour, BASE_DAY_CYCLE));
    const fogEnd = fogFar(scene.scene);
    const others = new Set(scene.meshes.group.children); // not chunks: never drawn
    const span = Math.ceil(fogEnd / (CHUNK * BLOCK_M)) + 1; // whole chunks, reaching past the fog on every side
    for (let x = -span; x < span; x += 1) {
      for (let z = -span; z < span; z += 1) {
        scene.meshes.set(`${x},${z}`, [x * CHUNK, 0, z * CHUNK], floor);
      }
    }
    const chunks = scene.meshes.group.children.filter((child) => !others.has(child));
    // Above the ground and looking down a little, as from a tower, so the view reaches the fog's end.
    scene.camera.position.set(1, 20, 1);
    for (const yawDegrees of [0, 20, 45, 90, 135, 200, 315]) {
      const expected = discAtYaw(scene.camera, yawDegrees, fogEnd, chunks);
      scene.meshes.cull(scene.camera, fogEnd);
      expect(chunks.map((mesh) => mesh.visible)).toEqual(expected.shown);
      // Ground on both sides of the fog's end was in view at this yaw, so the disc's edge was tested.
      expect(expected.shown.some(Boolean)).toBe(true);
      expect(expected.inViewBeyond).toBeGreaterThan(0);
    }
  });
});

/**
 * Turns the camera to the yaw and returns which floor chunks should show: those in the camera's
 * view (its far plane included) and nearer than the fog's end horizontally.
 */
const discAtYaw = (camera: PerspectiveCamera, yawDegrees: number, fogEnd: number, chunks: Object3D[]) => {
  camera.rotation.set(-0.2, (yawDegrees * Math.PI) / 180, 0);
  camera.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const eye = new Vector3(camera.position.x, BLOCK_M, camera.position.z);
  let inViewBeyond = 0;
  const shown = chunks.map(({ position }) => {
    // The floor's own box, in metres.
    const box = new Box3(
      new Vector3(position.x, 1, position.z).multiplyScalar(BLOCK_M),
      new Vector3(position.x + CHUNK, 1, position.z + CHUNK).multiplyScalar(BLOCK_M),
    );
    const near = box.clampPoint(eye, new Vector3()).sub(eye);
    const inside = Math.hypot(near.x, near.z) < fogEnd;
    const inView = frustum.intersectsBox(box);
    inViewBeyond += inView && !inside ? 1 : 0;
    return inView && inside;
  });
  return { shown, inViewBeyond };
};
