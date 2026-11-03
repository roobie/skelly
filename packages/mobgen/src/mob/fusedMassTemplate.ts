import { registerTemplate, type Template } from '../core/template.ts';
import { FUSED_MASS_MEMBER_IDS, MAX_FUSED_MASS_MEMBERS, MIN_FUSED_MASS_MEMBERS } from './fusedMass.ts';
import { humanoid, TEMPLATES } from './templates.ts';

const memberParam = (member: number, name: string): string => `member.${member}.${name}`;
const fusedMassParams: Template['params'] = {
  memberCount: {
    choices: Array.from(
      { length: MAX_FUSED_MASS_MEMBERS - MIN_FUSED_MASS_MEMBERS + 1 },
      (_, index) => MIN_FUSED_MASS_MEMBERS + index,
    ),
  },
  height: humanoid.params.height!,
  headScale: humanoid.params.headScale!,
  ...Object.fromEntries(
    FUSED_MASS_MEMBER_IDS.flatMap((member) =>
      Object.entries(humanoid.params).map(([name, spec]) => [memberParam(member, name), spec]),
    ),
  ),
  ...Object.fromEntries(
    FUSED_MASS_MEMBER_IDS.flatMap((member) => [
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

export const fusedMassTemplate: Template = {
  name: 'fused-mass',
  materials: humanoid.materials,
  ...(humanoid.materialHsl ? { materialHsl: humanoid.materialHsl } : {}),
  description: 'Procedurally fused humanoids in random orientations around a shared core.',
  bodyPlan: 'fused-mass',
  voxelSize: humanoid.voxelSize,
  bodyMassKg: humanoid.bodyMassKg * MAX_FUSED_MASS_MEMBERS,
  params: fusedMassParams,
  supportBones: 'ground-contacts',
  budgets: {
    totalVoxels: { min: 1, max: humanoid.budgets.totalVoxels.max * MAX_FUSED_MASS_MEMBERS * 2 },
    totalTriangles: { min: 1, max: humanoid.budgets.totalTriangles.max * MAX_FUSED_MASS_MEMBERS * 3 },
    groups: {},
  },
};
registerTemplate(fusedMassTemplate);

export const VIEWER_TEMPLATES: readonly Template[] = [...TEMPLATES, fusedMassTemplate];
