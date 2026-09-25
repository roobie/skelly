// Building templates (DESIGN.md, "Generating the world in layers"): ASCII layers
// with a palette. A template is compiled once against the registry: every cell gets a
// block id, and furniture marks become pieces anchored at their lowest corner. A
// placement puts it in the world at an origin, turned by quarter turns, and stamps
// whatever part of it falls inside a chunk, so buildings that span chunks come out
// the same whichever chunk generates first.

import type { Chunk } from './chunk.ts';
import type { Registry, TemplateDef } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';

/** The way something's front faces: north is -z, east is +x. */
export type Facing = 'n' | 'e' | 's' | 'w';
/** Quarter turns clockwise seen from above: a turn takes north to east. */
export type Turn = 0 | 1 | 2 | 3;

const FACINGS: readonly Facing[] = ['n', 'e', 's', 'w'];

export const turnFacing = (facing: Facing, turn: Turn): Facing => FACINGS[(FACINGS.indexOf(facing) + turn) % 4]!;

/** A piece's cells as [x, y, z], seen from the template: east- and west-facing pieces lie along z. */
export const pieceSize = (size: readonly [number, number, number], facing: Facing): Vec3 =>
  facing === 'e' || facing === 'w' ? [size[2], size[1], size[0]] : [size[0], size[1], size[2]];

/** Every [x, y, z] in a box, in (y, z, x) order: lowest layer first, then rows, then cells. */
export function* cellsOf([sx, sy, sz]: readonly [number, number, number]): Generator<Vec3> {
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        yield [x, y, z];
      }
    }
  }
}

/** The character at a template cell, or undefined outside the layers. */
export const charAt = (template: TemplateDef, x: number, y: number, z: number): string | undefined =>
  [...(template.layers[y]?.[z] ?? '')][x];

/**
 * Splits the cells marked with a character into whole pieces of a size. Pieces are
 * found from their lowest corner: the first unclaimed marked cell in (y, z, x) order.
 * Returns the anchors, or why the marks don't split into whole pieces.
 */
export const findPieces = (
  template: TemplateDef,
  char: string,
  piece: Vec3,
): { anchors: Vec3[]; problem?: undefined } | { anchors?: undefined; problem: string } => {
  const claimed = new Set<string>();
  /** Claims the piece anchored at a cell; false if any of its cells isn't marked or is taken. */
  const claim = (x: number, y: number, z: number): boolean => {
    for (const [dx, dy, dz] of cellsOf(piece)) {
      const key = `${x + dx},${y + dy},${z + dz}`;
      if (charAt(template, x + dx, y + dy, z + dz) !== char || claimed.has(key)) {
        return false;
      }
      claimed.add(key);
    }
    return true;
  };
  const anchors: Vec3[] = [];
  for (const [x, y, z] of cellsOf(template.size)) {
    if (charAt(template, x, y, z) !== char || claimed.has(`${x},${y},${z}`)) {
      continue;
    }
    if (!claim(x, y, z)) {
      return { problem: `the piece at [${x}, ${y}, ${z}] needs ${piece.join(' × ')} cells marked "${char}"` };
    }
    anchors.push([x, y, z]);
  }
  return { anchors };
};

/** A piece of furniture in a template, in template coordinates. */
export interface Piece {
  furniture: string;
  /** The palette's loot table, or the furniture's own. */
  loot?: string | undefined;
  facing: Facing;
  pos: Vec3;
  size: Vec3;
}

export interface CompiledTemplate {
  readonly id: string;
  readonly size: Vec3;
  /** A block id per cell, x + sx * (z + sz * y). Furniture and spawn cells are air. */
  readonly blocks: Uint16Array;
  readonly pieces: readonly Piece[];
}

