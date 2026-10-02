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
const intentionallyUnofferedGungenParams = {
  camera:
    'Opaque serialized OrbitControls position/target; the viewer generates and consumes it for shareable camera state.',
  facets:
    'Facet count of revolved solids (3-128; default 6, 24 for close-ups). A display detail with no model to choose, so the launcher has nothing to offer; no gun design has a revolved solid yet.',
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

describe('site launchers track the games’ URL parameters', () => {
  it('offers exactly the parameters deadvox reads', () => {
    assert.deepEqual(
      paramsOfferedBy('deadvox-form'),
      paramsReadBy([
        'deadvox/src/main.ts',
        'deadvox/src/game/config.ts',
        'deadvox/src/bench/run.ts',
        'deadvox/src/bench/shamblers.ts',
      ]),
    );
  });

  it('offers exactly the launcher-editable parameters gungen reads', () => {
    const gungenParamsRead = paramsReadBy(['gungen/src/viewer/main.ts']);
    for (const [name, reason] of Object.entries(intentionallyUnofferedGungenParams)) {
      assert.ok(gungenParamsRead.includes(name), `${name} is intentionally omitted: ${reason}`);
    }
    assert.deepEqual(
      paramsOfferedBy('gungen-form'),
      gungenParamsRead.filter((name) => !Object.hasOwn(intentionallyUnofferedGungenParams, name)),
    );
  });

  it('lists the current gungen templates and fixtures', () => {
    const templateNames = TEMPLATES.map(({ name }) => name);
    assert.deepEqual(optionValues('gungen-template'), templateNames);
    assert.ok(!templateNames.includes('bullpup'), 'suspended bullpup is not offered by the launcher');

    const fixtureNames = readdirSync(join(ROOT, 'gungen/fixtures'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(read(`gungen/fixtures/${name}`)).name)
      .sort();
    assert.deepEqual(optionValues('gungen-fixture').sort(), fixtureNames);

    const designNames = readdirSync(join(ROOT, 'gungen/designs'))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(JSON_FILE, ''))
      .sort();
    assert.deepEqual(optionValues('gungen-design').sort(), designNames);
  });
});
