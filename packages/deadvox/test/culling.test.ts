import { Box3, DirectionalLight, Fog, Frustum, HemisphereLight, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import graphicsFile from '../src/content/base/graphics.json' with { type: 'json' };
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
const FAR_PLANE_SCALE = graphicsFile.graphics[0]!.fogFarPlaneScale;
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
    const c = CHUNK;
    const span = Math.ceil(fogEnd / (c * BLOCK_M)) + 1; // whole chunks, reaching past the fog on every side
    const others = new Set(scene.meshes.group.children); // not chunks: never drawn
    for (let x = -span; x < span; x++) {
      for (let z = -span; z < span; z++) {
        scene.meshes.set(`${x},${z}`, [x * c, 0, z * c], floor);
      }
    }
    const camera = scene.camera;
    // Above the ground and looking down a little, as from a tower, so the view reaches the fog's end.
    camera.position.set(1, 20, 1);
    const eye = new Vector3(1, BLOCK_M, 1);
    // A camera with no far plane, to tell what is in view from what the fog ends.
    const unbounded = camera.clone();
    unbounded.far = 1e6;
    let inViewBeyond = 0;
    for (const yawDegrees of [0, 20, 45, 90, 135, 200, 315]) {
      camera.rotation.set(-0.2, (yawDegrees * Math.PI) / 180, 0);
      camera.updateMatrixWorld();
      unbounded.rotation.copy(camera.rotation);
      unbounded.updateMatrixWorld();
      unbounded.updateProjectionMatrix();
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(unbounded.projectionMatrix, unbounded.matrixWorldInverse),
      );
      scene.meshes.cull(camera, fogEnd);
      for (const mesh of scene.meshes.group.children.filter((child) => !others.has(child))) {
        // The floor's own box, in metres.
        const box = new Box3(
          new Vector3(mesh.position.x, 1, mesh.position.z).multiplyScalar(BLOCK_M),
          new Vector3(mesh.position.x + c, 1, mesh.position.z + c).multiplyScalar(BLOCK_M),
        );
        const near = box.clampPoint(eye, new Vector3()).sub(eye);
        const inside = Math.hypot(near.x, near.z) < fogEnd;
        const inView = frustum.intersectsBox(box);
        if (inView && !inside) {
          inViewBeyond++;
        }
        expect(mesh.visible, `yaw ${yawDegrees} at ${mesh.position.toArray().join(',')}`).toBe(inView && inside);
      }
    }
    // Some ground beyond the fog's end was in view, so the disc's edge was tested.
    expect(inViewBeyond).toBeGreaterThan(0);
  });
});
