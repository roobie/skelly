// The chunk blocks each mesher keeps between requests, as the main thread tracks them. Copying every
// neighbour into every request was most of the main thread's meshing cost while the world fills, and
// neighbouring requests carry the same unchanged chunks; so a request sends only the blocks its
// mesher does not hold yet. For the mesher's side see `packages/engine/src/game/meshRequest.ts`, `HeldChunks`.

import type { Chunk } from '../core/chunk.ts';
import { chunkKey, type Vec3 } from '../core/coords.ts';
import { isOnFloor, neighbourCoords } from '../core/meshInput.ts';
import type { World } from '../core/world.ts';
import type { SentChunk, SentNeighbourhood } from './mesherProtocol.ts';

/** The main thread's record of what one mesher holds, so it can leave those blocks out of a request. */
export class SentChunks {
  /**
   * The chunk, by key, whose blocks the mesher holds, and its revision when they were sent. Blocks
   * change only through `Chunk.set`, which raises the revision, and a reloaded chunk is a new object,
   * so a matching pair means the held blocks are the chunk's blocks now.
   */
  private readonly held = new Map<string, { chunk: Chunk; revision: number }>();
  private dropped: string[] = [];

  /**
   * The neighbourhood of `coords` as the world holds it now, for a request to this mesher, with the
   * buffers to transfer. Sent blocks are copies, so the world's later edits cannot reach a request
   * already made and its version stamp holds.
   */
  send(world: World, coords: Vec3, bottomCy: number): [SentNeighbourhood, ArrayBuffer[]] {
    const transfer: ArrayBuffer[] = [];
    const chunks = neighbourCoords(coords).map((at): SentChunk => {
      const key = chunkKey(...at);
      const chunk = world.getChunk(...at);
      const raw = chunk?.raw();
      if (!(chunk && raw)) {
        this.held.delete(key);
        return chunk?.uniformId ?? 0;
      }
      const held = this.held.get(key);
      if (held?.chunk === chunk && held.revision === chunk.revision) {
        return null;
      }
      this.held.set(key, { chunk, revision: chunk.revision });
      const blocks = raw.slice();
      transfer.push(blocks.buffer);
      return blocks;
    });
    const { dropped } = this;
    this.dropped = [];
    return [{ chunks, onFloor: isOnFloor(coords[1], bottomCy), dropped }, transfer];
  }

  /** The chunk at `key` has left the world; the mesher lets go of its blocks with the next request. */
  drop(key: string): void {
    if (this.held.delete(key)) {
      this.dropped.push(key);
    }
  }
}
