import type { StartDef } from '@skelly/engine/internal/core/schema/starts.ts';
import { gameTimeOfDay } from '@skelly/engine/internal/core/time.ts';
import { expect, it } from 'vitest';
import { configFromUrl, makeConfig, requireStart, startForSite } from '../src/game/entries/session.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { content } from './fixtures/startupContent.ts';

const makeStart = (overrides: Partial<StartDef> = {}): StartDef => ({
  id: 'fixture_start_entry',
  site: 'city',
  defaultForSite: true,
  seed: 27,
  storeys: 3,
  density: 0.25,
  startTimeGameTimeOfDay: gameTimeOfDay(456),
  kit: [],
  wounds: [],
  skills: {},
  recipes: [],
  ...overrides,
});
const fixture = () => {
  const entry = makeStart();
  const forest = makeStart({ id: 'fixture_start_forest', site: 'forest', seed: 31, storeys: 2, density: null });
  return {
    ...content,
    defaultStart: entry.id,
    registry: { ...content.registry, starts: new Map([entry, forest].map((row) => [row.id, row])) },
  };
};

it('takes the default run from the admitted entry rather than a runtime scenario identity', () => {
  const supplied = fixture();
  const row = supplied.registry.starts.get(supplied.defaultStart)!;
  const config = configFromUrl(new URLSearchParams(), supplied, ragdollSweepViewer);
  expect(config.startId).toBe(row.id);
  expect(config.site).toBe(row.site);
  expect(config.seed).toBe(row.seed);
  expect(config.storeys).toBe(row.storeys);
  expect(config.density).toBe(row.density);
  expect(config.start).toBe(row.startTimeGameTimeOfDay);
  expect(makeConfig(8, 96, supplied).site).toBe(row.site);
});

it('projects generated-site starts and gives explicit URL values precedence', () => {
  const supplied = fixture();
  const row = startForSite(supplied, 'forest');
  const defaults = configFromUrl(new URLSearchParams('site=forest'), supplied, ragdollSweepViewer);
  expect(defaults.startId).toBe(row.id);
  expect(defaults.seed).toBe(row.seed);
  const changed = configFromUrl(
    new URLSearchParams(`start=${row.id}&seed=44&storeys=4&density=0.75&time=11:30`),
    supplied,
    ragdollSweepViewer,
  );
  expect(changed.startId).toBe(row.id);
  expect(changed.site).toBe(row.site);
  expect(changed.seed).toBe(44);
  expect(changed.storeys).toBe(4);
  expect(changed.density).toBe(0.75);
  expect(changed.start).toBe(11.5 * 60 * 60);
});

it('refuses a selected start paired with a different site', () => {
  const supplied = fixture();
  const row = startForSite(supplied, 'forest');
  const read = (query: string) => configFromUrl(new URLSearchParams(query), supplied, ragdollSweepViewer);
  expect(() => read(`start=${row.id}&site=city`)).toThrow('requires site');
  expect(read(`start=${row.id}&site=${row.site}`).site).toBe(row.site);
});

it('refuses a missing entry or requested start instead of synthesizing a kit', () => {
  const supplied = fixture();
  expect(() => makeConfig(8, 96, { ...supplied, defaultStart: undefined })).toThrow('entry default missing');
  expect(() => configFromUrl(new URLSearchParams('start=fixture_absent_start'), supplied, ragdollSweepViewer)).toThrow(
    'fixture_absent_start',
  );
  expect(() => startForSite(supplied, 'fixture_absent_site')).toThrow('one authored default start');
});

it('requires a single normal site default and protects debug-only row selection', () => {
  const supplied = fixture();
  const debug = makeStart({ id: 'fixture_start_debug', debugOnly: true, defaultForSite: undefined });
  supplied.registry.starts.set(debug.id, debug);
  expect(() => requireStart(supplied, debug.id)).toThrow('No admitted playable start');
  expect(requireStart(supplied, debug.id, true)).toBe(debug);
  expect(startForSite(supplied, debug.site).id).toBe(supplied.defaultStart);
  const duplicate = makeStart({ id: 'fixture_start_duplicate' });
  supplied.registry.starts.set(duplicate.id, duplicate);
  expect(() => startForSite(supplied, duplicate.site)).toThrow('one authored default start');
});
