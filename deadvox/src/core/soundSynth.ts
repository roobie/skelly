// Sound recipes: a sound given in content as a jfxr preset and rendered by the jfxr library
// (`DESIGN.md`, "Assets and credits").

import { type Clip, type Parameter, Sound, Synth } from 'jfxr';
import type { SoundDef, SoundRecipe } from './schema.ts';

type SoundVariant = SoundDef['variants'][number];

/** The editor's bookkeeping fields, which carry no sound. */
const JFXR_METADATA = new Set(['_version', '_name', '_locked']);

/** The name a variant goes by in picks, buffer caches and the listening sheet. */
export const soundVariantKey = (soundId: string, variant: SoundVariant): string =>
  typeof variant === 'string' ? variant : `recipe:${soundId}/${variant.recipe}`;

export const soundRecipeFor = (sound: SoundDef, key: string): SoundRecipe | undefined =>
  sound.variants.find(
    (variant): variant is SoundRecipe => typeof variant !== 'string' && soundVariantKey(sound.id, variant) === key,
  );

const numberProblem = (param: Parameter, value: unknown): string | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'must be a number';
  }
  if (param.type === 'int' && !Number.isInteger(value)) {
    return 'must be a whole number';
  }
  if ((param.minValue !== null && value < param.minValue) || (param.maxValue !== null && value > param.maxValue)) {
    return `must be between ${param.minValue} and ${param.maxValue}`;
  }
  return undefined;
};

const parameterProblem = (param: Parameter | undefined, key: string, value: unknown): string | undefined => {
  if (!param) {
    return JFXR_METADATA.has(key) ? undefined : 'is not a jfxr parameter';
  }
  if (param.type === 'boolean') {
    return typeof value === 'boolean' ? undefined : 'must be true or false';
  }
  if (param.type === 'enum') {
    const values = Object.keys(param.values ?? {});
    return typeof value === 'string' && values.includes(value) ? undefined : `must be one of ${values.join(', ')}`;
  }
  return numberProblem(param, value);
};

/**
 * What is wrong with a preset, judged by jfxr's own parameter list. jfxr's parser ignores
 * unknown fields and clamps or drops bad values, so content would silently play something
 * other than what it says; these issues reject that instead.
 */
export const jfxrPresetIssues = (preset: Readonly<Record<string, unknown>>): string[] => {
  const sound = new Sound();
  try {
    sound.parse(JSON.stringify(preset));
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const params = new Map<string, Parameter>();
  sound.forEachParam((key, param) => params.set(key, param));
  const issues: string[] = [];
  for (const [key, value] of Object.entries(preset)) {
    const problem = parameterProblem(params.get(key), key, value);
    if (problem) {
      issues.push(`${key} ${problem}`);
    }
  }
  if (sound.duration() <= 0) {
    issues.push('attack, sustain and decay must add up to more than zero');
  }
  if (issues.length === 0) {
    // jfxr's normaliser divides by the loudest sample, so a preset that renders silence (a
    // low-pass cutoff of 0, say) comes out as NaN; only a render shows which presets do.
    const problem = renderProblem(preset);
    if (problem) {
      issues.push(problem);
    }
  }
  return issues;
};

const renderJfxr = (preset: Readonly<Record<string, unknown>>): Clip | undefined => {
  let clip: Clip | undefined;
  // jfxr renders in one go and only defers its done callback; running that callback at once keeps the render synchronous.
  new Synth(JSON.stringify(preset), (callback) => callback()).run((done) => {
    clip = done;
  });
  return clip;
};

const renderProblem = (preset: Readonly<Record<string, unknown>>): string | undefined => {
  const clip = renderJfxr(preset);
  if (!clip) {
    return 'jfxr did not finish rendering';
  }
  return clip.toFloat32Array().every(Number.isFinite)
    ? undefined
    : 'renders non-finite samples, which happens when its filters leave only silence to normalise';
};

/** Mono samples for a recipe at jfxr's rate; jfxr seeds its noise, so a preset always renders the same. */
export const renderSoundRecipe = (recipe: SoundRecipe): { samples: Float32Array<ArrayBuffer>; sampleRate: number } => {
  const clip = renderJfxr(recipe.jfxr);
  if (!clip) {
    throw new Error(`jfxr did not finish rendering recipe ${recipe.recipe}`);
  }
  const samples = clip.toFloat32Array();
  if (!samples.every(Number.isFinite)) {
    throw new Error(`jfxr rendered non-finite samples for recipe ${recipe.recipe}`);
  }
  return { samples, sampleRate: clip.getSampleRate() };
};
