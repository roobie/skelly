import { type MassProperties, massProperties, type Tensor3 } from './massProperties.ts';
import type { Template } from './template.ts';
import type { Voxels } from './voxelize.ts';

export interface TemplatePartMassProperties extends MassProperties {
  readonly fraction: number;
}

/** Inputs for assigning a template's nominal body mass to a voxel subset. */
export interface TemplatePartMassInput {
  readonly voxels: Voxels;
  readonly partBoneIndices: Iterable<number>;
  readonly bodyBoneIndices: Iterable<number>;
  readonly voxelSize: number;
  readonly template: Pick<Template, 'bodyMassKg' | 'massFractions'>;
  readonly part: string;
}

/** Assign a template's nominal body mass to a voxel subset while retaining its voxel-derived COM and
 * inertia shape. Overrides are keyed by part id; otherwise the fraction is the subset's body-volume share. */
export const templatePartMassProperties = ({
  voxels,
  partBoneIndices,
  bodyBoneIndices,
  voxelSize,
  template,
  part,
}: TemplatePartMassInput): TemplatePartMassProperties => {
  if (!(template.bodyMassKg > 0 && Number.isFinite(template.bodyMassKg))) {
    throw new RangeError('bodyMassKg must be positive and finite');
  }
  const partProperties = massProperties(voxels, partBoneIndices, voxelSize);
  const bodyProperties = massProperties(voxels, bodyBoneIndices, voxelSize);
  const fraction = template.massFractions?.[part] ?? partProperties.mass / bodyProperties.mass;
  if (!(fraction > 0 && fraction <= 1 && Number.isFinite(fraction))) {
    throw new RangeError(`mass fraction for ${part} must be in (0, 1]`);
  }
  const mass = template.bodyMassKg * fraction;
  const scale = mass / partProperties.mass;
  const inertia: Tensor3 = partProperties.inertia.map((row) => row.map((value) => value * scale)) as unknown as Tensor3;
  return { mass, center: partProperties.center, inertia, fraction };
};
