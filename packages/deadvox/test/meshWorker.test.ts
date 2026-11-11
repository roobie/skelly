import { BEDROCK, detachNeighbourhood, neighbourhoodOf, PADDED } from '@skelly/engine/internal/core/meshInput.ts';
import { OCCLUSION_RADIUS, WIDE } from '@skelly/engine/internal/core/occlusion.ts';
import type { MesherHandlers } from '@skelly/engine/internal/game/mesherProtocol.ts';
import { Streamer } from '@skelly/engine/internal/game/streamer.ts';
import { hash3 } from '@skelly/engine/math';
import {
  buildMesh,
  buildRequestedMesh,
  type MeshData,
  type MesherInit,
  type MesherPort,
  type MeshRequest,
  type ToMesher,
} from '@skelly/engine/mesh';
import { CHUNK, Chunk, makeScale, type Vec3, World } from '@skelly/engine/world';
import { expect, it, vi } from 'vitest';
import { baseTerrainShape } from './baseRegistry.ts';

const WATER = 5;

/** Fills `out`, the chunk plus a `border` (x fastest, then z, then y), with `read` at each chunk-local block. */
const cube = <T extends Uint8Array | Uint16Array>(
  out: T,
  border: number,
  read: (x: number, y: number, z: number) => number,
): T => {
  const side = CHUNK + 2 * border;
  for (let y = 0; y < side; y++) {
    for (let z = 0; z < side; z++) {
      for (let x = 0; x < side; x++) {
        out[x + side * (z + side * y)] = read(x - border, y - border, z - border);
      }
    }
  }
  return out;
};

/** The mesh of a chunk built from per-block world reads, independent of how a mesh request carries its blocks. */
const referenceMesh = (world: World, [cx, cy, cz]: Vec3, bottomCy: number, init: MesherInit): MeshData => {
  const underFloor = (y: number) => cy - 1 < bottomCy && y < 0;
  const block = (x: number, y: number, z: number) => world.getBlock(cx * CHUNK + x, cy * CHUNK + y, cz * CHUNK + z);
  const padded = cube(new Uint16Array(PADDED ** 3), 1, (x, y, z) => (underFloor(y) ? BEDROCK : block(x, y, z)));
  const wide = cube(new Uint8Array(WIDE ** 3), OCCLUSION_RADIUS, (x, y, z) =>
    Number(underFloor(y) || init.occluders[block(x, y, z)] === 1),
  );
  return buildMesh(padded, init.colors, {
    patterns: init.patterns,
    wide,
    weatherable: init.weatherable,
    wireMeshes: init.wireMeshes,
    liquids: init.liquids,
    fencePosts: init.fencePosts,
    origin: [cx * CHUNK, cy * CHUNK, cz * CHUNK],
  });
};

/** A mesher that receives requests as a browser worker does (cloned, buffers transferred) and replies when told. */
class CloningMesher implements MesherPort {
  handlers: MesherHandlers | undefined;
  init: MesherInit | undefined;
  readonly waiting: MeshRequest[] = [];
  listen(handlers: MesherHandlers): void {
    this.handlers = handlers;
  }
  post(message: ToMesher, transfer: readonly ArrayBuffer[]): void {
    const copy = structuredClone(message, { transfer: [...transfer] });
    if (copy.type === 'init') {
      this.init = copy;
    } else if (copy.type === 'mesh') {
      this.waiting.push(copy);
    }
  }
  reply(request: MeshRequest): MeshData {
    const mesh = buildRequestedMesh(this.init!, request);
    this.handlers?.message({ type: 'mesh', key: request.key, version: request.version, mesh, ms: 0 });
    return mesh;
  }
}

it.each([
  ['on the world floor', 0],
  ['above open ground', Number.NEGATIVE_INFINITY],
])('meshes a chunk with neighbours %s as the world around it reads', (_where, bottomCy) => {
  const world = new World();
  for (let oy = -1; oy <= 1; oy++) {
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        const at = (k: number, i: number) => Math.floor(hash3(11 + k, i, ox * 7 + oy * 13, oz) * CHUNK);
        if ((ox + oz) % 2 !== 0 && oy !== 0) {
          world.addChunk(new Chunk(ox, oy, oz, 1)); // uniform solid; other gaps stay missing
          continue;
        }
        const chunk = new Chunk(ox, oy, oz);
        for (let i = 0; i < 3000; i++) {
          chunk.set(at(0, i), at(1, i), at(2, i), 1 + (i % WATER));
        }
        world.addChunk(chunk);
      }
    }
  }
  world.removeChunk(1, 1, 1);
  const liquids = Uint8Array.from({ length: WATER + 1 }, (_, id) => Number(id === WATER));
  const init: MesherInit = {
    type: 'init',
    colors: Uint8Array.from({ length: (WATER + 1) * 3 }, (_, i) => 40 * (i % 6)),
    patterns: new Uint8Array(WATER + 1),
    weatherable: new Uint8Array(WATER + 1),
    wireMeshes: [],
    liquids,
    fencePosts: [],
    occluders: Uint8Array.from(liquids, (liquid, id) => Number(id !== 0 && !liquid)),
  };
  const [neighbourhood, transfer] = detachNeighbourhood(neighbourhoodOf(world, [0, 0, 0], bottomCy));
  const request = structuredClone({ type: 'mesh', key: '0,0,0', version: 0, neighbourhood } as const, { transfer });
  const mesh = buildRequestedMesh(init, request);
  expect(mesh.indices.length).toBeGreaterThan(0);
  expect(mesh).toEqual(referenceMesh(world, [0, 0, 0], bottomCy, init));
});

it('draws the blocks as they are after an edit lands while their chunk is being meshed', () => {
  const scale = { ...makeScale(0.5), minCy: 0, maxCy: 0 };
  const world = new World();
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() };
  const mesher = new CloningMesher();
  const streamer = new Streamer({
    world,
    meshes: meshes as never,
    mesher: { count: 1, create: () => mesher },
    seed: 17,
    terrain: { grass: 1, dirt: 2, rock: 3, sand: 4, water: WATER },
    shape: baseTerrainShape(),
    colors: new Uint8Array(256 * 3).fill(200),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    structures: [],
    radius: 0,
    preloadRings: 0,
    hysteresis: 1,
    surface: { height: () => 20, top: () => undefined },
  });
  const nextRequest = () => {
    for (let step = 0; step < 32 && mesher.waiting.length === 0; step += 1) {
      streamer.update(0, 0);
    }
    return mesher.waiting.shift()!;
  };
  const stale = nextRequest();
  expect(stale.key).toBe('0,0,0');
  // A block in the neighbour east, within the centre chunk's border: it changes the centre's occlusion.
  streamer.markEdited(world.setBlock(CHUNK, 21, CHUNK / 2, 3));
  const staleMesh = mesher.reply(stale);
  expect(meshes.set).not.toHaveBeenCalled();
  const current = nextRequest();
  expect(current.key).toBe('0,0,0');
  const mesh = mesher.reply(current);
  const expected = referenceMesh(world, [0, 0, 0], scale.minCy, mesher.init!);
  expect(expected).not.toEqual(staleMesh);
  expect(mesh).toEqual(expected);
  expect(meshes.set).toHaveBeenCalledExactlyOnceWith('0,0,0', [0, 0, 0], mesh);
});
