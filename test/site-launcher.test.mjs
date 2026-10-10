import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyPlaytestLanguage } from '../site/playtestLanguage.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const selectLanguage = (languages, search) => applyPlaytestLanguage(languages, search);
const page = read('site/launcher.js');
const round1Page = read('site/deadvox/playtest/round1/round1.js');
const round1Html = read('site/deadvox/playtest/round1/index.html');
const round1Css = read('site/deadvox/playtest/round1/round1.css');
const GUNGEN_FORM_PATTERN = /<form\b[^>]*id="gungen-form"[^>]*>([\s\S]*?)<\/form>/;
const SELECT_PATTERN = /<select\b/;
const WEATHERING_SITE_OPTION_PATTERN =
  /state\.deadvox\.debug && state\.deadvox\.bench === ''[\s\S]*value="weatheringTest"/;
const GAME_WEATHERING_MAX_PATTERN = /export const WEATHERING_STRENGTH_MAX = (\d+);/;
const LAUNCHER_WEATHERING_MAX_PATTERN = /const WEATHERING_STRENGTH_MAX = (\d+);/;
const ROUND1_PLAY_LINK_PATTERN = /<a[^>]*href="\.\.\/\.\.\/\.\.\/deadvox\/\?site=playtest"[^>]*>/;
const ROUND1_STATIC_URL = 'https://roobie.github.io/skelly/deadvox/playtest/round1/';
const ROUND1_LANGUAGE_PATTERN = /lang=\$\{language\}/;
const UMBRELLA_PLAYTEST_MARKUP_PATTERN = /playtestBrief|playtest-title|deadvox-playtest/;
const LINKS_CARD_PATTERN = /<section class="card" aria-labelledby="links-title">([\s\S]*?)<\/section>/;
const ENGLISH_DOCUMENT_LANGUAGE_PATTERN = /<html lang="en">/;
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

  it('provides the same playtest string keys in both languages', () => {
    const catalog = JSON.parse(read('site/playtest.json'));
    const englishKeys = Object.keys(catalog.en).sort();
    assert.ok(englishKeys.length > 0, 'the English playtest catalog has strings');
    assert.deepEqual(englishKeys, Object.keys(catalog.sv).sort());
  });
});

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
  it('keeps the Round 1 link-list card after the project cards', () => {
    assert.doesNotMatch(page, UMBRELLA_PLAYTEST_MARKUP_PATTERN);
    const linksCard = page.match(LINKS_CARD_PATTERN);
    assert.ok(linksCard, 'the umbrella launcher has a link-list card');
    assert.ok(linksCard[1].includes('<ul>'), 'the link card presents a list');
    assert.ok(linksCard[1].includes('href="deadvox/playtest/round1/"'));
    assert.equal(linksCard.index, page.lastIndexOf('<section class="card"'));
    assert.match(page, DEADVOX_FORM_PATTERN);
  });

  it('opens the authored Round 1 site without development tools', () => {
    const anchor = round1Page.match(ROUND1_PLAY_LINK_PATTERN)?.[0];
    assert.ok(anchor, 'the Round 1 page has a play link');
    const href = anchor.match(HREF_PATTERN)?.[1];
    assert.ok(href, 'the play link has an href');
    const base = new URL(ROUND1_STATIC_URL);
    const url = new URL(href, base);
    assert.equal(`${url.origin}${url.pathname}`, 'https://roobie.github.io/skelly/deadvox/');
    const site = url.searchParams.get('site');
    assert.ok(authoredLayoutIds().includes(site), `site ${site} is an authored layout`);
    assert.equal(url.searchParams.has('debug'), false);
  });

  it('serves Round 1 social metadata and the referenced static preview image', () => {
    assert.ok(round1Html.includes(`<link rel="canonical" href="${ROUND1_STATIC_URL}"`));
    assert.ok(round1Html.includes(`<meta property="og:url" content="${ROUND1_STATIC_URL}"`));
    assert.ok(round1Html.includes('<meta property="og:image:alt" content="'));
    assert.ok(round1Html.includes('<meta name="twitter:card" content="summary_large_image"'));
    assert.ok(round1Css.includes('background-image: url("../../../assets/deadvox-backdrop.jpg")'));
    const imagePath = 'site/deadvox/playtest/round1/assets/round1-social.webp';
    const imageUrl = 'https://roobie.github.io/skelly/deadvox/playtest/round1/assets/round1-social.webp';
    assert.ok(round1Html.includes(`<meta property="og:image" content="${imageUrl}"`));
    assert.ok(existsSync(join(ROOT, imagePath)));
  });
});
