import type { Solid } from '@skelly/engine/shapes/solid.ts';
import {
  array,
  check,
  finite,
  minLength,
  nonEmpty,
  number,
  optional,
  parse,
  picklist,
  pipe,
  strictObject,
  string,
  transform,
  tuple,
  variant,
} from 'valibot';
import { requireConvex } from './shapes.ts';

const coordinate = pipe(number(), finite());
const point2 = tuple([coordinate, coordinate]);
const point3 = tuple([coordinate, coordinate, coordinate]);
const axis = picklist(['x', 'y', 'z']);
const named = { id: pipe(string(), nonEmpty()), slot: pipe(string(), nonEmpty()) };
const Piece = variant('kind', [
  strictObject({ ...named, kind: picklist(['box']), min: point3, max: point3 }),
  strictObject({ ...named, kind: picklist(['prism']), axis, profile: pipe(array(point2), minLength(3)), start: coordinate, end: coordinate }),
  strictObject({ ...named, kind: picklist(['turned']), axis, origin: optional(point3), profile: pipe(array(point2), minLength(3)) }),
]);
const Pieces = pipe(
  string(),
  transform(JSON.parse),
  array(Piece),
  minLength(1),
  check((pieces) => new Set(pieces.map(({ id }) => id)).size === pieces.length, 'duplicate piece id'),
);

/**
 * Convex pieces welded into one part, each with its own slot: a pressing or casting that no single
 * primitive describes. Each piece keeps its own collision box, so the part's collision follows its shape.
 */
export const compound = (params: Readonly<Record<string, string>>): Solid[] =>
  parse(strictObject({ pieces: Pieces }), params).pieces.map((piece): Solid => {
    if (piece.kind === 'box') {
      if (!piece.min.every((low, i) => low < piece.max[i]!)) {
        throw new Error(`Compound box ${piece.id} needs positive size`);
      }
      return {
        id: piece.id,
        kind: 'box',
        box: {
          center: [0, 1, 2].map((i) => (piece.min[i]! + piece.max[i]!) / 2) as [number, number, number],
          half: [0, 1, 2].map((i) => (piece.max[i]! - piece.min[i]!) / 2) as [number, number, number],
        },
        slot: piece.slot,
      };
    }
    if (piece.kind === 'prism') {
      if (!(piece.end > piece.start)) {
        throw new Error(`Compound prism ${piece.id} needs positive thickness`);
      }
      requireConvex(piece.profile, `Compound prism ${piece.id}`);
      return {
        id: piece.id,
        kind: 'extruded-polygon',
        axis: piece.axis,
        profile: piece.profile,
        z: [piece.start, piece.end],
        slot: piece.slot,
      };
    }
    if (piece.profile.some(([, radius]) => radius < 0)) {
      throw new Error(`Compound turned piece ${piece.id} needs nonnegative radii`);
    }
    return {
      id: piece.id,
      kind: 'revolved',
      axis: piece.axis,
      profile: piece.profile,
      ...(piece.origin ? { origin: piece.origin } : {}),
      slot: piece.slot,
    };
  });
