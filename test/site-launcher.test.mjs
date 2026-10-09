import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const page = read('site/launcher.js');
const GUNGEN_FORM_PATTERN = /<form\b[^>]*id="gungen-form"[^>]*>([\s\S]*?)<\/form>/;
const SELECT_PATTERN = /<select\b/;
const WEATHERING_SITE_OPTION_PATTERN =
  /state\.deadvox\.debug && state\.deadvox\.bench === ''[\s\S]*value="weatheringTest"/;
const GAME_WEATHERING_MAX_PATTERN = /export const WEATHERING_STRENGTH_MAX = (\d+);/;
const LAUNCHER_WEATHERING_MAX_PATTERN = /const WEATHERING_STRENGTH_MAX = (\d+);/;
const PLAYTEST_LINK_PATTERN = /<a\b[^>]*\bid="deadvox-playtest"[^>]*>/;
const PLAYTEST_CARD_PATTERN = /<section class="card" aria-labelledby="playtest-title">([\s\S]*?)<\/section>/;
const DEADVOX_CARD_PATTERN = /<section\b[^>]*\baria-labelledby="deadvox-title"[^>]*>/;
const DEADVOX_FORM_PATTERN = /<form\b[^>]*id="deadvox-form"[^>]*>([\s\S]*?)<\/form>/;
const HREF_PATTERN = /\bhref="([^"]+)"/;
const LAYOUT_FILE_PATTERN = /^layouts.*\.json$/;
const DEADVOX_CONTENT = 'deadvox/src/content/base';

const authoredLayoutIds = () =>
  readdirSync(join(ROOT, DEADVOX_CONTENT))
    .filter((name) => LAYOUT_FILE_PATTERN.test(name))
    .flatMap((name) => JSON.parse(read(`${DEADVOX_CONTENT}/${name}`)).layouts.map((layout) => layout.id));

const intentionallyUnofferedDeadvoxParams = {
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

describe('site launchers track the games’ URL parameters', () => {
  it('offers every supported deadvox URL parameter except documented omissions', () => {
    const supported = paramsReadBy([
      'deadvox/src/main.ts',
      'deadvox/src/game/config.ts',
      'deadvox/src/core/weatheringUrl.ts',
      'deadvox/src/bench/run.ts',
      'deadvox/src/bench/shamblers.ts',
      'deadvox/src/debug/debugLoadout.ts',
    ]);
    const omitted = new Set(Object.keys(intentionallyUnofferedDeadvoxParams));
    for (const name of omitted) {
      assert.ok(supported.includes(name), `${name} has a documented omission reason`);
    }
    assert.deepEqual(coverageFailures('deadvox parameter', supported, paramsOfferedBy('deadvox-form'), omitted), []);
  });

  it('offers weathering overrides only in debug play and matches the game strength ceiling', () => {
    assert.match(page, WEATHERING_SITE_OPTION_PATTERN);
    for (const [id, parameter] of [
      ['deadvox-weathering-field', 'weathering'],
      ['deadvox-weathering-variation-field', 'weatheringVariation'],
      ['deadvox-weathering-split-field', 'weatheringSplit'],
    ]) {
      assert.match(page, new RegExp(`'${id}': \\(d\\) => d\\.bench === '' && d\\.debug`));
      assert.match(page, new RegExp(`name="${parameter}" data-url-param="${parameter}"`));
    }

    const gameMax = read('deadvox/src/core/weather.ts').match(GAME_WEATHERING_MAX_PATTERN);
    const launcherMax = page.match(LAUNCHER_WEATHERING_MAX_PATTERN);
    assert.ok(gameMax, 'game weathering ceiling is declared');
    assert.ok(launcherMax, 'static launcher weathering ceiling is declared');
    assert.equal(launcherMax[1], gameMax[1]);
  });

  it('offers every launcher-editable gungen URL parameter except documented omissions', () => {
    const supported = paramsReadBy(['gungen/src/viewer/main.ts']);
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

  it('omits the removed Gungen option controls', () => {
    const form = page.match(GUNGEN_FORM_PATTERN)?.[1];
    assert.ok(form, 'gungen form is present');
    assert.doesNotMatch(form, SELECT_PATTERN);
    for (const name of ['template', 'fixture', 'design', 'colors', 'ammo', 'ammoCase', 'mag']) {
      assert.doesNotMatch(form, new RegExp(`data-url-param="${name}"`));
    }
  });
});

describe('site launcher playtest entry', () => {
  it('keeps the playtest card distinct from the developer launcher', () => {
    const card = page.match(PLAYTEST_CARD_PATTERN);
    const playtestEntry = page.indexOf('${playtestBrief}');
    const deadvoxCard = page.match(DEADVOX_CARD_PATTERN)?.index ?? -1;
    const deadvoxForm = page.match(DEADVOX_FORM_PATTERN);
    assert.ok(card, 'the playtest has its own card');
    assert.ok(playtestEntry >= 0, 'the playtest card is included in the launcher');
    assert.ok(deadvoxCard > playtestEntry, 'the playtest card appears before the developer launcher');
    assert.ok(card[1].includes('<h1 id="playtest-title">'));
    assert.ok(card[1].indexOf('id="deadvox-playtest"') > card[1].indexOf('</ul>'), 'the play link follows the brief');
    assert.ok(deadvoxForm, 'the developer launch form is present');
    assert.equal(deadvoxForm[0].includes('id="deadvox-playtest"'), false);
  });

  it('opens an authored deadvox site without development tools', () => {
    const anchor = page.match(PLAYTEST_LINK_PATTERN)?.[0];
    assert.ok(anchor, 'the launcher has a playtest link');
    const href = anchor.match(HREF_PATTERN)?.[1];
    assert.ok(href, 'the playtest link has an href');
    const base = new URL('https://pages.example/skelly/');
    const url = new URL(href, base);
    assert.equal(`${url.origin}${url.pathname}`, new URL('deadvox/', base).href);
    const site = url.searchParams.get('site');
    assert.ok(authoredLayoutIds().includes(site), `site ${site} is an authored layout`);
    assert.equal(url.searchParams.has('debug'), false);
  });
});
