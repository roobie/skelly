import { describe, expect, it } from 'vitest';
import { buildRegistry, requireDayCycle, validateContent } from '../src/core/content.ts';
import { lookDefaultsOf } from '../src/core/lookDefaults.ts';
import { clampExposure, clampGrade, lookOf, moodOf, TONE_KEYS } from '../src/core/mood.ts';
import { defaultLookUrlState, parseLookParams, writeLookParams } from '../src/debug/lookUrl.ts';
import { TONE_MODES } from '../src/render/look.ts';
import { baseRegistry } from './baseRegistry.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';

const registry = baseRegistry();
const defaults = lookDefaultsOf(registry);
const urlDefaults = { look: defaults, defaultFogginess: requireDayCycle(registry).weather.defaultFogginess };

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
