import { BEDROCK, type Neighbourhood, neighbourhoodOf, PADDED } from '@skelly/engine/internal/core/meshInput.ts';
import { OCCLUSION_RADIUS, WIDE } from '@skelly/engine/internal/core/occlusion.ts';
import type { MesherHandlers } from '@skelly/engine/internal/game/mesherProtocol.ts';
import { SentChunks } from '@skelly/engine/internal/game/sentChunks.ts';
import { Streamer } from '@skelly/engine/internal/game/streamer.ts';
import { hash3 } from '@skelly/engine/math';
import {
  buildMesh,
  buildRequestedMesh,
  HeldChunks,
  type MeshData,
  type MesherInit,
  type MesherPort,
  type MeshRequest,
  type ReceivedMeshRequest,
  type ToMesher,
} from '@skelly/engine/mesh';
import { CHUNK, Chunk, chunkKey, makeScale, type Vec3, World } from '@skelly/engine/world';
import { expect, it, vi } from 'vitest';
import { fixtureTerrain } from './fixtures/terrain.ts';

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

const base64 = (array: ArrayBufferView): string =>
  Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64');

/** A mesh as one string per array: element-wise equality on whole meshes would cost more than meshing them. */
const meshBytes = (mesh: MeshData): Record<string, string> =>
  Object.fromEntries(Object.entries(mesh).map(([name, array]: [string, ArrayBufferView]) => [name, base64(array)]));

/** Each neighbour slot's blocks as a number (uniform or missing) or a string of its bytes. */
const neighbourBytes = ({ chunks, onFloor }: Neighbourhood) => ({
  onFloor,
  chunks: chunks.map((blocks) => (typeof blocks === 'number' ? blocks : base64(blocks))),
});

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

/** Block tables for ids 1 to WATER, the last of them a liquid. */
const waterInit = (): MesherInit => {
  const liquids = Uint8Array.from({ length: WATER + 1 }, (_, id) => Number(id === WATER));
  return {
    type: 'init',
    colors: Uint8Array.from({ length: (WATER + 1) * 3 }, (_, i) => 40 * (i % 6)),
    patterns: new Uint8Array(WATER + 1),
    weatherable: new Uint8Array(WATER + 1),
    wireMeshes: [],
    liquids,
    fencePosts: [],
    occluders: Uint8Array.from(liquids, (liquid, id) => Number(id !== 0 && !liquid)),
  };
};

/** Both ends of one mesher's kept chunk blocks. */
interface ChunkLink {
  sent: SentChunks;
  held: HeldChunks;
}

const chunkLink = (): ChunkLink => ({ sent: new SentChunks(), held: new HeldChunks() });

/**
 * The mesh request for `coords` as `held` receives it from `sent`, cloned with its buffers transferred
 * as a browser worker gets it, and how many neighbours it left to the blocks `held` keeps.
 */
const sendRequest = (
  { sent, held }: ChunkLink,
  world: World,
  coords: Vec3,
  bottomCy: number,
): [ReceivedMeshRequest, number] => {
  const [neighbourhood, transfer] = sent.send(world, coords, bottomCy);
  const request: MeshRequest = { type: 'mesh', key: chunkKey(...coords), version: 0, neighbourhood };
  const kept = neighbourhood.chunks.filter((blocks) => blocks === null).length;
  return [held.receive(structuredClone(request, { transfer })), kept];
};

