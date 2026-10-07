import { registerTemplate, type Template } from '../core/template.ts';
import { AMALGAM_MEMBER_IDS, MAX_AMALGAM_MEMBERS, MIN_AMALGAM_MEMBERS } from './amalgam.ts';
import { shambler, TEMPLATES } from './templates.ts';

const memberParam = (member: number, name: string): string => `member.${member}.${name}`;
const amalgamParams: Template['params'] = {
  memberCount: {
    choices: Array.from(
      { length: MAX_AMALGAM_MEMBERS - MIN_AMALGAM_MEMBERS + 1 },
      (_, index) => MIN_AMALGAM_MEMBERS + index,
    ),
  },
  height: shambler.params.height!,
  headScale: shambler.params.headScale!,
  ...Object.fromEntries(
    AMALGAM_MEMBER_IDS.flatMap((member) =>
      Object.entries(shambler.params).map(([name, spec]) => [memberParam(member, name), spec]),
    ),
  ),
  ...Object.fromEntries(
    AMALGAM_MEMBER_IDS.flatMap((member) => [
      [memberParam(member, 'anchorX'), { min: -0.25, max: 0.25 }],
      [memberParam(member, 'anchorZ'), { min: -0.25, max: 0.25 }],
      [memberParam(member, 'groundGap'), { choices: [0, 0, 0, 0.12, 0.25, 0.4] }],
      [memberParam(member, 'scale'), { min: 0.55, max: 0.7 }],
      [memberParam(member, 'rotateX'), { choices: [0, 90, 180, 270] }],
      [memberParam(member, 'rotateY'), { choices: [0, 90, 180, 270] }],
      [memberParam(member, 'rotateZ'), { choices: [0, 90, 180, 270] }],
    ]),
  ),
};

export const amalgamTemplate: Template = {
  name: 'amalgam',
  description: 'Procedurally fused shamblers in random orientations around a shared core.',
  bodyPlan: 'amalgam',
  voxelSize: shambler.voxelSize,
  bodyMassKg: shambler.bodyMassKg * MAX_AMALGAM_MEMBERS,
  params: amalgamParams,
  supportBones: 'ground-contacts',
  budgets: {
    totalVoxels: { min: 1, max: shambler.budgets.totalVoxels.max * MAX_AMALGAM_MEMBERS * 2 },
    totalTriangles: { min: 1, max: shambler.budgets.totalTriangles.max * MAX_AMALGAM_MEMBERS * 3 },
    groups: {},
  },
};
registerTemplate(amalgamTemplate);

export const VIEWER_TEMPLATES: readonly Template[] = [...TEMPLATES, amalgamTemplate];
