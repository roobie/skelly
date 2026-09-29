// Seeded generation from templates. The generator only makes choices; it
// never checks feasibility. That's the validator's job, so the two stay
// independent and the generator can be measured against it.
//
// Body plans (only 'humanoid' in milestone 1) register themselves here so
// build(genome) and generate(template, seed) can dispatch without the core
// knowing anything about bones or clothes.

import type { Body } from './body.ts';
import type { BoneMesh } from './mesh.ts';
import { meshBones } from './mesh.ts';
import { pick, type Rng, range, seededRng } from './random.ts';
import type { Budgets } from './rules.ts';
import { type BodyPlan, type Genome, type ParamSpec, type Template, templateByName, type Wound } from './template.ts';
import { type Report, validate } from './validate.ts';
import { type Voxels, voxelize } from './voxelize.ts';

export const sampleParam = (rng: Rng, spec: ParamSpec): number => {
  if (typeof spec === 'number') {
    return spec;
  }
  if ('choices' in spec) {
    return pick(rng, spec.choices);
  }
  return range(rng, spec.min, spec.max);
};

/** Samples params in the given order — fixed, so the RNG stream (and so the result) is deterministic
 * regardless of how the template's params record was built. */
export const sampleParams = (
  rng: Rng,
  params: Readonly<Record<string, ParamSpec>>,
  order: readonly string[],
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const name of order) {
    const spec = params[name];
    if (spec === undefined) {
      throw new Error(`template is missing param "${name}"`);
    }
    out[name] = sampleParam(rng, spec);
  }
  return out;
};

export interface BodyPlanDef {
  readonly sample: (
    rng: Rng,
    template: Template,
  ) => { readonly params: Record<string, number>; readonly wounds: Wound[] };
  readonly build: (genome: Genome, template: Template) => Body;
  /** Every param a genome for this plan must carry, in sampling order. */
  readonly paramOrder: readonly string[];
  /** Bone ids a wound may sit on. */
  readonly woundBones: readonly string[];
}

const BODY_PLANS = new Map<BodyPlan, BodyPlanDef>();

export const registerBodyPlan = (name: BodyPlan, def: BodyPlanDef): void => {
  BODY_PLANS.set(name, def);
};

const planOf = (name: BodyPlan): BodyPlanDef => {
  const def = BODY_PLANS.get(name);
  if (!def) {
    throw new Error(`no body plan registered for "${name}"`);
  }
  return def;
};

/** Makes one genome from a template. Deterministic: the same template and seed always give the same genome. */
export const generate = (template: Template, seed: number, overrides?: { readonly voxelSize?: number }): Genome => {
  const rng = seededRng(seed);
  const { params, wounds } = planOf(template.bodyPlan).sample(rng, template);
  return { template: template.name, seed, voxelSize: overrides?.voxelSize ?? template.voxelSize, params, wounds };
};

/** Throws unless the genome is complete for its template's body plan: every param present and finite,
 * wound numbers finite, wound bones allowed. A genome parsed from JSON can be anything, and a missing
 * param would otherwise surface as NaN geometry far from the cause. */
