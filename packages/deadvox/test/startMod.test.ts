import {
  bundledModIdsFromUrl,
  type ModIntake,
  practiceModId,
  selectBundledMods,
  startModFromUrl,
} from '@skelly/engine/packs';
import { currentSaveVersionIdentity } from '@skelly/engine/save';
import { configFromUrl, isPracticeStart } from '@skelly/engine/session';
import { parseTimeOfDay } from '@skelly/engine/sim';
import { tutorialUrl } from '@skelly/presentation/tutorialUrl';
import { describe, expect, it } from 'vitest';
import { readPageUrl } from '../src/pageUrl.ts';
import { productModIntake } from '../src/product/mods.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { startupContent } from './baseRegistry.ts';
import { gameUrl, inlineStartMod } from './browser/gameUrl.mjs';
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
const startOf = (selection: ReturnType<typeof select>) =>
  configFromUrl(new URLSearchParams(), {}, selection.content, ragdollSweepViewer);

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

  it('refuses a link that names its start another way or a removed world setting', () => {
    const value = encodeURIComponent(JSON.stringify(startMod));
    expect(readPageUrl(`?start-mod=${value}`, '').refused).toBeUndefined();
    for (const name of ['site', 'time', 'start', 'tutorial']) {
      expect(readPageUrl(`?${name}=fixture`, '').refused).toBe(name);
    }
    expect(readPageUrl(`?start-mod=${value}&start-mod=${startMod.id}`, '').refused).toBe('start-mod');
    expect(readPageUrl(`?mods=1&start-mod=${startMod.id}`, '').refused).toBe('start-mod');
  });

  it('reads a browser-stage URL and admits its inline start mod with its one start row', () => {
    const url = new URL(
      gameUrl('http://localhost', {
        startMod: inlineStartMod('fixture.stage-start', row('fixture_stage_start')),
        harness: { 'save-test': 1 },
        hash: { debug: true, seed: 1 },
      }),
    );
    const page = readPageUrl(url.search, url.hash);
    expect(page.refused).toBeUndefined();
    expect(page.hash).toEqual({ debug: true, seed: 1 });
    const selection = select(page.query);
    expect(selection.issues).toEqual([]);
    expect(selection.startModRows).toBeUndefined();
    expect(selection.content.startModStart).toBe('fixture_stage_start');
  });
});

describe('committed scenario mods', () => {
  const scenarios = productModIntake.content.availablePackInputs.flatMap(({ manifest: { id, optIn, defaultStart } }) =>
    optIn && defaultStart !== undefined ? [[id, defaultStart] as const] : [],
  );
  const runOf = (ids: string[]) => {
    const { content } = selectBundledMods(productModIntake, ids);
    return { content, config: configFromUrl(new URLSearchParams(), {}, content, ragdollSweepViewer) };
  };

  it('ships scenarios that a link picks by id', () => {
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it.each(scenarios)('starts the run from the default start of %s when mods picks it', (id, defaultStart) => {
    expect(selectBundledMods(productModIntake, [id]).issues).toEqual([]);
    expect(runOf([id]).config.startId).toBe(defaultStart);
  });

  it('knows a practice run from its start row, whichever link loaded it', () => {
    const practice = practiceModId(productModIntake, startupContent().registry);
    expect(practice).toBeDefined();
    const practiceRun = (ids: string[]) => {
      const { content, config } = runOf(ids);
      return isPracticeStart(content.registry, config.startId);
    };
    expect(practiceRun([practice!])).toBe(true);
    expect(practiceRun([])).toBe(false);
  });

  it('starts from the last listed default whether it comes from a single-file mod or a folder pack', () => {
    const practice = practiceModId(intake, startupContent().registry);
    expect(practice).toBeDefined();
    const practiceRun = (ids: string[]) => {
      const selection = select(new URLSearchParams(), ids);
      expect(selection.issues).toEqual([]);
      return isPracticeStart(selection.content.registry, startOf(selection).startId);
    };
    expect(practiceRun([scenario.id, practice!])).toBe(true);
    expect(practiceRun([practice!, scenario.id])).toBe(false);
  });

  it('gives a stack of single-file mods and folder packs a save identity that follows its load order', async () => {
    const practice = practiceModId(intake, startupContent().registry);
    const folder = scenarios.find(([id]) => id !== practice)?.[0];
    expect(folder).toBeDefined();
    const digest = async (ids: string[]) => {
      const selection = select(new URLSearchParams(), ids);
      expect(selection.issues).toEqual([]);
      return (await currentSaveVersionIdentity(selection.admitted, selection.inlineAdmitted)).digest;
    };
    const listed = await digest([scenario.id, folder!]);
    expect(await digest([scenario.id, folder!])).toBe(listed);
    expect(await digest([folder!, scenario.id])).not.toBe(listed);
  });

  it('enters practice from a page with a start mod and leaves back to its start mod and mods', () => {
    const practice = practiceModId(intake, startupContent().registry)!;
    const page = new URL('https://example.test/deadvox/');
    page.searchParams.set('mods', scenario.id);
    page.searchParams.set('start-mod', JSON.stringify(startMod));
    const runOn = (href: string) => {
      const url = new URL(href);
      const read = readPageUrl(url.search, url.hash);
      expect(read.refused).toBeUndefined();
      const selection = select(read.query, bundledModIdsFromUrl(read.query));
      expect(selection.issues).toEqual([]);
      return { query: read.query, startId: startOf(selection).startId, registry: selection.content.registry };
    };
    const enterHref = tutorialUrl(page.href, practice, true);
    const entered = runOn(enterHref);
    expect(isPracticeStart(entered.registry, entered.startId)).toBe(true);
    const left = runOn(tutorialUrl(enterHref, practice, false));
    expect(left.startId).toBe('fixture_start_mod_start');
    expect({ mods: left.query.get('mods'), startMod: left.query.get('start-mod') }).toEqual({
      mods: page.searchParams.get('mods'),
      startMod: page.searchParams.get('start-mod'),
    });
  });
});