/** Resolves a template's palette against the registry. The validator has already checked it. */
export const compileTemplate = (registry: Registry, template: TemplateDef): CompiledTemplate => {
  const [sx, sy, sz] = template.size;
  const blocks = new Uint16Array(sx * sy * sz);
  const pieces: Piece[] = [];
  for (const [char, entry] of Object.entries(template.palette)) {
    if (typeof entry === 'string' || entry.furniture === undefined) {
      continue;
    }
    const def = registry.furniture.get(entry.furniture)!;
    const facing = entry.facing ?? 'n';
    const size = pieceSize(def.size, facing);
    for (const pos of findPieces(template, char, size).anchors ?? []) {
      pieces.push({ furniture: def.id, loot: entry.loot ?? def.loot, facing, pos, size });
    }
  }
  for (const [x, y, z] of cellsOf(template.size)) {
    const entry = template.palette[charAt(template, x, y, z) ?? ''];
    blocks[x + sx * (z + sz * y)] = typeof entry === 'string' ? registry.blockIds.get(entry)! : 0;
  }
  return { id: template.id, size: [sx, sy, sz], blocks, pieces };
};

/** A template put in the world. `origin` is the lowest corner of its turned footprint; layer 0 is at origin[1]. */
export interface Placement {
  readonly template: CompiledTemplate;
  readonly origin: Vec3;
  readonly turn: Turn;
}

/** Width along x and depth along z once turned. */
export const footprint = ({ template, turn }: Placement): [number, number] =>
  turn % 2 === 0 ? [template.size[0], template.size[2]] : [template.size[2], template.size[0]];

/** Where a template cell's (x, z) lands, relative to the origin. */
const turned = (size: Vec3, turn: Turn, x: number, z: number): [number, number] => {
  const [sx, , sz] = size;
  switch (turn) {
    case 1:
      return [sz - 1 - z, x];
    case 2:
      return [sx - 1 - x, sz - 1 - z];
    case 3:
      return [z, sx - 1 - x];
    default:
      return [x, z];
  }
};

/** The template cell that lands on (u, v) relative to the origin: the inverse of `turned`. */
const unturned = (size: Vec3, turn: Turn, u: number, v: number): [number, number] => {
  const [sx, , sz] = size;
  switch (turn) {
    case 1:
      return [v, sz - 1 - u];
    case 2:
      return [sx - 1 - u, sz - 1 - v];
    case 3:
      return [sx - 1 - v, u];
    default:
      return [u, v];
  }
};

/** Writes the part of a placed template that falls inside the chunk. */
export const stampPlacement = (chunk: Chunk, placement: Placement): void => {
  const { template, origin, turn } = placement;
  const [sx, sy, sz] = template.size;
  const [w, d] = footprint(placement);
  const base: Vec3 = [chunk.cx * CHUNK, chunk.cy * CHUNK, chunk.cz * CHUNK];
  const lo = [origin[0], origin[1], origin[2]].map((v, i) => Math.max(v - base[i]!, 0));
  const hi = [origin[0] + w, origin[1] + sy, origin[2] + d].map((v, i) => Math.min(v - base[i]!, CHUNK));
  for (let ly = lo[1]!; ly < hi[1]!; ly++) {
    const y = base[1] + ly - origin[1];
    for (let lz = lo[2]!; lz < hi[2]!; lz++) {
      for (let lx = lo[0]!; lx < hi[0]!; lx++) {
        const [x, z] = unturned(template.size, turn, base[0] + lx - origin[0], base[2] + lz - origin[2]);
        chunk.set(lx, ly, lz, template.blocks[x + sx * (z + sz * y)]!);
      }
    }
  }
};

/** A placed piece in world coordinates. */
export interface PlacedPiece {
  furniture: string;
  loot?: string | undefined;
  facing: Facing;
  /** Its lowest corner, in blocks. */
  pos: Vec3;
  /** Cells along world x, y and z. */
  size: Vec3;
}

/** Every piece of furniture of a placed template, in world coordinates. */
export const placedPieces = ({ template, origin, turn }: Placement): PlacedPiece[] =>
  template.pieces.map((piece) => {
    const [ax, az] = turned(template.size, turn, piece.pos[0], piece.pos[2]);
    const [bx, bz] = turned(template.size, turn, piece.pos[0] + piece.size[0] - 1, piece.pos[2] + piece.size[2] - 1);
    return {
      furniture: piece.furniture,
      loot: piece.loot,
      facing: turnFacing(piece.facing, turn),
      pos: [origin[0] + Math.min(ax, bx), origin[1] + piece.pos[1], origin[2] + Math.min(az, bz)],
      size: [Math.abs(bx - ax) + 1, piece.size[1], Math.abs(bz - az) + 1],
    };
  });
