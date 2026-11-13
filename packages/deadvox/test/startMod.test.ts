import {
  bundledModIdsFromUrl,
  type ModIntake,
  type PackInput,
  practiceModId,
  selectBundledMods,
  startModFromUrl,
} from '@skelly/engine/packs';
import { currentSaveVersionIdentity } from '@skelly/engine/save';
import { configFromUrl, isPracticeStart } from '@skelly/engine/session';
import { parseTimeOfDay } from '@skelly/engine/sim';
import { logPracticeWarnings, stagePracticeLink, tutorialUrl } from '@skelly/presentation/tutorialUrl';
import { describe, expect, it, vi } from 'vitest';
import { readPageUrl } from '../src/pageUrl.ts';
import { productModIntake } from '../src/product/mods.ts';
import { PRODUCT_ENTRY_PACK } from '../src/product/packSelection.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { startupContent } from './baseRegistry.ts';
import { gameUrl, inlineStartMod } from './browser/gameUrl.mjs';
import { reuseBundledBuilds, withReusedBuilds } from './bundledContentReuse.ts';

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
const scenario = mod('fixture.scenario', [row('fixture_scenario_start')], {
  defaultStart: 'fixture_scenario_start',
  dependencies: ['skelly.deadvox'],
  overrides: [{ pack: 'skelly.deadvox', entry: 'defaultStart' }],
});
const startOwner = mod('fixture.start-owner', [row('fixture_owned_start')]);
const secondOwner = mod('fixture.start-owner.two', [row('fixture_second_owner_start')]);
const chainLink = mod('fixture.chain-link', [], { dependencies: [startOwner.id] });
const inherits = mod('fixture.inherits', [], { dependencies: [startOwner.id] });
const inheritsChain = mod('fixture.inherits-chain', [], { dependencies: [chainLink.id] });
const inheritsTwo = mod('fixture.inherits-two', [], { dependencies: [startOwner.id, secondOwner.id] });
const inheritsEntry = mod('fixture.inherits-entry', [], { dependencies: [PRODUCT_ENTRY_PACK] });
// A base-stack pack whose only file is json metadata shaped like a start list; a pack's definitions come from its
// manifest-declared content files, so this shape must not reach start selection.
const metadataPack: PackInput = {
  source: 'fixture.metadata',
  manifest: {
    id: 'fixture.metadata',
    version: '1',
    tier: 'theme',
    product: false,
    dependencies: [],
    overrides: [],
    files: [{ path: 'metadata.json', kind: 'json' }],
  },
  files: [{ source: 'metadata.json', data: { starts: [{ id: 'fixture_not_content' }] } }],
};
const inheritsMetadata = mod('fixture.inherits-metadata', [], {
  dependencies: [startOwner.id, metadataPack.manifest.id],
});
const intake: ModIntake = {
  ...productModIntake,
  bundledMods: [
    ...productModIntake.bundledMods,
    { id: scenario.id, data: scenario },
    { id: startMod.id, data: startMod },
    { id: startOwner.id, data: startOwner },
    { id: secondOwner.id, data: secondOwner },
    { id: chainLink.id, data: chainLink },
    { id: inherits.id, data: inherits },
    { id: inheritsChain.id, data: inheritsChain },
    { id: inheritsTwo.id, data: inheritsTwo },
    { id: inheritsEntry.id, data: inheritsEntry },
  ],
};
const { buildBundledContent } = productModIntake.content;
// The build closure admits only the real base stack, so the metadata pack rides in as a selected pack and the
// walk resolves it as base stack: it is admitted everywhere, contributes no definition, and needs no build identity.
const metadataIntake: ModIntake = {
  ...productModIntake,
  content: {
    ...productModIntake.content,
    bundledPackInputs: [...productModIntake.content.bundledPackInputs, metadataPack],
    buildBundledContent: (mods = [], modsSelected = mods.length > 0) =>
      buildBundledContent([metadataPack, ...mods], modsSelected),
  },
  bundledMods: [
    ...productModIntake.bundledMods,
    { id: startOwner.id, data: startOwner },
    { id: inheritsMetadata.id, data: inheritsMetadata },
  ],
};
const inline = (data: unknown) => new URLSearchParams({ 'start-mod': JSON.stringify(data) });
const select = (query: URLSearchParams, ids: string[] = []) =>
  selectBundledMods(intake, ids, [], startModFromUrl(query));
const selectMetadata = (query: URLSearchParams, ids: string[] = []) =>
  selectBundledMods(metadataIntake, ids, [], startModFromUrl(query));
const startOf = (selection: ReturnType<typeof select>) =>
  configFromUrl(new URLSearchParams(), {}, selection.content, ragdollSweepViewer);

reuseBundledBuilds(startupContent());

const scenarios = productModIntake.content.availablePackInputs.flatMap(({ manifest: { id, optIn, defaultStart } }) =>
  optIn && defaultStart !== undefined ? [[id, defaultStart] as const] : [],
);
const practice = practiceModId(intake, startupContent().registry);
const folder = scenarios.find(([id]) => id !== practice)?.[0];
const withTime = (time: string) => mod(startMod.id, [row('fixture_start_mod_start', time)]);

