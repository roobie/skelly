import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bundledModCatalogueIssues } from '../packages/deadvox/src/core/bundledModCatalogue.ts';
import { tutorialRequested } from '../packages/deadvox/src/game/tutorialUrl.ts';
import { gitEnvironment, playtestRound, publishPlaytest } from '../packages/deadvox/tools/publish-playtest.mjs';
import { loadPlaytestText } from '../site/playtestCatalog.js';
import { applyPlaytestLanguage } from '../site/playtestLanguage.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const selectLanguage = (languages, search) => applyPlaytestLanguage(languages, search);
const page = read('site/launcher.js');
const round1Page = read('packages/deadvox/playtests/round1/round1.js');
const round2Page = read('packages/deadvox/playtests/round2/round2.js');
const GAME_WEATHERING_MAX_PATTERN = /export const WEATHERING_STRENGTH_MAX = (\d+);/;
const LAUNCHER_WEATHERING_MAX_PATTERN = /const WEATHERING_STRENGTH_MAX = (\d+);/;
const PLAY_LINK_PATTERN = /<a[^>]*class="playtest-action"[^>]*>/;
const TUTORIAL_LINK_PATTERN = /<a[^>]*class="tutorial-action"[^>]*>/;
const BEGINNER_LINK_PATTERN = /<a[^>]*class="beginner-action"[^>]*>/;
const ROUND1_STATIC_URL = playtestRound(1).url;
const ROUND1_LANGUAGE_PATTERN = /lang=\$\{language\}/;
const UMBRELLA_PLAYTEST_MARKUP_PATTERN = /playtestBrief|playtest-title|\bid=["']deadvox-playtest["']/;
const LINKS_CARD_PATTERN = /<section class="card" aria-labelledby="links-title">([\s\S]*?)<\/section>/;
const ENGLISH_DOCUMENT_LANGUAGE_PATTERN = /<html lang="en">/;
const DEADVOX_FORM_PATTERN = /<form\b[^>]*id="deadvox-form"[^>]*>([\s\S]*?)<\/form>/;
const HREF_PATTERN = /\bhref="([^"]+)"/;
const LAYOUT_FILE_PATTERN = /^layouts.*\.json$/;
const DEADVOX_CONTENT = 'packages/deadvox/src/content/base';
const RESOURCE_URL_PATTERNS = [
  /\b(?:href|src)\s*=\s*["']([^"']+)["']/g,
  /url\(\s*["']?([^"')\s]+)["']?\s*\)/g,
  /\bfrom\s+["']([^"']+)["']/g,
  /\bnew URL\(\s*["']([^"']+)["']/g,
  /<meta\b[^>]*(?:property="og:(?:url|image)"|name="twitter:image")[^>]*content="([^"]+)"/g,
];
const ROUND1_FALLBACK_PLAY_URL_PATTERN = /playtest-action|tutorial-action|\{\{PLAY_URL\}\}/;
const TEXT_ASSET_PATTERN = /\.(?:html|css|js)$/;
const ROBOTS_DISALLOW_PATTERN = /Disallow: \/\s*$/;
const resourceUrlsIn = (source) =>
  RESOURCE_URL_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
const filesUnder = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

const authoredLayoutIds = () =>
  readdirSync(join(ROOT, DEADVOX_CONTENT))
    .filter((name) => LAYOUT_FILE_PATTERN.test(name))
    .flatMap((name) => JSON.parse(read(`${DEADVOX_CONTENT}/${name}`)).layouts.map((layout) => layout.id));

