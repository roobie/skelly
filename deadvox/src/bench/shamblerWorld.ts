import { BlockEntities } from '../core/blockEntities.ts';
import { worldOpaque, worldSolid } from '../core/collision.ts';
import type { Registry } from '../core/content.ts';
import { CHUNK, toChunk } from '../core/coords.ts';
import { HAMLET_BLOCK_SIZE, Hamlet } from '../core/hamlet.ts';
import { chunksFor, makeScale } from '../core/scale.ts';
import { World } from '../core/world.ts';
import { generateColumn, worldGroundAt } from '../core/worldgen.ts';
import type { ShamblerPlacementWorld } from './shamblerPlacement.ts';

const PLACEMENT_RING_METRES = 20;
const PLAYER_SEARCH_METRES = 6;
const COLUMN_MARGIN_METRES = CHUNK * HAMLET_BLOCK_SIZE;

export interface HeadlessShamblerWorld extends ShamblerPlacementWorld {
  world: World;
  entities: BlockEntities;
  loadedColumns: number;
  loadedChunks: number;
}

/**
 * Generates the actual seeded hamlet columns needed by the placement ring, plus
 * one full chunk of margin. It uses the same core terrain, stamping, furniture,
 * ground-height and solidity seams as the browser engine.
 */
export const createHeadlessShamblerWorld = (seed: number, registry: Registry): HeadlessShamblerWorld => {
  const scale = makeScale(HAMLET_BLOCK_SIZE);
  const site = new Hamlet(seed, registry, scale);
  const world = new World();
  const entities = new BlockEntities(registry);
  const block = (id: string): number => registry.blockIds.get(id)!;
  const blocks = { grass: block('grass'), dirt: block('dirt'), stone: block('stone'), sand: block('sand') };
  const { surface } = site;
  const stamp = (chunk: Parameters<Hamlet['stamp']>[0]) => site.stamp(chunk);
  const engineWorld: HeadlessShamblerWorld = {
    config: { scale },
    spawn: site.spawn,
    groundAt: (xm, zm) => worldGroundAt({ seed, scale, surface, xm, zm }),
    isSolid: worldSolid(world, registry, entities),
    isOpaque: worldOpaque(world, registry, entities),
    world,
    entities,
    loadedColumns: 0,
    loadedChunks: 0,
  };

  // This mirrors the hamlet branch in engine.ts and Streamer.generate().
  const playerSafetyMetres = PLACEMENT_RING_METRES + COLUMN_MARGIN_METRES + PLAYER_SEARCH_METRES;
  const radiusChunks = chunksFor(scale, playerSafetyMetres);
  const centerX = toChunk(Math.floor(site.spawn.pos[0] / scale.blockSize));
  const centerZ = toChunk(Math.floor(site.spawn.pos[2] / scale.blockSize));
  for (let cz = centerZ - radiusChunks; cz <= centerZ + radiusChunks; cz++) {
    for (let cx = centerX - radiusChunks; cx <= centerX + radiusChunks; cx++) {
      const column = generateColumn({ seed, blocks, scale, surface, stamp }, cx, cz, []);
      for (const chunk of column) {
        world.addChunk(chunk);
      }
      for (const { spec } of site.furnitureIn(cx, cz)) {
        entities.add(spec);
      }
      engineWorld.loadedColumns += 1;
      engineWorld.loadedChunks += column.length;
    }
  }

  return engineWorld;
};
