import type { MeshData } from '@skelly/engine/mesh';
import { CHUNK } from '@skelly/engine/world';
import { ChunkMeshes } from '@skelly/presentation/render';
import { DoubleSide, MeshDepthMaterial, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();
const BLOCK_M = 0.5;

/**
 * An upward face over the chunk's footprint at `height` blocks, followed by `padding` zero-area quads
 * that only make the geometry bigger.
 */
const floorAt = (height: number, padding = 0): MeshData => {
  const quads = 1 + padding;
  const positions = new Float32Array(quads * 12);
  positions.set([0, height, 0, 0, height, CHUNK, CHUNK, height, CHUNK, CHUNK, height, 0]);
  const indices = new Uint32Array(quads * 6);
  for (let quad = 0; quad < quads; quad += 1) {
    indices.set(
      [0, 1, 2, 0, 2, 3].map((corner) => quad * 4 + corner),
      quad * 6,
    );
  }
  return {
    positions,
    normals: new Int8Array(quads * 12),
    colors: new Uint8Array(quads * 12),
    patterns: new Uint8Array(quads * 4),
    weatherable: new Uint8Array(quads * 4),
    occlusion: new Uint8Array(quads * 4),
    weathering: new Float32Array(quads * 8),
    indices,
  };
};

const sortingCamera = new PerspectiveCamera();

// The render hooks below are what three calls before drawing the batch; each sets the instance
// visibility its pass's draw list is built from, which the batch's raycast follows too.
const mainPass = ({ batch, material }: ChunkMeshes) =>
  batch.onBeforeRender(null as never, null as never, sortingCamera, batch.geometry, material, null as never);
const shadowPass = ({ batch }: ChunkMeshes) =>
  batch.onBeforeShadow(
    null as never,
    null as never,
    sortingCamera,
    sortingCamera,
    batch.geometry,
    new MeshDepthMaterial(),
    null as never,
  );

/** The height, in whole blocks, of the drawn terrain in the chunk at (`chunkX`, `chunkZ`), if any. */
const groundAt = ({ batch }: ChunkMeshes, chunkX: number, chunkZ = 0): number | undefined => {
  batch.updateMatrixWorld();
  const metres = (chunk: number) => (chunk + 0.3) * CHUNK * BLOCK_M;
  const ray = new Raycaster(new Vector3(metres(chunkX), 100, metres(chunkZ)), new Vector3(0, -1, 0));
  const [hit] = ray.intersectObject(batch);
  return hit && Math.round(hit.point.y / BLOCK_M);
};

describe('chunk batch', () => {
  it("draws the casters in shadow passes and the camera's chunks in the main pass, whichever hook runs last", () => {
    const meshes = new ChunkMeshes(BLOCK_M, BUNDLED_CONTENT.registry);
    meshes.set('near', [0, 0, 0], floorAt(1));
    meshes.set('far', [10 * CHUNK, 0, 0], floorAt(1));
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    const above = new Vector3(10.5 * CHUNK * BLOCK_M, 20, 0.5 * CHUNK * BLOCK_M);
    camera.position.copy(above);
    camera.lookAt(above.x, 0, above.z);
    camera.updateMatrixWorld();
    meshes.cull(camera);
    meshes.selectShadowCasters((box) => box.min.x < 1, DoubleSide);

    shadowPass(meshes);
    expect([groundAt(meshes, 0), groundAt(meshes, 10)]).toEqual([1, undefined]);
    mainPass(meshes);
    expect([groundAt(meshes, 0), groundAt(meshes, 10)]).toEqual([undefined, 1]);
    shadowPass(meshes);
    expect([groundAt(meshes, 0), groundAt(meshes, 10)]).toEqual([1, undefined]);
  });

  it("keeps each chunk's latest terrain through replacement, removal and growth of the batch", () => {
    const meshes = new ChunkMeshes(BLOCK_M, BUNDLED_CONTENT.registry);
    const { batch } = meshes;
    meshes.set('a', [0, 0, 0], floorAt(1));
    meshes.set('b', [CHUNK, 0, 0], floorAt(2));
    meshes.set('a', [0, 0, 0], floorAt(3));
    mainPass(meshes);
    expect([groundAt(meshes, 0), groundAt(meshes, 1)]).toEqual([3, 2]);

    // More vertices than the buffers hold: they are repacked, moving 'b', and grown.
    const buffers = batch.geometry;
    meshes.set('a', [0, 0, 0], floorAt(4, buffers.getAttribute('position').count / 4));
    expect(batch.geometry).not.toBe(buffers);
    mainPass(meshes);
    expect([groundAt(meshes, 0), groundAt(meshes, 1)]).toEqual([4, 2]);

    // 'c' takes the range 'b' left.
    meshes.remove('b');
    meshes.set('c', [2 * CHUNK, 0, 0], floorAt(5));
    mainPass(meshes);
    expect([groundAt(meshes, 0), groundAt(meshes, 1), groundAt(meshes, 2)]).toEqual([4, undefined, 5]);

    // More chunks than the batch has instances for.
    const instances = batch.maxInstanceCount;
    for (let x = 0; x < instances; x += 1) {
      meshes.set(`row ${x}`, [x * CHUNK, 0, CHUNK], floorAt(6));
    }
    expect(batch.maxInstanceCount).toBeGreaterThan(instances);
    mainPass(meshes);
    expect([groundAt(meshes, 0), groundAt(meshes, 2), groundAt(meshes, instances - 1, 1)]).toEqual([4, 5, 6]);
  });
});
