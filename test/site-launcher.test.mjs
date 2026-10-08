import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const page = read('site/launcher.js');
const GUNGEN_FORM_PATTERN = /<form\b[^>]*id="gungen-form"[^>]*>([\s\S]*?)<\/form>/;
const SELECT_PATTERN = /<select\b/;

const intentionallyUnofferedDeadvoxParams = {
  'save-backend': 'A storage-backend override used by save-storage browser contracts.',
  'save-test': 'A browser-contract-only gate for deterministic autosave testing.',
  wobbleNoiseScale: 'A debug-only multiplier for content-authored Brownian aim drift.',
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
    for (const match of read(source).matchAll(
      /(?:\b(?:params|query|initialQuery)|new URLSearchParams\([^)]*\))\.(?:get|has)\(\s*['"]([^'"]+)['"]\s*\)/g,
    )) {
      found.add(match[1]);
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