const stageLink = (): URL =>
  new URL(
    gameUrl('http://localhost', {
      startMod: inlineStartMod('fixture.stage-start', row('fixture_stage_start')),
      harness: { 'save-test': 1 },
      hash: { debug: true, seed: 1 },
    }),
  );
const stage = () => {
  const url = stageLink();
  const page = readPageUrl(url.search, url.hash);
  return { page, selection: select(page.query) };
};

/**
 * Each distinct selection rebuilds the whole base registry, about a second apiece. Building them while the file is
 * collected keeps that cost out of every case's timeout, so machine load cannot fail a case that only reads one.
 */
const picked = withReusedBuilds(() => ({
  bundled: select(new URLSearchParams({ 'start-mod': ` ${startMod.id} ` })),
  inline: select(inline(startMod)),
  inlineCopy: select(inline(structuredClone(startMod))),
  inlineLater: select(inline(withTime('07:00'))),
  malformed: select(new URLSearchParams({ 'start-mod': '{"id":' })),
  unknownId: select(new URLSearchParams({ 'start-mod': 'fixture.nonesuch' })),
  noRows: select(inline(mod(startMod.id, []))),
  twoRows: select(inline(mod(startMod.id, [row('fixture_first_start'), row('fixture_second_start')]))),
  inherits: select(new URLSearchParams({ 'start-mod': inherits.id }), [startOwner.id]),
  inheritsChain: select(new URLSearchParams({ 'start-mod': inheritsChain.id }), [chainLink.id, startOwner.id]),
  inheritsTwo: select(new URLSearchParams({ 'start-mod': inheritsTwo.id }), [startOwner.id, secondOwner.id]),
  inheritsEntry: select(new URLSearchParams({ 'start-mod': inheritsEntry.id })),
  inheritsMetadata: selectMetadata(new URLSearchParams({ 'start-mod': inheritsMetadata.id }), [startOwner.id]),
  withPractice: select(inline(startMod), [practice!]),
  overScenario: select(inline(startMod), [scenario.id]),
  scenarioOnly: select(new URLSearchParams(), [scenario.id]),
  plain: select(new URLSearchParams()),
  stacked: select(new URLSearchParams(), [startMod.id, folder!]),
  stackedReversed: select(new URLSearchParams(), [folder!, startMod.id]),
  stage: stage(),
  committed: new Map(scenarios.map(([id]) => [id, selectBundledMods(productModIntake, [id])] as const)),
}));

describe('start-mod parameter', () => {
  it('loads a bundled mod by id and starts the run from its one start row', () => {
    const selection = picked.bundled;
    expect(selection.issues).toEqual([]);
    expect(selection.admitted.map(({ id }) => id)).toEqual([startMod.id]);
    expect(selection.inlineAdmitted).toEqual([]);
    expect(startOf(selection).startId).toBe('fixture_start_mod_start');
  });

  it('admits inline mod data through mod intake and starts at its row and time of day', () => {
    const selection = picked.inline;
    expect(selection.issues).toEqual([]);
    expect(selection.admitted).toEqual([]);
    expect(selection.inlineAdmitted.map(({ id }) => id)).toEqual([startMod.id]);
    const config = startOf(selection);
    expect(config.startId).toBe('fixture_start_mod_start');
    expect(config.start).toBe(parseTimeOfDay('06:30'));
  });

  it('refuses a malformed value with an issue naming the form it read', () => {
    expect(picked.malformed.issues).toEqual([expect.objectContaining({ source: 'start-mod (inline mod)' })]);
    expect(picked.unknownId.issues).toEqual([
      expect.objectContaining({
        source: 'start-mod (mod id "fixture.nonesuch")',
        path: 'id',
      }),
    ]);
  });

  it('refuses inline data over the trusted byte limit', () => {
    const padded = {
      ...startMod,
      name: 'x'.repeat(productModIntake.maxModBytes),
    };
    expect(select(inline(padded)).issues).toEqual([
      expect.objectContaining({
        source: 'start-mod (inline mod)',
        message: expect.stringContaining('exceeds'),
      }),
    ]);
  });

  it.each([
    [0, picked.noRows],
    [2, picked.twoRows],
    [0, picked.inheritsEntry],
    [2, picked.inheritsTwo],
  ])('refuses a start mod with %i start rows and keeps the default start', (count, selection) => {
    expect(selection.issues).toEqual([]);
    expect(selection.startModRows).toBe(count);
    expect(selection.content.startModStart).toBeUndefined();
  });

  it('starts from the one start row a start mod inherits from its dependency', () => {
    const selection = picked.inherits;
    expect(selection.issues).toEqual([]);
    expect(selection.admitted.map(({ id }) => id)).toEqual([startOwner.id, inherits.id]);
    expect(selection.startModRows).toBeUndefined();
    expect(startOf(selection).startId).toBe('fixture_owned_start');
  });

  it('starts from a start row inherited through a dependency chain', () => {
    const selection = picked.inheritsChain;
    expect(selection.issues).toEqual([]);
    expect(selection.startModRows).toBeUndefined();
    expect(startOf(selection).startId).toBe('fixture_owned_start');
  });

  it('does not count starts-shaped json metadata in a dependency as a start row', () => {
    const selection = picked.inheritsMetadata;
    expect(selection.issues).toEqual([]);
    expect(selection.startModRows).toBeUndefined();
    expect(startOf(selection).startId).toBe('fixture_owned_start');
  });

  it('starts from the start mod even when the practice pack is listed', () => {
    expect(practice).toBeDefined();
    const selection = picked.withPractice;
    expect(selection.issues).toEqual([]);
    expect(selection.admitted.map(({ id }) => id)).toContain(practice);
    expect(startOf(selection).startId).toBe('fixture_start_mod_start');
  });

  it('starts from the start mod, else a scenario loaded through mods, else the product default', () => {
    expect(startOf(picked.overScenario).startId).toBe('fixture_start_mod_start');
    expect(startOf(picked.scenarioOnly).startId).toBe('fixture_scenario_start');
    const { plain } = picked;
    expect(startOf(plain).startId).toBe(plain.content.defaultStart);
  });

  it('gives an inline start mod a save identity that changes only with its data', async () => {
    const identity = async ({ inlineAdmitted }: typeof picked.inline) =>
      (await currentSaveVersionIdentity([], inlineAdmitted)).digest;
    const same = await identity(picked.inline);
    expect(await identity(picked.inlineCopy)).toBe(same);
    expect(await identity(picked.inlineLater)).not.toBe(same);
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
    const { page, selection } = picked.stage;
    expect(page.refused).toBeUndefined();
    expect(page.hash).toEqual({ debug: true, seed: 1 });
    expect(selection.issues).toEqual([]);
    expect(selection.startModRows).toBeUndefined();
    expect(selection.content.startModStart).toBe('fixture_stage_start');
  });
});

