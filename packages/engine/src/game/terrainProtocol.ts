import { Chunk } from '../core/chunk.ts';
import { CHUNK_VOLUME } from '../core/coords.ts';
import type { Scale } from '../core/scale.ts';
import { createTerrainEvaluator, type TerrainEvaluator } from '../core/terrainEvaluator.ts';
import type { TerrainPlan } from '../core/terrainPlan.ts';

/** One generated chunk on the wire: its blocks as one id or a worker-owned array, and its revision. */
export interface WireChunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly uniform: number | undefined;
  readonly blocks: Uint16Array | undefined;
  readonly revision: number;
}

export type ToTerrain =
  | { readonly type: 'init'; readonly epoch: number; readonly plan: TerrainPlan }
  | {
      readonly type: 'generate';
      readonly epoch: number;
      readonly ticket: number;
      readonly cx: number;
      readonly cz: number;
    };

export type FromTerrain =
  | { readonly type: 'ready'; readonly epoch: number }
  | {
      readonly type: 'column';
      readonly epoch: number;
      readonly ticket: number;
      readonly cx: number;
      readonly cz: number;
      readonly chunks: readonly WireChunk[];
    }
  | { readonly type: 'failed'; readonly epoch: number; readonly ticket?: number; readonly reason: string };

/** What a terrain worker reports back: a reply, or a fault that leaves its replies unusable. */
export interface TerrainHandlers {
  message: (reply: FromTerrain) => void;
  failure: (reason: string) => void;
}

/** One terrain worker, named without DOM types so the streamer needs no browser to schedule generation. */
export interface TerrainPort {
  post: (msg: ToTerrain) => void;
  listen: (handlers: TerrainHandlers) => void;
  terminate: () => void;
}

/** Makes one terrain worker; content tuning owns how many. */
export type TerrainWorkerSource = () => TerrainPort;

/** Encodes a column its caller gives up: its arrays are transferred, not copied. */
export const encodeColumn = (column: readonly Chunk[]): { chunks: WireChunk[]; transfer: ArrayBuffer[] } => {
  const transfer: ArrayBuffer[] = [];
  const chunks = column.map((chunk): WireChunk => {
    const uniform = chunk.uniformId;
    const blocks = chunk.raw() as Uint16Array | undefined;
    if (blocks) {
      transfer.push(blocks.buffer as ArrayBuffer);
    }
    return { cx: chunk.cx, cy: chunk.cy, cz: chunk.cz, uniform, blocks, revision: chunk.revision };
  });
  return { chunks, transfer };
};

/** Rebuilds a worker column exactly as main would have generated it, or throws on a reply that does not fit the request. */
export const decodeColumn = (chunks: readonly WireChunk[], cx: number, cz: number, scale: Scale): Chunk[] => {
  if (!Array.isArray(chunks) || chunks.length !== scale.maxCy - scale.minCy + 1) {
    throw new Error(`Terrain worker column ${cx},${cz} has the wrong chunk count`);
  }
  return chunks.map((wire, at) => {
    if (wire.cx !== cx || wire.cz !== cz || wire.cy !== scale.minCy + at || !Number.isInteger(wire.revision)) {
      throw new Error(`Terrain worker column ${cx},${cz} has a misplaced chunk`);
    }
    let chunk: Chunk;
    if (wire.blocks instanceof Uint16Array && wire.blocks.length === CHUNK_VOLUME && wire.uniform === undefined) {
      chunk = Chunk.fromArray(cx, wire.cy, cz, wire.blocks);
    } else if (wire.blocks === undefined && Number.isInteger(wire.uniform)) {
      chunk = new Chunk(cx, wire.cy, cz, wire.uniform);
    } else {
      throw new Error(`Terrain worker column ${cx},${cz} has malformed chunk ${wire.cy}`);
    }
    chunk.revision = wire.revision;
    return chunk;
  });
};

const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)) || 'Terrain worker failed';

/**
 * The worker side: builds the shared evaluator from the cloned plan once, then answers each request
 * with exactly the column main would generate. Every fault is reported, never answered with empty terrain.
 */
export const createTerrainService = (reply: (msg: FromTerrain, transfer: ArrayBuffer[]) => void) => {
  let served: { epoch: number; terrain: TerrainEvaluator } | undefined;
  return (msg: ToTerrain): void => {
    if (msg.type === 'init') {
      try {
        served = { epoch: msg.epoch, terrain: createTerrainEvaluator(msg.plan) };
      } catch (error) {
        served = undefined;
        reply({ type: 'failed', epoch: msg.epoch, reason: reasonOf(error) }, []);
        return;
      }
      reply({ type: 'ready', epoch: msg.epoch }, []);
      return;
    }
    const { epoch, ticket, cx, cz } = msg;
    try {
      if (served?.epoch !== epoch) {
        throw new Error('Terrain request before init');
      }
      const { chunks, transfer } = encodeColumn(served.terrain.generateColumn(cx, cz));
      reply({ type: 'column', epoch, ticket, cx, cz, chunks }, transfer);
    } catch (error) {
      reply({ type: 'failed', epoch, ticket, reason: reasonOf(error) }, []);
    }
  };
};
