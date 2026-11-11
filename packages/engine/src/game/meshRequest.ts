// What a mesher does with a mesh request, apart from how it is posted: the browser worker and the
// in-process meshers of tests share it, so a test meshes exactly as the game does.

import { CHUNK, chunkKey, type Vec3 } from '../core/coords.ts';
import { buildMesh, type MeshData } from '../core/mesher.ts';
import { neighbourCoords, paddedFrom, wideFrom } from '../core/meshInput.ts';
import type { MesherInit, MeshRequest, ReceivedMeshRequest } from './mesherProtocol.ts';

/** A mesher's side of `packages/engine/src/game/sentChunks.ts`, `SentChunks`: the blocks its requests have carried, by chunk key. */
export class HeldChunks {
  private readonly blocks = new Map<string, Uint16Array>();

  /** `request` with every neighbour's blocks in hand. Call it in the order the requests were sent. */
  receive(request: MeshRequest): ReceivedMeshRequest {
    const { dropped, chunks: sent, onFloor } = request.neighbourhood;
    for (const key of dropped) {
      this.blocks.delete(key);
    }
    const coords = neighbourCoords(request.key.split(',').map(Number) as Vec3);
    const chunks = sent.map((blocks, index) => {
      const key = chunkKey(...coords[index]!);
      if (blocks === null) {
        const held = this.blocks.get(key);
        if (!held) {
          throw new Error(`Mesh request relies on blocks of chunk ${key} that its mesher does not hold`);
        }
        return held;
      }
      if (typeof blocks === 'number') {
        this.blocks.delete(key);
      } else {
        this.blocks.set(key, blocks);
      }
      return blocks;
    });
    return { ...request, neighbourhood: { chunks, onFloor } };
  }
}

/** The mesh of the requested chunk, built from its neighbourhood. */
export const buildRequestedMesh = (init: MesherInit, { key, neighbourhood }: ReceivedMeshRequest): MeshData =>
  buildMesh(paddedFrom(neighbourhood), init.colors, {
    patterns: init.patterns,
    wide: wideFrom(neighbourhood, init.occluders),
    weatherable: init.weatherable,
    wireMeshes: init.wireMeshes,
    liquids: init.liquids,
    fencePosts: init.fencePosts,
    origin: key.split(',').map((coordinate) => Number(coordinate) * CHUNK) as Vec3,
  });
