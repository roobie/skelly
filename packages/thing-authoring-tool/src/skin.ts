import { ModelPointSchema } from '@skelly/thing-core/schema';
import { type ExportSkin, SkinError } from '@skelly/thing-export/skin.ts';
import {
  array,
  finite,
  type InferOutput,
  literal,
  nonEmpty,
  number,
  optional,
  parse,
  picklist,
  pipe,
  strictObject,
  string,
  tuple,
  variant,
} from 'valibot';

const scalar = pipe(number(), finite());
const jointName = pipe(string(), nonEmpty());
const axis = picklist([0, 1, 2]);
export const SkinSchema = strictObject({
  joints: array(
    strictObject({
      name: jointName,
      parent: optional(jointName),
      rest: strictObject({
        r: tuple([scalar, scalar, scalar, scalar, scalar, scalar, scalar, scalar, scalar]),
        t: ModelPointSchema,
      }),
    }),
  ),
  regions: array(
    variant('kind', [
      strictObject({ kind: literal('constant'), axis, min: optional(scalar), max: optional(scalar), joint: jointName }),
      strictObject({
        kind: literal('blend'),
        axis,
        min: scalar,
        max: scalar,
        joints: tuple([jointName, jointName]),
        profile: picklist(['linear', 'smoothstep']),
      }),
    ]),
  ),
});
export type AuthoredSkin = InferOutput<typeof SkinSchema>;

export const authoredSkin = (value: AuthoredSkin): ExportSkin => {
  const skin = parse(SkinSchema, value);
  const names = new Set(skin.joints.map(({ name }) => name));
  for (const region of skin.regions) {
    if (region.min !== undefined && region.max !== undefined && region.min >= region.max) {
      throw new SkinError('Empty skin region');
    }
    const joints = region.kind === 'constant' ? [region.joint] : region.joints;
    if (joints.some((joint) => !names.has(joint))) {
      throw new SkinError('Unresolved region joint');
    }
  }
  return {
    joints: skin.joints,
    blendBands: skin.regions.flatMap((region) =>
      region.kind === 'blend' ? [{ axis: region.axis, min: region.min, max: region.max }] : [],
    ),
    weights: (point) => {
      const regions = skin.regions.filter(
        (candidate) =>
          (candidate.min === undefined || point[candidate.axis] >= candidate.min) &&
          (candidate.max === undefined || point[candidate.axis] < candidate.max),
      );
      if (regions.length !== 1) {
        throw new SkinError('Unassigned vertex or ambiguous skin regions');
      }
      const region = regions[0]!;
      if (region.kind === 'constant') {
        return [{ joint: region.joint, weight: 1 }];
      }
      const t = (point[region.axis] - region.min) / (region.max - region.min);
      const weight = region.profile === 'linear' ? t : t * t * (3 - 2 * t);
      return [
        { joint: region.joints[0], weight: 1 - weight },
        { joint: region.joints[1], weight },
      ];
    },
  };
};
