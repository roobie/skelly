// biome-ignore-all lint/style/useNamingConvention: fixtures spell jfxr's save fields as jfxr writes them.
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { jfxrPresetIssues, renderSoundRecipe } from '../src/core/soundSynth.ts';

// A partial save, as the editor accepts: jfxr fills every missing parameter with its default.
const preset = {
  _version: 1,
  _name: 'Fixture tone',
  waveform: 'sine',
  frequency: 440,
  attack: 0.01,
  sustain: 0.1,
  decay: 0.1,
};
const nonFinite = /non-finite/;
const duration = preset.attack + preset.sustain + preset.decay;

const soundRow = (jfxr: Record<string, unknown>) => ({
  id: 'door_knock_jfxr',
  description: 'fixture knock',
  category: 'world',
  gain: 0.7,
  pitchJitter: [0.95, 1.05],
  gainJitter: [0.9, 1.05],
  minIntervalSimSeconds: 0,
  noise: { enabled: false, radiusMetres: 1 },
  variants: [{ recipe: 'knock', jfxr }],
});

describe('jfxr sound recipes', () => {
  it('accepts a preset saved by the jfxr editor', () => {
    expect(jfxrPresetIssues(preset)).toEqual([]);
  });

  it('rejects presets that jfxr would silently clamp, drop or refuse', () => {
    for (const bad of [
      { ...preset, loudness: 1 },
      { ...preset, frequency: -1 },
      { ...preset, waveform: 'kazoo' },
      { ...preset, normalization: 'yes' },
      { ...preset, harmonics: 1.5 },
      { ...preset, attack: 0, sustain: 0, decay: 0 },
      { ...preset, _version: 2 },
      { ...preset, lowPassCutoff: 0 },
    ]) {
      expect(jfxrPresetIssues(bad), JSON.stringify(bad)).not.toEqual([]);
    }
  });

  it('renders the preset length at jfxr rate, audible and the same every time', () => {
    // Noise is where jfxr's seeding matters, so the determinism check needs a noise waveform.
    const recipe = { recipe: 'tone', jfxr: { ...preset, waveform: 'pinknoise' } };
    const first = renderSoundRecipe(recipe);
    expect(first.samples.length).toBe(Math.ceil(first.sampleRate * duration));
    expect(first.samples.some((sample) => Math.abs(sample) > 0.01)).toBe(true);
    expect(renderSoundRecipe(recipe).samples).toEqual(first.samples);
  });

  it('never hands playback non-finite samples from a silent preset', () => {
    expect(() => renderSoundRecipe({ recipe: 'silent', jfxr: { ...preset, lowPassCutoff: 0 } })).toThrow(nonFinite);
  });

  it('reports a bad preset as a content issue', () => {
    const load = (jfxr: Record<string, unknown>) =>
      buildRegistry([{ source: 'sounds-test.json', data: { sounds: [soundRow(jfxr)] } }]).issues;
    expect(load(preset)).toEqual([]);
    expect(load({ ...preset, waveform: 'kazoo' }).some(({ message }) => message.includes('waveform'))).toBe(true);
  });
});