const intentionallyUnofferedDeadvoxParams = {
  decals: 'A presentation comparison switch for authored-decal review, not a launcher gameplay option.',
  skyRoute:
    'A bounded hardware diagnostic owns its complete launch preset; it is not an independent launcher tuning option.',
  'save-backend': 'A storage-backend override used by save-storage browser contracts.',
  'save-test': 'A browser-contract-only gate for deterministic autosave testing.',
  wobbleNoiseScale: 'A debug-only multiplier for content-authored Brownian aim drift.',
  weatheringProfile: 'A profile choice owned by the in-game debug look panel, not the start launcher.',
  weatheringTint: 'A debug-panel weathering look slider, not a launch-time site option.',
  weatheringTintColor: 'A debug-panel weathering colour picker, not a launch-time site option.',
  weatheringStreaks: 'A debug-panel weathering look slider, not a launch-time site option.',
  weatheringStreakLength: 'A debug-panel weathering look slider, not a launch-time site option.',
  weatheringStreakColor: 'A debug-panel weathering colour picker, not a launch-time site option.',
  weatheringMoss: 'A debug-panel weathering look slider, not a launch-time site option.',
  weatheringMossColor: 'A debug-panel weathering colour picker, not a launch-time site option.',
  weatheringScale: 'A debug-panel weathering look slider, not a launch-time site option.',
  weatheringMossThreshold: 'A debug-panel weathering look slider, not a launch-time site option.',
  weatheringMossBias: 'A debug-panel weathering look slider, not a launch-time site option.',
  weatheringMixCeiling: 'A debug-panel weathering look slider, not a launch-time site option.',
  weatheringBlend: 'A debug-panel weathering look slider, not a launch-time site option.',
};
const intentionallyUnofferedGungenParams = {
  camera:
    'Opaque serialized OrbitControls position/target; the viewer generates and consumes it for shareable camera state.',
  facets:
    'Facet count of revolved solids (3-128; default 6, 24 for close-ups). A display detail with no model to choose, so the launcher has nothing to offer; no gun design has a revolved solid yet.',
  pose: 'A fixed, view-only pump action-open presentation; not an editable design parameter.',
  template: 'The launcher uses its default template without a picker.',
  fixture: 'The launcher uses its default fixture without a picker.',
  design: 'The launcher uses its default design without a picker.',
  colors: 'The launcher does not offer a color-mode picker.',
  ammo: 'The launcher does not offer an ammunition-model picker.',
  ammoCase: 'The launcher does not offer a case-finish picker.',
  mag: 'The launcher does not offer a detached-magazine picker.',
};

const paramsReadBy = (sources) => {
  const found = new Set();
  for (const source of sources) {
    const text = read(source);
    for (const match of text.matchAll(
      /(?:\b(?:params|query|initialQuery)|new URLSearchParams\([^)]*\))\.(?:get|has)\(\s*['"]([^'"]+)['"]\s*\)/g,
    )) {
      found.add(match[1]);
    }
    if (source.endsWith('core/weatheringUrl.ts')) {
      for (const match of text.matchAll(/^\s*\['(weathering[^']*)',\s*'[^']+'\],?$/gm)) {
        found.add(match[1]);
      }
    }
  }
  return [...found].sort();
};

