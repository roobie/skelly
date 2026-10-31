// Authoring-time recipes: an ordered list of steps, each an operator that turns one Body into another,
// applied on top of a template's body plan. The plan still builds the base body and owns the rig, so
// poses, regions and wounds keep working; a recipe only reshapes, adds and paints.
//
// Domain-agnostic like the rest of core: operators register themselves (mob/recipeOps.ts) and the core
// never names a bone or a material.

import type { Body } from './body.ts';
import { type Rng, seededRng } from './random.ts';
import type { Genome, ParamSpec, Template } from './template.ts';

/** One recipe step: `op` names a registered operator; every other key is that operator's own config. */
export interface RecipeStep {
  /** Stable identity: names the step's genome params and seeds its random streams. */
  readonly id: string;
  readonly op: string;
  /** `false` keeps the step in the recipe but skips it, so toggling it never renames another step. */
  readonly enabled?: boolean;
  /** Sampling ranges for the operator's params; see `RecipeOpDef.params`. */
  readonly params?: Readonly<Record<string, ParamSpec>>;
  readonly [config: string]: unknown;
}

interface RecipeContext {
  readonly genome: Genome;
  /** This step's sampled params, under their unprefixed names. */
  readonly params: Readonly<Record<string, number>>;
  /** A stream owned by this step alone, for build-time choices such as scatter positions. */
  readonly rng: Rng;
}

export interface RecipeOpDef {
  /** Params every step of this operator samples, in order. */
  readonly params: readonly string[];
  /** Throws when a step's static config is malformed, so an authoring mistake fails at import. */
  readonly check: (step: RecipeStep, template: Template) => void;
  readonly apply: (body: Body, step: RecipeStep, ctx: RecipeContext) => Body;
}

const OPS = new Map<string, RecipeOpDef>();

export const registerRecipeOp = (name: string, def: RecipeOpDef): void => {
  OPS.set(name, def);
};

const opOf = (step: RecipeStep): RecipeOpDef => {
  const def = OPS.get(step.op);
  if (!def) {
    throw new Error(`recipe step "${step.id}" uses unknown op "${step.op}" (has it been imported and registered?)`);
  }
  return def;
};

const enabledSteps = (recipe: readonly RecipeStep[] | undefined): readonly RecipeStep[] =>
  (recipe ?? []).filter((step) => step.enabled !== false);

/** The genome name of a step's param. The prefix keeps steps from colliding with each other or the plan. */
const recipeParam = (step: RecipeStep, param: string): string => `${step.id}.${param}`;

// Separate salts so adding a sampled param never moves a step's build-time choices, and vice versa.
const SAMPLE_SALT = 0x51_7c_c1_b7;
const BUILD_SALT = 0x2f_6b_4a_93;

/** One stream per (seed, step id, purpose). Keyed by id rather than position, so adding, removing,
 * reordering or disabling a step leaves every other step's rolls unchanged for the same seed. */
const stepRng = (seed: number, id: string, salt: number): Rng => {
  let h = (0x81_1c_9d_c5 ^ salt) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01_00_01_93) >>> 0;
  }
  h = Math.imul(h ^ (seed >>> 0), 0x9e_37_79_b1) >>> 0;
  h ^= h >>> 16;
  return seededRng(h >>> 0);
};

/** Every genome param the enabled steps need, in recipe order. */
export const recipeParamOrder = (recipe: readonly RecipeStep[] | undefined): string[] =>
  enabledSteps(recipe).flatMap((step) => opOf(step).params.map((param) => recipeParam(step, param)));

const sampleSpec = (rng: Rng, spec: ParamSpec): number => {
  if (typeof spec === 'number') {
    return spec;
  }
  if ('choices' in spec) {
    return spec.choices[Math.floor(rng() * spec.choices.length)]!;
  }
  return spec.min + rng() * (spec.max - spec.min);
};

/** Samples the enabled steps' params from their own streams, leaving the body plan's stream untouched. */
export const sampleRecipeParams = (seed: number, recipe: readonly RecipeStep[] | undefined): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const step of enabledSteps(recipe)) {
    const rng = stepRng(seed, step.id, SAMPLE_SALT);
    for (const param of opOf(step).params) {
      const spec = step.params?.[param];
      if (spec === undefined) {
        throw new Error(`recipe step "${step.id}" (${step.op}) is missing param "${param}"`);
      }
      out[recipeParam(step, param)] = sampleSpec(rng, spec);
    }
  }
  return out;
};

/** Folds the enabled steps over a base body, in order. */
export const applyRecipe = (body: Body, genome: Genome, recipe: readonly RecipeStep[] | undefined): Body =>
  enabledSteps(recipe).reduce((current, step) => {
    const params = Object.fromEntries(
      opOf(step).params.map((param) => [param, genome.params[recipeParam(step, param)]!]),
    );
    return opOf(step).apply(current, step, { genome, params, rng: stepRng(genome.seed, step.id, BUILD_SALT) });
  }, body);

/** Throws unless every step has a unique, dot-free id, a registered op, all its params and a valid config. */
export const checkRecipe = (template: Template): void => {
  const seen = new Set<string>();
  for (const step of template.recipe ?? []) {
    if (!step.id || step.id.includes('.')) {
      throw new Error(`template "${template.name}": recipe step id "${step.id}" must be non-empty and dot-free`);
    }
    if (seen.has(step.id)) {
      throw new Error(`template "${template.name}": recipe step id "${step.id}" is used twice`);
    }
    seen.add(step.id);
    const def = opOf(step);
    for (const param of def.params) {
      if (step.params?.[param] === undefined) {
        throw new Error(`template "${template.name}": recipe step "${step.id}" is missing param "${param}"`);
      }
    }
    def.check(step, template);
  }
};
