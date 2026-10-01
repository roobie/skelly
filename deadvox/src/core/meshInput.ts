// What the mesher reads from the world: block arrays copied out of the chunks around one chunk. Presentation
// only (the simulation never meshes), so the save fingerprint excludes it (tools/simulationFingerprint.ts).

import { CHUNK, type Vec3 } from './coords.ts';
import { OCCLUSION_RADIUS, WIDE } from './occlusion.ts';
import { Shell } from './shell.ts';
import type { World } from './world.ts';

/** Side of the padded block array handed to the mesher: the chunk plus a 1-block border. */
export const PADDED = CHUNK + 2;

export const paddedIndex = (x: number, y: number, z: number): number => x + PADDED * (z + PADDED * y);

/** Stands in for everything below the world's bottom layer: solid, and never drawn. */
export const BEDROCK = 0xff_ff;

/**
 * Copies a chunk and a 1-block border from its neighbours into one array, so the
 * mesher can cull faces at chunk edges without seeing the world. Missing chunks
 * read as air, except below `bottomCy` (the world's lowest layer), which reads as
 * BEDROCK so the underside of the world is never meshed.
 */
export const extractPadded = (world: World, coords: Vec3, bottomCy = Number.NEGATIVE_INFINITY): Uint16Array => {
  const shell = new Shell(1, false);
  shell.fill(world, coords);
  const out = shell.out as Uint16Array;
  if (coords[1] - 1 < bottomCy) {
    out.fill(BEDROCK, 0, PADDED * PADDED); // padded layer y = 0
  }
  return out;
};

/**
 * Solidity (1 for any non-air block, else 0) of a chunk and an OCCLUSION_RADIUS border, for the
 * mesher's wide ambient occlusion. Cells outside what is loaded are treated as extractPadded treats
 * them: missing chunks are air (so ground that has not been generated never darkens anything) and
 * everything below `bottomCy` is solid (the world's floor).
 */
export const extractWide = (world: World, coords: Vec3, bottomCy = Number.NEGATIVE_INFINITY): Uint8Array => {
  const shell = new Shell(OCCLUSION_RADIUS, true);
  shell.fill(world, coords);
  const out = shell.out as Uint8Array;
  if (coords[1] - 1 < bottomCy) {
    out.fill(1, 0, WIDE * WIDE * OCCLUSION_RADIUS); // the border layers below this chunk
  }
  return out;
};