describe('committed scenario mods', () => {
  const runOf = (ids: string[]) => {
    const { content } = selectBundledMods(productModIntake, ids);
    return {
      content,
      config: configFromUrl(new URLSearchParams(), {}, content, ragdollSweepViewer),
    };
  };

  it('ships scenarios that a link picks by id', () => {
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it.each(scenarios)('starts the run from the default start of %s when mods picks it', (id, defaultStart) => {
    expect(picked.committed.get(id)?.issues).toEqual([]);
    expect(runOf([id]).config.startId).toBe(defaultStart);
  });

  it('knows a practice run from its start row, whichever link loaded it', () => {
    expect(practice).toBeDefined();
    const practiceRun = (ids: string[]) => {
      const { content, config } = runOf(ids);
      return isPracticeStart(content.registry, config.startId);
    };
    expect(practiceRun([practice!])).toBe(true);
    expect(practiceRun([])).toBe(false);
  });

  it('replaces another start pack and warns on the loaded practice page, not the departing page', () => {
    const other = scenarios.find(([id]) => id !== practice)?.[0];
    expect(practice).toBeDefined();
    expect(other).toBeDefined();
    const runOn = (href: string) => {
      const url = new URL(href);
      const read = readPageUrl(url.search, url.hash);
      expect(read.refused).toBeUndefined();
      const { content, issues } = selectBundledMods(productModIntake, bundledModIdsFromUrl(read.query));
      expect(issues).toEqual([]);
      return isPracticeStart(content.registry, configFromUrl(read.query, {}, content, ragdollSweepViewer).startId);
    };
    const page = `https://example.test/deadvox/?mods=${practice},${other}`;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const link = tutorialUrl(
        page,
        practice!,
        productModIntake.content.availablePackInputs.map(({ manifest }) => manifest),
      );
      const data = new Map<string, string>();
      const stash = () => ({
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
      });
      const href = stagePracticeLink(link, stash);
      expect(warning).not.toHaveBeenCalled();
      expect(new URL(href).searchParams.get('mods')?.split(',')).not.toContain(other);
      expect(runOn(href)).toBe(true);
      logPracticeWarnings(href, stash);
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning.mock.calls.flat().some((value) => String(value).includes(other!))).toBe(true);
      warning.mockClear();
      logPracticeWarnings(href, stash);
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('gives a stack of single-file mods and folder packs a save identity that follows its load order', async () => {
    expect(folder).toBeDefined();
    const digest = async (selection: typeof picked.stacked) => {
      expect(selection.issues).toEqual([]);
      return (await currentSaveVersionIdentity(selection.admitted, selection.inlineAdmitted)).digest;
    };
    const listed = await digest(picked.stacked);
    expect(await digest(picked.stacked)).toBe(listed);
    expect(await digest(picked.stackedReversed)).not.toBe(listed);
  });
});
