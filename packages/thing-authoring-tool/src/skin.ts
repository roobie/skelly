import type { ExportSkin } from '@skelly/thing-export/skin.ts';
import { SkinError } from '@skelly/thing-export/skin.ts';
import { ModelPointSchema } from '@skelly/thing-core/schema';
import { array, finite, type InferOutput, literal, nonEmpty, number, optional, parse, picklist, pipe, strictObject, string, tuple, variant } from 'valibot';

const scalar = pipe(number(), finite());
const name = pipe(string(), nonEmpty());
const axis = picklist([0, 1, 2]);
export const SkinSchema = strictObject({
  joints: array(strictObject({ name, parent: optional(name), rest: strictObject({
    r: tuple([scalar, scalar, scalar, scalar, scalar, scalar, scalar, scalar, scalar]),
    t: ModelPointSchema,
  }) })),
  regions: array(variant('kind', [
    strictObject({ kind: literal('constant'), axis, min: optional(scalar), max: optional(scalar), joint: name }),
    strictObject({ kind: literal('blend'), axis, min: scalar, max: scalar, joints: tuple([name, name]), profile: picklist(['linear', 'smoothstep']) }),
  ])),
});
export type AuthoredSkin = InferOutput<typeof SkinSchema>;

export const authoredSkin = (value: AuthoredSkin): ExportSkin => {
  const skin = parse(SkinSchema, value);
  const names = new Set(skin.joints.map(({ name }) => name));
  for (const region of skin.regions) {
    if (region.min !== undefined && region.max !== undefined && region.min >= region.max) throw new SkinError('Empty skin region');
    const joints = region.kind === 'constant' ? [region.joint] : region.joints;
    if (joints.some((joint) => !names.has(joint))) throw new SkinError('Unresolved region joint');
  }
  return { joints: skin.joints, weights: (point) => {
    const regions = skin.regions.filter((region) => (region.min === undefined || point[region.axis] >= region.min) && (region.max === undefined || point[region.axis] < region.max));
    if (regions.length !== 1) throw new SkinError('Unassigned vertex or ambiguous skin regions');
    const region = regions[0]!;
    if (region.kind === 'constant') return [{ joint: region.joint, weight: 1 }];
    const t = (point[region.axis] - region.min) / (region.max - region.min);
    const weight = region.profile === 'linear' ? t : t * t * (3 - 2 * t);
    return [{ joint: region.joints[0], weight: 1 - weight }, { joint: region.joints[1], weight }];
  } };
};
