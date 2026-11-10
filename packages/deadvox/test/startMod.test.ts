import { type ModIntake, selectBundledMods, startModFromUrl } from '@skelly/engine/packs';
import { currentSaveVersionIdentity } from '@skelly/engine/save';
import { configFromUrl } from '@skelly/engine/session';
import { parseTimeOfDay } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import { readPageUrl } from '../src/pageUrl.ts';
import { productModIntake } from '../src/product/mods.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { startupContent } from './baseRegistry.ts';
import { reuseBundledBuilds } from './bundledContentReuse.ts';

const row = (id: string, startTimeGameTimeOfDay = '06:30') => ({
  id,
  site: 'city',
  startTimeGameTimeOfDay,
  kit: [],
  wounds: [],
  skills: {},
  recipes: [],
});
const mod = (id: string, starts: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  version: '1',
  tier: 'scenario',
  product: false,
  dependencies: [],
  overrides: [],
  starts,
  ...extra,
});
const startMod = mod('fixture.start-mod', [row('fixture_start_mod_start')]);
const scenario = mod('fixture.scenario', [row('fixture_scenario_start')], { defaultStart: 'fixture_scenario_start' });
const intake: ModIntake = {
  ...productModIntake,
  bundledMods: [
    ...productModIntake.bundledMods,
    { id: scenario.id, data: scenario },
    { id: startMod.id, data: startMod },
  ],
};
const inline = (data: unknown) => new URLSearchParams({ 'start-mod': JSON.stringify(data) });
const select = (query: URLSearchParams, ids: string[] = []) =>
  selectBundledMods(intake, ids, [], startModFromUrl(query));
const startOf = (selection: ReturnType<typeof select>, query = '') =>
  configFromUrl(new URLSearchParams(query), {}, selection.content, ragdollSweepViewer);

reuseBundledBuilds(startupContent());

describe('start-mod parameter', () => {
  it('loads a bundled mod by id and starts the run from its one start row', () => {
    const selection = select(new URLSearchParams({ 'start-mod': ` ${startMod.id} ` }));
    expect(selection.issues).toEqual([]);
    expect(selection.admitted.map(({ id }) => id)).toEqual([startMod.id]);
    expect(selection.inlineAdmitted).toEqual([]);
    expect(startOf(selection).startId).toBe('fixture_start_mod_start');
  });

  it('admits inline mod data through mod intake and starts at its row and time of day', () => {
    const selection = select(inline(startMod));
    expect(selection.issues).toEqual([]);
    expect(selection.admitted).toEqual([]);
    expect(selection.inlineAdmitted.map(({ id }) => id)).toEqual([startMod.id]);
    const config = startOf(selection);
    expect(config.startId).toBe('fixture_start_mod_start');
    expect(config.start).toBe(parseTimeOfDay('06:30'));
    expect(startOf(selection, 'time=21:15').start).toBe(parseTimeOfDay('21:15'));
  });

  it('refuses a malformed value with an issue naming the form it read', () => {
    expect(select(new URLSearchParams({ 'start-mod': '{"id":' })).issues).toEqual([
      expect.objectContaining({ source: 'start-mod (inline mod)' }),
    ]);
    expect(select(new URLSearchParams({ 'start-mod': 'fixture.nonesuch' })).issues).toEqual([
      expect.objectContaining({ source: 'start-mod (mod id "fixture.nonesuch")', path: 'id' }),
    ]);
  });

  it('refuses inline data over the trusted byte limit', () => {
    const padded = { ...startMod, name: 'x'.repeat(productModIntake.maxModBytes) };
    expect(select(inline(padded)).issues).toEqual([
      expect.objectContaining({ source: 'start-mod (inline mod)', message: expect.stringContaining('exceeds') }),
    ]);
  });

  it.each([
    [0, []],
    [2, [row('fixture_first_start'), row('fixture_second_start')]],
  ])('refuses a start mod with %i start rows and keeps the default start', (count, starts) => {
    const selection = select(inline(mod('fixture.start-mod', starts)));
    expect(selection.issues).toEqual([]);
    expect(selection.startModRows).toBe(count);
    expect(selection.content.startModStart).toBeUndefined();
  });

  it('starts from the start mod, else a scenario loaded through mods, else the product default', () => {
    expect(startOf(select(inline(startMod), [scenario.id])).startId).toBe('fixture_start_mod_start');
    expect(startOf(select(new URLSearchParams(), [scenario.id])).startId).toBe('fixture_scenario_start');
    const plain = select(new URLSearchParams());
    expect(startOf(plain).startId).toBe(plain.content.defaultStart);
  });

  it('gives an inline start mod a save identity that changes only with its data', async () => {
    const identity = async (data: unknown) =>
      (await currentSaveVersionIdentity([], select(inline(data)).inlineAdmitted)).digest;
    const same = await identity(startMod);
    expect(await identity(structuredClone(startMod))).toBe(same);
    expect(await identity(mod(startMod.id, [row('fixture_start_mod_start', '07:00')]))).not.toBe(same);
  });

  it('refuses a link that also names its start another way', () => {
    const value = encodeURIComponent(JSON.stringify(startMod));
    expect(readPageUrl(`?start-mod=${value}`, '').refused).toBeUndefined();
    expect(readPageUrl(`?start-mod=${value}&site=city`, '').refused).toBe('site');
    expect(readPageUrl(`?start-mod=${value}&start-mod=${startMod.id}`, '').refused).toBe('start-mod');
    expect(readPageUrl(`?mods=1&start-mod=${startMod.id}`, '').refused).toBe('start-mod');
  });
});
