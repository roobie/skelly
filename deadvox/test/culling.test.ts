import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import type { MeshData } from '../src/core/mesher.ts';
import { skyAt } from '../src/core/sky.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { applySky, type SkyTargets } from '../src/render/sky.ts';

/** One upward face covering a chunk's bottom layer: a flat patch of ground. */
const floor: MeshData = {
  positions: new Float32Array([0, 1, 0, 0, 1, CHUNK, CHUNK, 1, CHUNK, CHUNK, 1, 0]),
  normals: new Int8Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  colors: new Uint8Array(12),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
};

const RADIUS_M = 96;

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
  };
  const meshes = new ChunkMeshes(0.5);
  scene.add(meshes.group);
  return { scene, camera, sky, meshes };
};

/** Looks along −z from just above the origin, and culls. */
const cullFromOrigin = ({ camera, meshes }: ReturnType<typeof setup>) => {
  camera.position.set(0, 2, 0);
  camera.rotation.set(0, 0, 0);
  camera.updateMatrixWorld();
  meshes.cull(camera);
};

const visible = (meshes: ChunkMeshes) =>
  meshes.group.children.filter((m) => m.visible).map((m) => m.position.toArray().join(','));

describe('culling', () => {
  it('puts the far plane where the fog ends, day and night', () => {
    const { scene, camera, sky } = setup();
    for (const hour of [12, 21, 1]) {
      applySky(sky, skyAt(hour));
      const fog = scene.fog as { far: number };
      expect(camera.far).toBe(fog.far);
      expect(camera.far).toBeLessThanOrEqual(RADIUS_M);
    }
    applySky(sky, skyAt(12));
    const day = camera.far;
    applySky(sky, skyAt(1));
    expect(camera.far).toBeLessThan(day / 2);
    // The projection follows, so culling does too.
    const fresh = camera.clone();
    fresh.updateProjectionMatrix();
    expect(camera.projectionMatrix.elements).toEqual(fresh.projectionMatrix.elements);
  });

  it('shows chunks ahead, and hides those behind the camera or beyond the fog', () => {
    const scene = setup();
    applySky(scene.sky, skyAt(12)); // fog ends at 0.95 × 96 m ≈ 91 m
    const c = CHUNK; // in blocks: 16 m at 0.5 m blocks
    scene.meshes.set('ahead', [-c / 2, 0, -2 * c], floor); // 16–32 m ahead
    scene.meshes.set('behind', [-c / 2, 0, 2 * c], floor);
    scene.meshes.set('far', [-c / 2, 0, -7 * c], floor); // 96–112 m ahead
    cullFromOrigin(scene);
    expect(visible(scene.meshes)).toEqual([`${-c / 2},0,${-2 * c}`]);
  });

  it('culls with the tight box, not the whole chunk', () => {
    const scene = setup();
    applySky(scene.sky, skyAt(12));
    const fogFar = scene.camera.far;
    // Just past the far plane: the chunk's 16 m sphere would reach back inside it, but its
    // flat floor at the chunk's near edge is still beyond.
    const z = -Math.ceil((fogFar + 1) / 0.5);
    scene.meshes.set('past', [-CHUNK / 2, 0, z - CHUNK], floor);
    cullFromOrigin(scene);
    expect(visible(scene.meshes)).toEqual([]);
    // Nearer, it shows.
    scene.meshes.set('past', [-CHUNK / 2, 0, z - CHUNK + 8], floor);
    cullFromOrigin(scene);
    expect(visible(scene.meshes)).toHaveLength(1);
  });
});
