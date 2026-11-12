import { buildRegistry, requireDayCycle } from '@skelly/engine/content';
import { validateContent } from '@skelly/engine/internal/core/content.ts';
import { TONE_KEYS } from '@skelly/engine/internal/core/mood.ts';
import { clampExposure, clampGrade, graphicsTuningOf, lookDefaultsOf, lookOf, moodOf } from '@skelly/engine/look';
import { TONE_MODES } from '@skelly/presentation/render';
import { describe, expect, it } from 'vitest';
import { defaultLookUrlState, parseLookParams, writeLookParams } from '../src/debug/lookUrl.ts';
import { baseRegistry } from './baseRegistry.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';

const registry = baseRegistry();
const defaults = lookDefaultsOf(registry);
const urlDefaults = {
  look: defaults,
  defaultWeather: requireDayCycle(registry).weather.defaults,
  sunShadow: graphicsTuningOf(registry).sunShadow,
};

describe('the content default look', () => {
  it('requires complete mob presentation tuning and admits a mod-authored look', () => {
    const row = { id: 'fixture', ...LOOK_FIXTURE };
    const source = (look: unknown) => ({ source: 'fixture-look.json', data: { look: [look] } });
    expect(validateContent(source(row))).toEqual([]);
    expect(buildRegistry([source(row)]).registry.look.get(row.id)?.mobActors).toEqual(row.mobActors);
    const { launchSpinRadiansPerSimSecond: _spin, ...incomplete } = row.mobActors;
    for (const mobActors of [
      incomplete,
      { ...row.mobActors, corpseSinkSimSeconds: 0 },
      { ...row.mobActors, hearingGazeJitter: { ...row.mobActors.hearingGazeJitter, yawDegrees: -1 } },
    ]) {
      const candidate = source({ ...row, mobActors });
      expect(validateContent(candidate).length).toBeGreaterThan(0);
      expect(buildRegistry([candidate]).registry.look.size).toBe(0);
    }
  });

  it('is what the game applies with no hash keys', () => {
    const state = parseLookParams({}, urlDefaults);
    expect(state).toMatchObject({ ...lookOf(defaults), ...moodOf(defaults) });
  });

  it('is written as no hash keys, so links carry nothing for it', () => {
    const state = defaultLookUrlState(urlDefaults);
    expect(writeLookParams({ debug: true }, state, urlDefaults)).toEqual({ debug: true });
  });

  it('is overridden by an explicit key and the override is written back', () => {
    const flipped = !defaults.post;
    const state = parseLookParams({ post: flipped }, urlDefaults);
    expect(state.post).toBe(flipped);
    expect(writeLookParams({}, state, urlDefaults)).toEqual({ post: flipped });
  });

  it('holds a tone key the renderer knows and values already within the clamp ranges', () => {
    expect(TONE_MODES.map((mode) => mode.key).sort()).toEqual([...TONE_KEYS].sort());
    expect(TONE_KEYS).toContain(defaults.tone);
    expect(clampExposure(defaults.exposure)).toBe(defaults.exposure);
    expect(clampGrade(defaults.grade)).toBe(defaults.grade);
  });
});
