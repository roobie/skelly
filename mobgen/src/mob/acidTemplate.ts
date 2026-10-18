import { registerTemplate, type Template, templateByName } from '../core/template.ts';
import './acid.ts';
import './templates.ts';
import data from './acidTemplate.json' with { type: 'json' };

export type AcidTemplate = Template & Omit<typeof data, keyof Template>;
const content = data as unknown as Omit<AcidTemplate, 'voxelSize' | 'params'> & Pick<Template, 'params'>;
const reference = templateByName(content.sizeReference);
if (reference.params.height === undefined) {
  throw new Error(`acid size reference "${reference.name}" has no height parameter`);
}
export const acidTemplate: AcidTemplate = {
  ...content,
  voxelSize: reference.voxelSize,
  params: { ...content.params, height: reference.params.height },
};
registerTemplate(acidTemplate);
