import { registerTemplate, type Template } from '../core/template.ts';
import { AMALGAM_MEMBER_IDS, AMALGAM_SUPPORT_BONES } from './amalgam.ts';
import { shambler, TEMPLATES } from './templates.ts';

const amalgamParams: Template['params'] = {
  height: shambler.params.height!,
  headScale: shambler.params.headScale!,
  ...Object.fromEntries(
    AMALGAM_MEMBER_IDS.flatMap((member) =>
      Object.entries(shambler.params).map(([name, spec]) => [`member.${member}.${name}`, spec]),
    ),
  ),
};

export const boss: Template = {
  name: 'boss',
  description: 'Three fused shamblers around a shared core trunk.',
  bodyPlan: 'amalgam',
  voxelSize: shambler.voxelSize,
  bodyMassKg: shambler.bodyMassKg * AMALGAM_MEMBER_IDS.length,
  params: amalgamParams,
  supportBones: AMALGAM_SUPPORT_BONES,
  budgets: {
    totalVoxels: { min: 1, max: shambler.budgets.totalVoxels.max * AMALGAM_MEMBER_IDS.length * 2 },
    totalTriangles: { min: 1, max: shambler.budgets.totalTriangles.max * AMALGAM_MEMBER_IDS.length * 3 },
    groups: {},
  },
};
registerTemplate(boss);

export const VIEWER_TEMPLATES: readonly Template[] = [...TEMPLATES, boss];
