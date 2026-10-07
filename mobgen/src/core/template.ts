// Templates: a body plan plus sampling ranges, turned into a genome by
// generate.ts and into a body by a body-plan builder (PROJECT.md §3).
// Domain-agnostic: the core never hard-codes the humanoid's bones or params.

import type { Budgets } from './rules.ts';

/** A fixed value, a numeric range, or a set of choices to pick one from uniformly. */
export type ParamSpec =
  | number
  | { readonly min: number; readonly max: number }
  | { readonly choices: readonly number[] };

export type BodyPlan = 'humanoid' | 'crawler' | 'amalgam';
type SupportBones = readonly string[] | 'ground-contacts';

export interface Template {
  readonly name: string;
  readonly description: string;
  readonly bodyPlan: BodyPlan;
  readonly voxelSize: number;
  /** Nominal total actor mass, used by template-aware part mass assignments. */
  readonly bodyMassKg: number;
  /** Optional mass fractions by part id; unspecified parts use voxel-volume share. */
  readonly massFractions?: Readonly<Record<string, number>>;
  readonly params: Readonly<Record<string, ParamSpec>>;
  readonly budgets: Budgets;
  /** Fixed support-bone ids, or the generated voxels' actual ground contacts. */
  readonly supportBones: SupportBones;
}

export interface Wound {
  readonly bone: string;
  /** 0..1 along the bone, head to tail. */
  readonly t: number;
  /** Degrees, around the bone. */
  readonly angle: number;
  readonly radius: number;
}

/** Plain JSON: the sole source of truth for one generated actor. */
export interface Genome {
  readonly template: string;
  readonly seed: number;
  readonly voxelSize: number;
  readonly params: Readonly<Record<string, number>>;
  readonly wounds: readonly Wound[];
}

// Templates register themselves here (mob/templates.ts, on import) so that
// build(genome) and realize(genome) can dispatch on genome.template alone,
// as plain JSON with no body-plan tag of its own.
const registry = new Map<string, Template>();

export const registerTemplate = (t: Template): void => {
  registry.set(t.name, t);
};

export const templateByName = (name: string): Template => {
  const t = registry.get(name);
  if (!t) {
    throw new Error(`unknown template "${name}" (has it been imported and registered?)`);
  }
  return t;
};
