import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from '../gungen/src/gun/templates.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const page = read('site/index.html');
const JSON_FILE = /\.json$/;
const intentionallyUnofferedDeadvoxParams = {
  'save-backend': 'A storage-backend override used by save-storage browser contracts.',
  'save-test': 'A browser-contract-only gate for deterministic autosave testing.',
};
const intentionallyUnofferedGungenParams = {
  camera:
    'Opaque serialized OrbitControls position/target; the viewer generates and consumes it for shareable camera state.',
  facets:
    'Facet count of revolved solids (3-128; default 6, 24 for close-ups). A display detail with no model to choose, so the launcher has nothing to offer; no gun design has a revolved solid yet.',
  pose: 'A fixed, view-only pump action-open presentation; not an editable design parameter.',
};

const paramsReadBy = (sources) => {
  const found = new Set();
  for (const source of sources) {
    for (const match of read(source).matchAll(
      /\b(?:params|query|initialQuery)\.(?:get|has)\(\s*['"]([^'"]+)['"]\s*\)/g,
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

const optionValues = (selectId) => {
  const select = page.match(new RegExp(`<select\\b[^>]*id="${selectId}"[^>]*>([\\s\\S]*?)<\\/select>`))?.[1];
  if (!select) {
    throw new Error(`launcher select ${selectId} is missing`);
  }
  return [...select.matchAll(/<option\s+value="([^"]+)"/g)].map((match) => match[1]);
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

  it('offers current gungen templates, fixtures and designs without stale options', () => {
    assert.deepEqual(
      coverageFailures(
        'gungen template',
        TEMPLATES.map(({ name }) => name),
        optionValues('gungen-template'),
      ),
      [],
    );

    const fixtureNames = readdirSync(join(ROOT, 'gungen/fixtures'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(read(`gungen/fixtures/${name}`)).name);
    assert.deepEqual(coverageFailures('gungen fixture', fixtureNames, optionValues('gungen-fixture')), []);

    const designNames = readdirSync(join(ROOT, 'gungen/designs'))
      .filter((name) => name.endsWith('.json') && !name.startsWith('look-'))
      .map((name) => name.replace(JSON_FILE, ''));
    assert.deepEqual(coverageFailures('gungen design', designNames, optionValues('gungen-design')), []);
  });
});
