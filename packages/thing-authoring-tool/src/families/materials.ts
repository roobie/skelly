import { cross, dot, sub, type Vec3 } from '@skelly/engine/foundation/math.ts';
import type { ExtrudedPolygonSolid } from '@skelly/engine/shapes/solid.ts';
import {
  array,
  finite,
  integer,
  minLength,
  minValue,
  number,
  parse,
  picklist,
  pipe,
  strictObject,
  string,
  transform,
  tuple,
} from 'valibot';
import { positive, revolve, scalar } from './shapes.ts';

const point = tuple([pipe(number(), finite()), pipe(number(), finite())]);
const profile = pipe(string(), transform(JSON.parse), array(point), minLength(3));

export const cutStock = (params: Readonly<Record<string, string>>): ExtrudedPolygonSolid[] => {
  const d = parse(strictObject({ profile, axis: picklist(['x', 'y', 'z']), start: scalar, end: scalar }), params);
  if (!(d.end > d.start)) {
    throw new Error('Cut stock needs positive thickness');
  }
  for (let i = 0; i < d.profile.length; i++) {
    const a = d.profile[i]!;
    const b = d.profile[(i + 1) % d.profile.length]!;
    const c = d.profile[(i + 2) % d.profile.length]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0) {
      throw new Error('Cut stock needs a convex counterclockwise profile');
    }
  }
  return [
    { id: 'body', kind: 'extruded-polygon', axis: d.axis, profile: d.profile, z: [d.start, d.end], slot: 'body' },
  ];
};

export const turnedStock = (params: Readonly<Record<string, string>>) => {
  const d = parse(strictObject({ profile, axis: picklist(['x', 'y', 'z']) }), params);
  if (d.profile.some(([, radius]) => radius < 0)) {
    throw new Error('Turned stock needs nonnegative radii');
  }
  return [{ ...revolve('body', d.profile), axis: d.axis }];
};

export const foldedSheet = (params: Readonly<Record<string, string>>): ExtrudedPolygonSolid[] => {
  const coordinate = pipe(number(), finite());
  const index = pipe(number(), integer(), minValue(0));
  const d = parse(
    strictObject({
      thickness: positive,
      vertices: pipe(string(), transform(JSON.parse), array(tuple([coordinate, coordinate, coordinate])), minLength(3)),
      faces: pipe(
        string(),
        transform(JSON.parse),
        array(strictObject({ indices: tuple([index, index, index]), slot: string() })),
        minLength(1),
      ),
    }),
    params,
  );
  return d.faces.map((face, i) => {
    const a = d.vertices[face.indices[0]];
    const b = d.vertices[face.indices[1]];
    const c = d.vertices[face.indices[2]];
    if (!(a && b && c)) {
      throw new Error('Folded sheet face references a missing vertex');
    }
    const normal = cross(sub(b, a), sub(c, a));
    if (Math.abs(normal[1]) < Number.EPSILON) {
      throw new Error('Folded sheet face needs a nonvertical surface');
    }
    const up: Vec3 = normal[1] > 0 ? normal : [-normal[0], -normal[1], -normal[2]];
    const outline = normal[1] > 0 ? [a, b, c] : [a, c, b];
    const top = dot(up, a);
    return {
      id: `fold-${i}`,
      kind: 'extruded-polygon',
      axis: 'y',
      profile: outline.map((vertex) => [vertex[2], vertex[0]]),
      z: [Math.min(a[1], b[1], c[1]) - d.thickness, Math.max(a[1], b[1], c[1])],
      clip: [
        { normal: up, offset: top },
        { normal: [-up[0], -up[1], -up[2]], offset: -top + up[1] * d.thickness },
      ],
      display: { bevel: false },
      slot: face.slot,
    };
  });
};
