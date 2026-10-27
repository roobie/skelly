import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { applyPoint, dot, sub, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { localSolidBounds } from '@skelly/engine/shapes/geometry.ts';
import { check, minValue, number, parse, pipe, strictObject } from 'valibot';
import content from './sightView.json' with { type: 'json' };

const Distance = pipe(number(), minValue(0));
const SightViewSchema = pipe(
  strictObject({
    minimumIronEyeDistanceMetres: Distance,
    minimumIronFarDistanceMetres: Distance,
    eyeTravelBehindGunMetres: Distance,
  }),
  check(
    (value) => value.minimumIronEyeDistanceMetres < value.minimumIronFarDistanceMetres,
    'iron eye range must have near < far',
  ),
);
const tuning = parse(SightViewSchema, content);

export const ironEyeDistanceRangeMetres = (rearDistanceMetres = 0): [number, number] => [
  tuning.minimumIronEyeDistanceMetres,
  Math.max(tuning.minimumIronFarDistanceMetres, rearDistanceMetres + tuning.eyeTravelBehindGunMetres),
];

export const ironGunEyeRange = (resolved: Resolved, eye: Vec3, direction: Vec3): [number, number] => {
  let rearDistance = 0;
  for (const [id, part] of resolved.defs) {
    const transform = resolved.placed.get(id)!;
    for (const solid of part.solids) {
      const [minimum, maximum] = localSolidBounds(solid);
      for (const x of [minimum[0], maximum[0]]) {
        for (const y of [minimum[1], maximum[1]]) {
          for (const z of [minimum[2], maximum[2]]) {
            rearDistance = Math.max(rearDistance, dot(sub(eye, applyPoint(transform, [x, y, z])), direction));
          }
        }
      }
    }
  }
  return ironEyeDistanceRangeMetres(rearDistance * resolved.domain.units.metresPerUnit);
};
