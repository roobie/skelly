// Sound recipes: a sound described in content as noise and tone layers, filters and gain
// envelopes, rendered once to samples (`DESIGN.md`, "Assets and credits").

import { Rng } from './random.ts';
import type { SoundDef, SoundRecipe } from './schema.ts';

export const SYNTH_NOISE_COLOURS = ['white', 'pink', 'brown'] as const;
export const SYNTH_WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export const SYNTH_FILTERS = ['lowpass', 'highpass', 'bandpass'] as const;
/** A recipe renders synchronously on its first play, so its length is bounded. */
export const SOUND_RECIPE_MAX_SECONDS = 10;

type SoundVariant = SoundDef['variants'][number];
type Layer = SoundRecipe['layers'][number];
type Envelope = readonly (readonly [number, number])[];

/** The name a variant goes by in picks, buffer caches and the listening sheet. */
export const soundVariantKey = (soundId: string, variant: SoundVariant): string =>
  typeof variant === 'string' ? variant : `recipe:${soundId}/${variant.recipe}`;

export const soundRecipeFor = (sound: SoundDef, key: string): SoundRecipe | undefined =>
  sound.variants.find(
    (variant): variant is SoundRecipe => typeof variant !== 'string' && soundVariantKey(sound.id, variant) === key,
  );

const sampleEnvelope = (points: Envelope, length: number, sampleRate: number): Float32Array => {
  const out = new Float32Array(length);
  let next = 0;
  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    while (next < points.length && points[next]![0] <= time) {
      next++;
    }
    if (next === 0) {
      out[i] = points[0]![1];
    } else if (next === points.length) {
      out[i] = points[next - 1]![1];
    } else {
      const [t0, v0] = points[next - 1]!;
      const [t1, v1] = points[next]!;
      out[i] = v0 + ((v1 - v0) * (time - t0)) / (t1 - t0);
    }
  }
  return out;
};

const normalise = (samples: Float32Array): Float32Array => {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak > 0 ? samples.map((sample) => sample / peak) : samples;
};

// Noise is normalised to full scale so a layer's gain envelope means the same for every colour.
const renderNoise = (colour: (typeof SYNTH_NOISE_COLOURS)[number], rng: Rng, length: number): Float32Array => {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let brown = 0;
  for (let i = 0; i < length; i++) {
    const white = rng.next() * 2 - 1;
    if (colour === 'white') {
      out[i] = white;
    } else if (colour === 'pink') {
      // Paul Kellet's economy pink filter.
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      out[i] = b0 + b1 + b2 + white * 0.1848;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      out[i] = brown;
    }
  }
  return normalise(out);
};

const renderTone = (
  wave: (typeof SYNTH_WAVES)[number],
  frequencyHz: Envelope,
  length: number,
  sampleRate: number,
): Float32Array => {
  const frequency = sampleEnvelope(frequencyHz, length, sampleRate);
  const out = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    out[i] =
      wave === 'sine'
        ? Math.sin(2 * Math.PI * phase)
        : wave === 'triangle'
          ? 4 * Math.abs(phase - 0.5) - 1
          : wave === 'square'
            ? phase < 0.5
              ? 1
              : -1
            : 2 * phase - 1;
    phase += frequency[i]! / sampleRate;
    phase -= Math.floor(phase);
  }
  return out;
};

// RBJ cookbook biquads, recomputed per sample so the cutoff can sweep.
const applyFilter = (samples: Float32Array, filter: NonNullable<Layer['filters']>[number], sampleRate: number) => {
  const frequency = sampleEnvelope(filter.frequencyHz, samples.length, sampleRate);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const w0 = (2 * Math.PI * Math.min(frequency[i]!, sampleRate * 0.45)) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * filter.q);
    const [b0, b1, b2] =
      filter.type === 'lowpass'
        ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
        : filter.type === 'highpass'
          ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
          : [alpha, 0, -alpha];
    const x = samples[i]!;
    const y = (b0 * x + b1 * x1 + b2 * x2 + 2 * cos * y1 - (1 - alpha) * y2) / (1 + alpha);
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    samples[i] = y;
  }
};

/** Mono samples for a recipe; the same recipe and rate always give the same samples. */
export const renderSoundRecipe = (recipe: SoundRecipe, sampleRate: number): Float32Array<ArrayBuffer> => {
  const length = Math.max(1, Math.round(recipe.durationSeconds * sampleRate));
  const out = new Float32Array(length);
  for (const [index, layer] of recipe.layers.entries()) {
    const samples =
      layer.source.type === 'noise'
        ? renderNoise(layer.source.colour, Rng.stream(recipe.seed, `${recipe.recipe}:${index}`), length)
        : renderTone(layer.source.wave, layer.source.frequencyHz, length, sampleRate);
    for (const filter of layer.filters ?? []) {
      applyFilter(samples, filter, sampleRate);
    }
    const gain = sampleEnvelope(layer.gain, length, sampleRate);
    for (let i = 0; i < length; i++) {
      out[i] = out[i]! + samples[i]! * gain[i]!;
    }
  }
  return out;
};
