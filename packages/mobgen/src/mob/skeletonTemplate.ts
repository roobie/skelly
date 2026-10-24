import { registerTemplate, type Template, templateByName } from '../core/template.ts';
import { attackClipFor } from './attack.ts';
import './skeleton.ts';
import './templates.ts';
import data from './skeletonTemplate.json' with { type: 'json' };

export type SkeletonTemplate = Template & Omit<typeof data, keyof Template>;
const content = data as unknown as Omit<SkeletonTemplate, 'voxelSize' | 'params'> & Pick<Template, 'params'>;
const reference = templateByName(content.sizeReference);
if (reference.params.height === undefined) {
  throw new Error(`skeleton size reference "${reference.name}" has no height parameter`);
}
// Fails at import time when the content names a clip the shared table does not own.
attackClipFor(content);
export const skeletonTemplate: SkeletonTemplate = {
  ...content,
  voxelSize: reference.voxelSize,
  params: { ...content.params, height: reference.params.height },
};
registerTemplate(skeletonTemplate);
