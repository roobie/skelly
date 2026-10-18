import { describe, expect, it } from 'vitest';
import { requireDayCycle } from '../src/core/content.ts';
import { lookDefaultsOf } from '../src/core/lookDefaults.ts';
import { clampExposure, clampGrade, lookOf, moodOf, TONE_KEYS } from '../src/core/mood.ts';
import { defaultLookUrlState, parseLookParams, writeLookParams } from '../src/debug/lookUrl.ts';
import { TONE_MODES } from '../src/render/look.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const defaults = lookDefaultsOf(registry);
const urlDefaults = { look: defaults, defaultFogginess: requireDayCycle(registry).weather.defaultFogginess };

describe('the content default look', () => {
  it('is what the game applies with no URL parameters', () => {
    const state = parseLookParams(new URLSearchParams(''), urlDefaults);
    expect(state).toMatchObject({ ...lookOf(defaults), ...moodOf(defaults) });
  });

  it('is written as no URL parameters, so links carry nothing for it', () => {
    const state = defaultLookUrlState(urlDefaults);
    expect(writeLookParams(new URLSearchParams('debug=1'), state, urlDefaults).toString()).toBe('debug=1');
  });

  it('is overridden by an explicit parameter and the override is written back', () => {
    const flipped = !defaults.post;
    const state = parseLookParams(new URLSearchParams(`post=${flipped ? 1 : 0}`), urlDefaults);
    expect(state.post).toBe(flipped);
    expect(writeLookParams(new URLSearchParams(''), state, urlDefaults).toString()).toBe(`post=${flipped ? 1 : 0}`);
  });

  it('holds a tone key the renderer knows and values already within the clamp ranges', () => {
    expect(TONE_MODES.map((mode) => mode.key).sort()).toEqual([...TONE_KEYS].sort());
    expect(TONE_KEYS).toContain(defaults.tone);
    expect(clampExposure(defaults.exposure)).toBe(defaults.exposure);
    expect(clampGrade(defaults.grade)).toBe(defaults.grade);
  });
});
