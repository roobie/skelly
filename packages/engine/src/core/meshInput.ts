// What the mesher reads from the world: block arrays copied out of the chunks around one chunk. Presentation
// only (the simulation never meshes), so the save fingerprint excludes it (packages/deadvox/tools/simulationFingerprint.ts).

import type { Registry } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import { OCCLUSION_RADIUS, WIDE } from './occlusion.ts';
import { BLOCK_PATTERNS } from './schema.ts';
import { type ChunkBlocks, neighbourIndex, Shell } from './shell.ts';
import type { World } from './world.ts';

/** Surface pattern id (index into BLOCK_PATTERNS) per runtime block id, for the mesher. */
export const blockPatterns = (registry: Registry): Uint8Array =>
  Uint8Array.from(registry.blocks, (b) => BLOCK_PATTERNS.indexOf(b.pattern ?? 'none'));

/** Render-only weatherability per runtime block id, owned by block content rather than surface pattern. */
export const blockWeatherability = (registry: Registry): Uint8Array =>
  Uint8Array.from(registry.blocks, (block) => (block.weatherable ? 1 : 0));

/** Liquid flag per runtime block id: enclosure, occlusion and the mesher's face and AO tests treat a liquid as open. */
export const blockLiquids = (registry: Registry): Uint8Array =>
  Uint8Array.from(registry.blocks, (block) => (block.liquid ? 1 : 0));

/** Side of the padded block array handed to the mesher: the chunk plus a 1-block border. */
export const PADDED = CHUNK + 2;

export const paddedIndex = (x: number, y: number, z: number): number => x + PADDED * (z + PADDED * y);

/** Stands in for everything below the world's bottom layer: solid, and never drawn. */
export const BEDROCK = 0xff_ff;

/**
 * Everything the mesher reads about one chunk's surroundings: the 27 chunks around it (ordered by
 * `neighbourIndex`), and whether the layer below it is under the world's floor.
 */
export interface Neighbourhood {
  readonly chunks: readonly ChunkBlocks[];
  readonly onFloor: boolean;
}

/** The coordinates of the 27 chunks around `coords`, ordered by `neighbourIndex`. */
export const neighbourCoords = ([cx, cy, cz]: Vec3): Vec3[] => {
  const coords: Vec3[] = [];
  for (let oy = -1; oy <= 1; oy++) {
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        coords[neighbourIndex(ox, oy, oz)] = [cx + ox, cy + oy, cz + oz];
      }
    }
  }
  return coords;
};

/** Whether the layer below the chunk at `cy` is under the world's floor, `bottomCy` being its lowest layer. */
export const isOnFloor = (cy: number, bottomCy: number): boolean => cy - 1 < bottomCy;

/**
 * The chunks around `coords` as the world holds them, without copying. Missing chunks read as air;
 * `bottomCy` is the world's lowest layer.
 */
export const neighbourhoodOf = (world: World, coords: Vec3, bottomCy = Number.NEGATIVE_INFINITY): Neighbourhood => {
  const chunks = neighbourCoords(coords).map((at): ChunkBlocks => {
    const chunk = world.getChunk(...at);
    return chunk ? (chunk.raw() ?? chunk.uniformId ?? 0) : 0;
  });
  return { chunks, onFloor: isOnFloor(coords[1], bottomCy) };
};

/**
 * The chunk and a 1-block border in one array, so the mesher can cull faces at chunk edges without
 * seeing the world. Missing chunks read as air, except under the world's floor, which reads as
 * BEDROCK so the underside of the world is never meshed.
 */
export const paddedFrom = (neighbourhood: Neighbourhood): Uint16Array => {
  const shell = new Shell(1, false);
  shell.fill(neighbourhood.chunks);
  const out = shell.out as Uint16Array;
  if (neighbourhood.onFloor) {
    out.fill(BEDROCK, 0, PADDED * PADDED); // padded layer y = 0
  }
  return out;
};

/**
 * Solidity (1 for any non-air block, else 0) of the chunk and an OCCLUSION_RADIUS border, for the
 * mesher's wide ambient occlusion. Cells outside what is loaded are treated as paddedFrom treats
 * them: missing chunks are air (so ground that has not been generated never darkens anything) and
 * everything under the floor is solid.
 */
export const wideFrom = (neighbourhood: Neighbourhood, occluders?: Uint8Array): Uint8Array => {
  const shell = new Shell(OCCLUSION_RADIUS, true, occluders);
  shell.fill(neighbourhood.chunks);
  const out = shell.out as Uint8Array;
  if (neighbourhood.onFloor) {
    out.fill(1, 0, WIDE * WIDE * OCCLUSION_RADIUS); // the border layers below this chunk
  }
  return out;
};

/** `paddedFrom` read straight from the world. */
export const extractPadded = (world: World, coords: Vec3, bottomCy = Number.NEGATIVE_INFINITY): Uint16Array =>
  paddedFrom(neighbourhoodOf(world, coords, bottomCy));

/** `wideFrom` read straight from the world. */
export const extractWide = (
  world: World,
  coords: Vec3,
  bottomCy = Number.NEGATIVE_INFINITY,
  occluders?: Uint8Array,
): Uint8Array => wideFrom(neighbourhoodOf(world, coords, bottomCy), occluders);