/** A mesher that receives requests as a browser worker does (cloned, buffers transferred) and replies when told. */
class CloningMesher implements MesherPort {
  handlers: MesherHandlers | undefined;
  init: MesherInit | undefined;
  readonly waiting: ReceivedMeshRequest[] = [];
  private readonly held = new HeldChunks();
  listen(handlers: MesherHandlers): void {
    this.handlers = handlers;
  }
  post(message: ToMesher, transfer: readonly ArrayBuffer[]): void {
    const copy = structuredClone(message, { transfer: [...transfer] });
    if (copy.type === 'init') {
      this.init = copy;
    } else if (copy.type === 'mesh') {
      this.waiting.push(this.held.receive(copy));
    }
  }
  reply(request: ReceivedMeshRequest): MeshData {
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
  const init = waterInit();
  const [request] = sendRequest(chunkLink(), world, [0, 0, 0], bottomCy);
  const mesh = buildRequestedMesh(init, request);
  expect(mesh.indices.length).toBeGreaterThan(0);
  expect(meshBytes(mesh)).toEqual(meshBytes(referenceMesh(world, [0, 0, 0], bottomCy, init)));
});

it('hands the mesher the blocks the world holds when requests rely on kept blocks', () => {
  const bottomCy = -1;
  const world = new World();
  const scattered = (cx: number, cy: number, cz: number, salt: number) => {
    const blocks = new Uint16Array(CHUNK ** 3);
    for (let i = 0; i < blocks.length; i++) {
      blocks[i] = hash3(salt, i, cx * 7 + cy * 13, cz) < 0.01 ? 1 + (i % WATER) : 0;
    }
    return Chunk.fromArray(cx, cy, cz, blocks);
  };
  for (let cy = -1; cy <= 1; cy++) {
    for (let cz = -1; cz <= 1; cz++) {
      for (let cx = -1; cx <= 2; cx++) {
        world.addChunk(scattered(cx, cy, cz, 0));
      }
    }
  }
  const init = waterInit();
  const link = chunkLink();
  const west: Vec3 = [0, 0, 0];
  const east: Vec3 = [1, 0, 0];
  // Each change lands in a chunk that the request after it reads and an earlier request already sent.
  const steps: [() => unknown, Vec3][] = [
    [() => undefined, west],
    [() => undefined, east],
    [() => world.setBlock(CHUNK, CHUNK / 2, CHUNK / 2, 3), west],
    [() => world.addChunk(new Chunk(0, 1, 0, 2)), west],
    [() => world.setBlock(CHUNK / 2, CHUNK, CHUNK / 2, 0), west],
    // A reload whose new chunk has the revision of the one it replaces.
    [() => world.addChunk(scattered(2, 0, 0, 1)), east],
    [() => world.addChunk(scattered(0, 1, 0, 2)), west],
    [
      () => {
        world.removeChunk(1, 1, 0);
        link.sent.drop(chunkKey(1, 1, 0));
      },
      east,
    ],
    [() => world.addChunk(scattered(1, 1, 0, 3)), east],
  ];
  let kept = 0;
  let last: ReceivedMeshRequest | undefined;
  for (const [change, coords] of steps) {
    change();
    const [request, keptNeighbours] = sendRequest(link, world, coords, bottomCy);
    kept += keptNeighbours;
    expect(neighbourBytes(request.neighbourhood)).toEqual(neighbourBytes(neighbourhoodOf(world, coords, bottomCy)));
    last = request;
  }
  expect(kept).toBeGreaterThan(0);
  const mesh = buildRequestedMesh(init, last!);
  expect(mesh.indices.length).toBeGreaterThan(0);
  expect(meshBytes(mesh)).toEqual(meshBytes(referenceMesh(world, east, bottomCy, init)));
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
    terrain: fixtureTerrain({ scale, floor: 20, blocks: { grass: 1, dirt: 2, rock: 3, sand: 4, water: WATER } }),
    colors: new Uint8Array(256 * 3).fill(200),
    patterns: new Uint8Array(256),
    weatherable: new Uint8Array(256),
    scale,
    radius: 0,
    preloadRings: 0,
    columnsPerFrame: 1,
    hysteresis: 1,
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
  expect(meshBytes(expected)).not.toEqual(meshBytes(staleMesh));
  expect(meshBytes(mesh)).toEqual(meshBytes(expected));
  expect(meshes.set).toHaveBeenCalledExactlyOnceWith('0,0,0', [0, 0, 0], mesh);
});