export const checkGenome = (template: Template, genome: Genome): void => {
  const plan = planOf(template.bodyPlan);
  const where = `genome "${genome.template}" seed ${genome.seed}`;
  if (!Number.isFinite(genome.voxelSize) || genome.voxelSize <= 0) {
    throw new Error(`${where}: voxelSize must be a positive finite number, got ${String(genome.voxelSize)}`);
  }
  for (const name of plan.paramOrder) {
    const value = genome.params[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${where}: param "${name}" must be a finite number, got ${String(value)}`);
    }
  }
  genome.wounds.forEach((w, i) => {
    if (!plan.woundBones.includes(w.bone)) {
      throw new Error(`${where}: wound ${i} has bone "${w.bone}", allowed: ${plan.woundBones.join(', ')}`);
    }
    for (const field of ['t', 'angle', 'radius'] as const) {
      if (typeof w[field] !== 'number' || !Number.isFinite(w[field])) {
        throw new Error(`${where}: wound ${i} ${field} must be a finite number, got ${String(w[field])}`);
      }
    }
  });
};

export const build = (genome: Genome): Body => {
  const template = templateByName(genome.template);
  checkGenome(template, genome);
  return planOf(template.bodyPlan).build(genome, template);
};

const scaledRange = (bounds: { readonly min: number; readonly max: number }, factor: number, upperCellMargin = 0) => ({
  min: Math.max(1, Math.floor(bounds.min * factor)),
  max: Math.max(1, Math.ceil(bounds.max * factor) + upperCellMargin),
});

const parameterCenter = (spec: ParamSpec | undefined, name: string): number => {
  if (spec === undefined) {
    throw new Error(`template is missing param "${name}"`);
  }
  if (typeof spec === 'number') {
    return spec;
  }
  if ('choices' in spec) {
    return spec.choices.reduce((sum, value) => sum + value, 0) / spec.choices.length;
  }
  return (spec.min + spec.max) / 2;
};

/** Voxel budgets scale with inverse cell volume (and actor height); the head group also follows its
 * height × headScale dimensions. Triangle budgets scale with inverse cell surface area and height.
 * Floors/ceilings preserve the scaled intervals; coarse voxel-count maxima get one cell for boundary
 * quantization. */
const budgetsForGenome = (template: Template, genome: Genome): Budgets => {
  const ratio = template.voxelSize / genome.voxelSize;
  const { height, headScale } = genome.params;
  if (height === undefined || headScale === undefined) {
    throw new Error(`genome "${genome.template}" is missing height or headScale`);
  }
  const heightRatio = height / parameterCenter(template.params.height, 'height');
  const headScaleRatio = headScale / parameterCenter(template.params.headScale, 'headScale');
  const volumeScale = ratio ** 3 * heightRatio ** 3;
  const headVolumeScale = volumeScale * headScaleRatio ** 3;
  const surfaceScale = ratio ** 2 * heightRatio ** 2;
  const cellMargin = ratio < 1 ? 1 : 0;
  const groups = Object.fromEntries(
    Object.entries(template.budgets.groups).map(([name, group]) => [
      name,
      { ...group, ...scaledRange(group, headVolumeScale, cellMargin) },
    ]),
  );
  return {
    totalVoxels: scaledRange(template.budgets.totalVoxels, volumeScale, cellMargin),
    totalTriangles: scaledRange(template.budgets.totalTriangles, surfaceScale),
    groups,
  };
};

export interface Realized {
  readonly body: Body;
  readonly voxels: Voxels;
  readonly meshes: ReadonlyMap<number, BoneMesh>;
  readonly report: Report;
}

/** The full deterministic chain: genome -> body -> voxels -> meshes -> validation report. */
export const realize = (genome: Genome): Realized => {
  const template = templateByName(genome.template);
  const body = build(genome);
  const voxels = voxelize(body, genome.voxelSize, genome.seed);
  const meshes = meshBones(voxels, body.bones.length);
  const report = validate({
    body,
    voxels,
    meshes,
    feet: new Set(template.feet),
    budgets: budgetsForGenome(template, genome),
  });
  return { body, voxels, meshes, report };
};

export interface ValidGeneration {
  readonly genome: Genome;
  /** What realizing the winning genome produced, so callers need not realize it again. */
  readonly realized: Realized;
  /** The seed that produced it. */
  readonly seed: number;
  /** How many seeds were tried, including the one that worked. */
  readonly attempts: number;
}

export interface ValidSearchOptions {
  readonly maxAttempts?: number;
  /** Passed to generate(). */
  readonly overrides?: { readonly voxelSize?: number } | undefined;
  /** 1 (default) tries seed, seed + 1, ...; -1 tries seed, seed - 1, ... */
  readonly direction?: 1 | -1;
}

/** Tries seed, seed + direction, ... until one gives a genome that passes every rule, or maxAttempts run out. */
export const generateValid = (
  template: Template,
  seed: number,
  { maxAttempts = 100, overrides, direction = 1 }: ValidSearchOptions = {},
): ValidGeneration | undefined => {
  for (let i = 0; i < maxAttempts; i++) {
    const trySeed = seed + direction * i;
    const genome = generate(template, trySeed, overrides);
    const realized = realize(genome);
    if (realized.report.ok) {
      return { genome, realized, seed: trySeed, attempts: i + 1 };
    }
  }
  return undefined;
};