const paramsOfferedBy = (formId) => {
  const form = page.match(new RegExp(`<form\\b[^>]*id="${formId}"[^>]*>([\\s\\S]*?)<\\/form>`))?.[1];
  if (!form) {
    throw new Error(`launcher form ${formId} is missing`);
  }
  return [...new Set([...form.matchAll(/data-url-param="([^"]+)"/g)].map((match) => match[1]))].sort();
};

const coverageFailures = (description, supportedValues, offeredValues, intentionallyOmitted = new Set()) => {
  const supported = new Set(supportedValues);
  const offered = new Set(offeredValues);
  return [
    ...[...offered]
      .filter((value) => !supported.has(value))
      .map((value) => `${description} offers unsupported value ${value}`),
    ...[...supported]
      .filter((value) => !(offered.has(value) || intentionallyOmitted.has(value)))
      .map((value) => `${description} does not offer supported value ${value}`),
  ];
};

// Evaluates the launcher's pure URL builders from the page source, so the tests observe the composed
// links rather than re-describing them.
const extractDeclaration = (name) => {
  const marker = `const ${name} = `;
  const start = page.indexOf(marker);
  if (start < 0) {
    throw new Error(`${name} is declared in the launcher`);
  }
  let depth = 0;
  for (let i = page.indexOf('{', start); i < page.length; i += 1) {
    if (page[i] === '{') {
      depth += 1;
    } else if (page[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return page.slice(start, page.indexOf(';', i) + 1);
      }
    }
  }
  throw new Error(`could not extract ${name}`);
};

const makeDeadvoxForTest = () => {
  const source = ['defaultTime', 'setDefault', 'siteOffered', 'setPlayOnlySite', 'addDebugParams', 'makeDeadvox']
    .map(extractDeclaration)
    .join('\n');
  return new Function('location', `${source}\nreturn makeDeadvox;`)({ href: 'https://example.test/site/' });
};

// Evaluates the launcher's site predicate and input handler, so the tests observe the same
// clearing rule the page runs rather than re-describing it.
const siteOfferedForTest = () => new Function(`${extractDeclaration('siteOffered')}\nreturn siteOffered;`)();
const onInputForTest = (model) => {
  const source = ['siteOffered', 'onInput'].map(extractDeclaration).join('\n');
  return new Function('model', 'refresh', `${source}\nreturn onInput;`)(model, () => {
    // The page's refresh renders and recomputes the URL; this test reads the model only.
  });
};
const benchChange = (bench) => ({
  currentTarget: { id: 'deadvox-form' },
  target: { dataset: { stateKey: 'bench' }, type: 'select-one', value: bench },
});

// Reads the launcher's own defaults and presets, so the tests cannot drift from a second copy.
const launcherModelForTest = () => new Function(`${extractDeclaration('model')}\nreturn model;`)();
const launcherPresetsForTest = () => new Function(`${extractDeclaration('presets')}\nreturn presets;`)();

describe('playtest language and catalog', () => {
  it('chooses Swedish when a Swedish browser tag comes before English', () => {
    assert.equal(selectLanguage(['sv-FI', 'en-US'], ''), 'sv');
  });

  it('chooses English when English comes before Swedish', () => {
    assert.equal(selectLanguage(['en-US', 'sv-SE'], ''), 'en');
  });

  it('chooses English when no Swedish browser tag is listed', () => {
    assert.equal(selectLanguage(['fi-FI', 'en-US'], ''), 'en');
  });

  it('honors either supported language override', () => {
    assert.equal(selectLanguage(['en-US', 'sv-SE'], '?lang=sv'), 'sv');
    assert.equal(selectLanguage(['sv-SE', 'en-US'], '?lang=en'), 'en');
  });

  it('keeps the umbrella document English and labels the Round 1 brief by language', () => {
    assert.match(read('site/index.html'), ENGLISH_DOCUMENT_LANGUAGE_PATTERN);
    assert.match(round1Page, ROUND1_LANGUAGE_PATTERN);
  });

  it('returns no catalog text when each fetch stage fails', async () => {
    const failingFetchers = [
      () => {
        throw new Error('network failure');
      },
      () => ({ ok: false }),
      () => ({ ok: true, json: () => Promise.reject(new Error('invalid JSON')) }),
    ];
    const results = await Promise.all(
      failingFetchers.map((fetcher) => loadPlaytestText(fetcher, new URL(ROUND1_STATIC_URL), 'en')),
    );
    assert.deepEqual(results, [null, null, null]);
  });

  it('provides the same playtest string keys in both languages', () => {
    const catalog = JSON.parse(read('site/playtest.json'));
    const englishKeys = Object.keys(catalog.en).sort();
    assert.ok(englishKeys.length > 0, 'the English playtest catalog has strings');
    assert.deepEqual(englishKeys, Object.keys(catalog.sv).sort());
    for (const roundPage of [round1Page, round2Page]) {
      for (const match of roundPage.matchAll(/\btext\.(\w+)/g)) {
        for (const language of ['en', 'sv']) {
          assert.ok(catalog[language][match[1]]?.trim(), `${language} provides the rendered ${match[1]} string`);
        }
      }
    }
  });
});

describe('site launchers track the games’ URL parameters', () => {
  it('offers every supported deadvox URL parameter except documented omissions', () => {
    const supported = paramsReadBy([
      'packages/deadvox/src/main.ts',
      'packages/deadvox/src/game/config.ts',
      'packages/deadvox/src/core/weatheringUrl.ts',
      'packages/deadvox/src/bench/run.ts',
      'packages/deadvox/src/bench/shamblers.ts',
      'packages/deadvox/src/debug/debugLoadout.ts',
    ]);
    const omitted = new Set(Object.keys(intentionallyUnofferedDeadvoxParams));
    for (const name of omitted) {
      assert.ok(supported.includes(name), `${name} has a documented omission reason`);
    }
    assert.deepEqual(coverageFailures('deadvox parameter', supported, paramsOfferedBy('deadvox-form'), omitted), []);
  });

  it('offers weathering overrides only in debug play and matches the game strength ceiling', () => {
    for (const [id, parameter] of [
      ['deadvox-weathering-field', 'weathering'],
      ['deadvox-weathering-variation-field', 'weatheringVariation'],
      ['deadvox-weathering-split-field', 'weatheringSplit'],
    ]) {
      assert.match(page, new RegExp(`'${id}': \\(d\\) => d\\.bench === '' && d\\.debug`));
      assert.match(page, new RegExp(`name="${parameter}" data-url-param="${parameter}"`));
    }

    const gameMax = read('packages/deadvox/src/core/weather.ts').match(GAME_WEATHERING_MAX_PATTERN);
    const launcherMax = page.match(LAUNCHER_WEATHERING_MAX_PATTERN);
    assert.ok(gameMax, 'game weathering ceiling is declared');
    assert.ok(launcherMax, 'static launcher weathering ceiling is declared');
    assert.equal(launcherMax[1], gameMax[1]);
  });

  it('drops a site the chosen bench mode does not offer', () => {
    const offered = siteOfferedForTest();
    const model = launcherModelForTest();
    const onInput = onInputForTest(model);
    const gauntlet = { ...model.deadvox, ...launcherPresetsForTest().gauntlet, debug: true };

    assert.equal(offered(gauntlet, 'gauntlet'), true, 'play offers the gauntlet');
    assert.equal(offered(gauntlet, 'testHouse'), true, 'debug play offers the debug sites');
    assert.equal(offered({ ...gauntlet, debug: false }, 'testHouse'), false, 'plain play hides the debug sites');

    for (const bench of ['1', 'shamblers', 'report']) {
      model.deadvox = { ...gauntlet, bench, site: 'gauntlet' };
      onInput(benchChange(bench));
      assert.equal(model.deadvox.site, '', `bench ${bench} clears a gauntlet site it does not offer`);
      assert.ok(offered(model.deadvox, model.deadvox.site), `bench ${bench} leaves an offered site`);
    }

    model.deadvox.bench = '';
    model.deadvox.site = 'testHouse';
    onInput(benchChange('1'));
    assert.equal(model.deadvox.site, '', 'a bench change clears a debug site');

    model.deadvox = { ...gauntlet, bench: '1', site: 'city' };
    onInput(benchChange('1'));
    assert.equal(model.deadvox.site, 'city', 'a bench that offers the city keeps it');
  });

  it('composes the gauntlet site for play and never in a benchmark', () => {
    const makeDeadvox = makeDeadvoxForTest();
    const defaults = launcherModelForTest().deadvox;
    const gauntlet = { ...defaults, ...launcherPresetsForTest().gauntlet };
    const scenarioIds = JSON.parse(read('packages/deadvox/src/content/base/scenarios.json')).scenarios.map(
      (scenario) => scenario.id,
    );
    const play = makeDeadvox(gauntlet);
    const site = play.searchParams.get('site');
    assert.ok(scenarioIds.includes(site), `the gauntlet preset composes a scenario site (${site})`);
    for (const bench of ['1', 'shamblers', 'report']) {
      const url = makeDeadvox({ ...gauntlet, bench });
      assert.equal(url.searchParams.has('site'), false, `bench ${bench} does not carry a gauntlet site`);
    }
  });

  it('links exactly the ticked bundled mods and omits mods when none is ticked', () => {
    const makeDeadvox = makeDeadvoxForTest();
    const model = launcherModelForTest();
    const onInput = onInputForTest(model);
    const ids = JSON.parse(read('packages/deadvox/src/config/bundled-mods.json')).mods.map((mod) => mod.id);
    const toggle = (id, checked) =>
      onInput({ currentTarget: { id: 'deadvox-form' }, target: { dataset: { modId: id }, type: 'checkbox', checked } });

    assert.equal(makeDeadvox(model.deadvox).searchParams.has('mods'), false, 'no ticked mod, no mods parameter');
    for (const id of ids) {
      toggle(id, true);
    }
    assert.equal(makeDeadvox(model.deadvox).searchParams.get('mods'), ids.join(','), 'every ticked id is linked');
    toggle(ids[0], false);
    assert.equal(
      makeDeadvox(model.deadvox).searchParams.get('mods') ?? '',
      ids.slice(1).join(','),
      'unticking removes only that id',
    );
  });

  it('admits a bundled mod catalogue only when the game schema does, and hides the control otherwise', async () => {
    const loadBundledMods = new Function(`${extractDeclaration('loadBundledMods')}\nreturn loadBundledMods;`)();
    const row = (id) => ({ id, label: `Label ${id}`, detail: `Detail ${id}` });
    const catalogues = {
      valid: { mods: [row('a'), row('b')] },
      empty: { mods: [] },
      duplicateIds: { mods: [row('a'), row('a')] },
      objectLabel: { mods: [{ ...row('a'), label: {} }] },
      numericDetail: { mods: [{ ...row('a'), detail: 7 }] },
      missingPresentation: { mods: [{ id: 'a' }] },
      notAList: { mods: row('a') },
    };
    await Promise.all(
      Object.entries(catalogues).map(async ([name, catalogue]) => {
        const gameAdmits = bundledModCatalogueIssues(catalogue).length === 0;
        const shown = await loadBundledMods(async () => ({ ok: true, json: async () => catalogue }), 'x');
        assert.deepEqual(shown, gameAdmits ? catalogue.mods : [], `${name}: launcher agrees with the game schema`);
      }),
    );
    assert.equal(bundledModCatalogueIssues(catalogues.valid).length, 0, 'the valid fixture passes the schema');
    assert.notEqual(bundledModCatalogueIssues(catalogues.duplicateIds).length, 0, 'duplicate ids fail the schema');
    const failed = await loadBundledMods(async () => ({ ok: false, json: async () => catalogues.valid }), 'x');
    assert.deepEqual(failed, [], 'a failed fetch hides the control');
  });

  it('composes a practice tutorial URL the game accepts from the launcher', () => {
    const makeDeadvox = makeDeadvoxForTest();
    const offered = siteOfferedForTest();
    const defaults = launcherModelForTest().deadvox;
    assert.equal(
      tutorialRequested(makeDeadvox({ ...defaults, site: 'tutorial' }).searchParams),
      true,
      'play composes a URL the game accepts as practice',
    );
    assert.equal(offered(defaults, 'tutorial'), true, 'play offers the practice tutorial');
    for (const bench of ['1', 'shamblers', 'report']) {
      assert.equal(offered({ ...defaults, bench }, 'tutorial'), false, `bench ${bench} hides the practice tutorial`);
      assert.equal(
        tutorialRequested(makeDeadvox({ ...defaults, site: 'tutorial', bench }).searchParams),
        false,
        `bench ${bench} does not compose a practice URL`,
      );
    }
  });

  it('offers every launcher-editable gungen URL parameter except documented omissions', () => {
    const supported = paramsReadBy(['packages/gun-authoring-tool/src/viewer/main.ts']);
    for (const [name, reason] of Object.entries(intentionallyUnofferedGungenParams)) {
      assert.ok(supported.includes(name), `${name} is intentionally omitted: ${reason}`);
    }
    assert.deepEqual(
      coverageFailures(
        'gungen parameter',
        supported,
        paramsOfferedBy('gungen-form'),
        new Set(Object.keys(intentionallyUnofferedGungenParams)),
      ),
      [],
    );
  });
});

describe('site launcher playtest entry', () => {
  it('keeps the Round 1 play link and routes Round 2 to the gauntlet', () => {
    assert.equal(playtestRound(1).playQuery, 'site=playtest');
    assert.equal(playtestRound(2).playQuery, 'site=gauntlet');
  });

  it('keeps the Round 1 and Round 2 links in a separate links card', () => {
    assert.doesNotMatch(page, UMBRELLA_PLAYTEST_MARKUP_PATTERN);
    const linksCard = page.match(LINKS_CARD_PATTERN);
    assert.ok(linksCard, 'the umbrella launcher has a link-list card');
    assert.ok(linksCard[1].includes('<ul>'), 'the link card presents a list');
    assert.ok(linksCard[1].includes('href="deadvox/playtest/round1/"'));
    assert.ok(linksCard[1].includes(`href="${playtestRound(2).url}"`));
    assert.match(page, DEADVOX_FORM_PATTERN);
  });

  it('renders consent terms before play and withholds the play link on catalog failure', () => {
    const termsEnd = round1Page.indexOf('</ul>');
    const playLink = round1Page.indexOf('class="playtest-action"');
    assert.ok(termsEnd >= 0, 'the consent terms are rendered as a list');
    assert.ok(playLink > termsEnd, 'the play link follows all consent terms');

    const fallbackStart = round1Page.lastIndexOf(': html`');
    assert.ok(fallbackStart >= 0, 'the page has a catalog-failure fallback');
    const fallback = round1Page.slice(fallbackStart);
    assert.doesNotMatch(fallback, ROUND1_FALLBACK_PLAY_URL_PATTERN);
  });

  it('dry-run pairs the current landing with the frozen game and carries every referenced local file', () => {
    const root = mkdtempSync(join(tmpdir(), 'skelly-playtest-'));
    try {
      mkdirSync(join(root, 'packages/deadvox'), { recursive: true });
      cpSync(join(ROOT, 'packages/deadvox/playtests'), join(root, 'packages/deadvox/playtests'), { recursive: true });
      cpSync(join(ROOT, 'site'), join(root, 'site'), { recursive: true });
      writeFileSync(
        join(root, '.gitignore'),
        '/packages/deadvox/dist-playtest/\n/packages/deadvox/dist/\nnode_modules/\n/tools/jsonnet/bin/\n',
      );
      writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
      mkdirSync(join(root, 'node_modules/fixture-dep'), { recursive: true });
      writeFileSync(join(root, 'node_modules/fixture-dep/index.js'), '// fixture dependency');
      mkdirSync(join(root, 'tools/jsonnet/bin'), { recursive: true });
      writeFileSync(join(root, 'tools/jsonnet/runtime.json'), JSON.stringify({ version: 'fixture' }));
      writeFileSync(join(root, 'tools/jsonnet/bin/fixture'), 'compiler fixture');
      writeFileSync(
        join(root, 'packages/deadvox/package.json'),
        JSON.stringify({ type: 'module', scripts: { build: 'node build.mjs' } }),
      );
      writeFileSync(
        join(root, 'packages/deadvox/build.mjs'),
        [
          "import { mkdirSync, copyFileSync, realpathSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "if (!realpathSync('../../node_modules/fixture-dep').startsWith(dirname(dirname(process.cwd())) + '/node_modules/')) throw new Error('Dependency escaped checkout');",
          "mkdirSync('dist'); copyFileSync('index.html', 'dist/index.html');",
        ].join('\n'),
      );
      const frozenGame = '<main>Frozen fixture game</main>';
      writeFileSync(join(root, 'packages/deadvox/index.html'), frozenGame);
      const git = (...args) => execFileSync('git', ['-C', root, ...args], { env: gitEnvironment() });
      git('init', '-q');
      git('add', '.');
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '--no-gpg-sign',
        '-qm',
        'fixture',
      );
      const gameSha = git('rev-parse', 'HEAD').toString().trim();
      writeFileSync(join(root, 'packages/deadvox/index.html'), '<main>Unpublished fixture game</main>');
      const landingPath = join(root, 'packages/deadvox/playtests/round1/index.html');
      const landingMarker = '<meta name="fixture-landing" content="latest">';
      writeFileSync(landingPath, readFileSync(landingPath, 'utf8').replace('</head>', `${landingMarker}</head>`));
      git('add', '.');
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '--no-gpg-sign',
        '-qm',
        'landing',
      );
      const { output, landingSha } = publishPlaytest({ round: 1, gameSha, dryRun: true, root });
      assert.notEqual(landingSha, gameSha, 'the fixture has separate landing and frozen game commits');
      const config = playtestRound(1);
      assert.equal(readFileSync(join(output, config.playPath, 'index.html'), 'utf8'), frozenGame);
      const html = readFileSync(join(output, 'index.html'), 'utf8');
      assert.ok(html.includes(landingMarker), 'the landing comes from the current commit, not the game commit');
      const script = readFileSync(join(output, 'round1.js'), 'utf8');
      const href = script.match(PLAY_LINK_PATTERN)?.[0].match(HREF_PATTERN)?.[1];
      assert.ok(href, 'the assembled page has a play link');
      assert.equal(href, `${config.playPath}?site=playtest`, 'play stays relative to the round domain');
      const tutorialHref = script.match(TUTORIAL_LINK_PATTERN)?.[0].match(HREF_PATTERN)?.[1];
      assert.ok(tutorialHref, 'the assembled page has a tutorial link');
      const tutorial = new URL(tutorialHref, config.url);
      assert.equal(tutorial.searchParams.get('tutorial'), '1', 'the tutorial action requests practice');
      tutorial.searchParams.delete('tutorial');
      const play = new URL(href, config.url);
      assert.equal(tutorial.href, play.href, 'practice uses the same frozen game URL');
      const beginnerHref = script.match(BEGINNER_LINK_PATTERN)?.[0].match(HREF_PATTERN)?.[1];
      assert.ok(beginnerHref, 'the assembled page has a beginner-mode link');
      assert.ok(script.indexOf('class="playtest-action"') < script.indexOf('class="beginner-action"'));
      const beginner = new URL(beginnerHref, config.url);
      assert.equal(beginner.searchParams.get('mods'), 'beginner', 'beginner selects its bundled mod');
      beginner.searchParams.delete('mods');
      assert.equal(beginner.href, play.href, 'beginner mode uses the same frozen game URL');
      assert.ok(authoredLayoutIds().includes(play.searchParams.get('site')), 'play selects an authored site');
      assert.equal(play.searchParams.has('debug'), false);
      assert.ok(html.includes(`<link rel="canonical" href="${config.url}"`));
      assert.ok(html.includes(`<meta property="og:url" content="${config.url}"`));
      let localReferences = 0;
      for (const path of filesUnder(output).filter((file) => TEXT_ASSET_PATTERN.test(file))) {
        const base = new URL(path.slice(output.length + 1), config.url);
        const source = readFileSync(path, 'utf8');
        assert.ok(!source.includes('{{'), `${path} has no unexpanded URLs`);
        for (const reference of resourceUrlsIn(source)) {
          const url = new URL(reference, base);
          if (url.origin !== new URL(config.url).origin) {
            continue;
          }
          localReferences += 1;
          const target = join(output, url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
          assert.ok(existsSync(target), `${reference} in ${path} is carried in the landing output`);
        }
      }
      assert.ok(localReferences > 0, 'the check exercised local resources');
      assert.match(readFileSync(join(output, 'robots.txt'), 'utf8'), ROBOTS_DISALLOW_PATTERN);

      const round2 = publishPlaytest({ round: 2, gameSha, dryRun: true, root });
      const round2Script = readFileSync(join(round2.output, 'round2.js'), 'utf8');
      const round2Href = round2Script.match(PLAY_LINK_PATTERN)?.[0].match(HREF_PATTERN)?.[1];
      assert.equal(round2Href, `${playtestRound(2).playPath}?${playtestRound(2).playQuery}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
