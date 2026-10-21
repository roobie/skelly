import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadExportRecipe } from '../gungen/src/cli/exportRecipe.ts';
import { modelEntryJson } from '../gungen/src/cli/modelEntryJson.ts';
import { loadGunDesign } from '../gungen/src/gun/designLoader.ts';
import { exportGunGlb } from '../gungen/src/gun/exportGlb.ts';
import { buildRegistry } from '../packages/deadvox/src/core/content.ts';
import { ModelSchema } from '../packages/deadvox/src/core/schema.ts';
import { namedNodes } from '../packages/deadvox/src/render/firearmModel.ts';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const { safeParse } = deadvoxRequire('valibot');
const ROOT = new URL('../', import.meta.url).pathname;
const DESIGNS = join(ROOT, 'gungen/designs');
const DEADVOX_BASE = join(ROOT, 'packages/deadvox/src/content/base');
const RECIPE = loadExportRecipe();
const EXPORTED = RECIPE.map((row) => ({ id: row.id, source: row.source, ...row.generate() }));
const glbJson = (bytes) =>
  JSON.parse(
    bytes
      .subarray(20, 20 + bytes.readUInt32LE(12))
      .toString()
      .trim(),
  );
const glbBinary = (bytes) => bytes.subarray(28 + bytes.readUInt32LE(12));
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const arrayDifference = (actual, expected, path) => {
  if (!(Array.isArray(actual) && Array.isArray(expected))) {
    return `${path} should be arrays`;
  }
  if (actual.length !== expected.length) {
    return `${path} array lengths differ`;
  }
  for (let i = 0; i < actual.length; i += 1) {
    const difference = exportDifference(actual[i], expected[i], `${path}[${i}]`);
    if (difference) {
      return difference;
    }
  }
  return null;
};
const recordDifference = (actual, expected, path) => {
  if (!(isRecord(actual) && isRecord(expected))) {
    return `${path} should be objects`;
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return `${path} object keys differ`;
  }
  for (const key of expectedKeys) {
    const difference = exportDifference(actual[key], expected[key], `${path}.${key}`);
    if (difference) {
      return difference;
    }
  }
  return null;
};
const exportDifference = (actual, expected, path = '$') => {
  if (typeof actual === 'number' || typeof expected === 'number') {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      return `${path} should be a number`;
    }
    const tolerance = 1e-12 * Math.max(1, Math.abs(actual), Math.abs(expected));
    return Math.abs(actual - expected) > tolerance ? `${path}: ${actual} differs from ${expected}` : null;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return arrayDifference(actual, expected, path);
  }
  if (isRecord(actual) || isRecord(expected)) {
    return recordDifference(actual, expected, path);
  }
  return Object.is(actual, expected) ? null : `${path} differs`;
};
const loadExports = () =>
  readdirSync(DESIGNS)
    .filter((file) => file.endsWith('.json') && !file.startsWith('look-'))
    .sort()
    .map((file) => {
      const loaded = loadGunDesign(readFileSync(join(DESIGNS, file), 'utf8'));
      if (!loaded.ok) {
        throw new Error(`${file}: ${loaded.error.message}`);
      }
      const id = file.slice(0, -'.json'.length).replaceAll('-', '_');
      const result = exportGunGlb(
        loaded.design.assembly,
        { id, file: `assets/models/${id}.glb` },
        { appearanceProfile: loaded.design.template },
      );
      if (!result.ok) {
        throw new Error(`${file}: ${JSON.stringify(result.error)}`);
      }
      return { file, model: result.modelEntry };
    });

describe('gungen exports satisfy deadvox model validation', () => {
  it('validates each curated gun model entry, including action metadata', () => {
    const exportedGuns = loadExports();
    assert.ok(exportedGuns.length > 0);
    for (const { file, model } of exportedGuns) {
      assert.ok(model.gun, `${file}: missing gun pack block`);
      const parsed = safeParse(ModelSchema, model);
      assert.ok(parsed.success, `${file}: ${JSON.stringify(parsed.issues)}`);
    }
  });

  it('reproduces the exporter-written model text and GLB of every recipe row', () => {
    for (const { id, glb, modelEntry, source } of EXPORTED) {
      const { file } = modelEntry;
      assert.equal(modelEntry.id, id, `${source}: recipe identity was not used`);
      assert.equal(file, `assets/models/${id}.glb`, `${source}: recipe output path was not used`);
      assert.equal(
        readFileSync(join(DEADVOX_BASE, 'gungen', `${id}.model.json`), 'utf8'),
        modelEntryJson(modelEntry),
        `${id}: ${source}`,
      );
      assert.ok(safeParse(ModelSchema, modelEntry).success, `${id}: invalid exported model`);
      // Node versions round linear colours in the last bit; geometry still compares byte for byte.
      const committedGlb = readFileSync(join(DEADVOX_BASE, file));
      const exportedGlb = Buffer.from(glb);
      assert.equal(exportDifference(glbJson(committedGlb), glbJson(exportedGlb)), null, `${file}: ${source}`);
      assert.ok(glbBinary(committedGlb).equals(glbBinary(exportedGlb)), `${file}: geometry differs from ${source}`);
    }
  });

  it('leaves no committed exporter-written model without a recipe row', () => {
    const ids = new Set(RECIPE.map(({ id }) => id));
    for (const file of readdirSync(join(DEADVOX_BASE, 'gungen')).filter((entry) => entry.endsWith('.model.json'))) {
      assert.ok(ids.has(file.slice(0, -'.model.json'.length)), `${file}: orphaned export`);
    }
  });

  it('loads exported suppressor material colours unchanged through the Deadvox loader', async () => {
    const suppressors = EXPORTED.filter(({ modelEntry }) => modelEntry.gun?.attachment?.kind === 'suppressor');
    assert.ok(suppressors.length > 0);
    await Promise.all(
      suppressors.map(async ({ modelEntry, glb }) => {
        const raw = glbJson(Buffer.from(glb));
        const bytes = readFileSync(join(DEADVOX_BASE, modelEntry.file));
        const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
        const materials = new Set();
        loaded.scene.traverse((object) => {
          if (object.isMesh) {
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              materials.add(material);
            }
          }
        });
        assert.ok(materials.size > 0, `${modelEntry.id}: no loaded mesh materials`);
        for (const material of materials) {
          const index = loaded.parser.associations.get(material)?.materials;
          assert.ok(Number.isInteger(index), `${modelEntry.id}: no material association`);
          const colour = raw.materials[index].pbrMetallicRoughness.baseColorFactor;
          assert.deepEqual(material.color.toArray(), colour.slice(0, 3));
        }
      }),
    );
  });

  it('loads every exported revolver moving node through the Deadvox parser association', async () => {
    const models = EXPORTED.map(({ modelEntry }) => modelEntry).filter((model) => model.gun?.revolver);
    assert.ok(models.length > 0);
    await Promise.all(
      models.map(async (model) => {
        assert.deepEqual(buildRegistry([{ source: model.file, data: { models: [model] } }]).issues, []);
        const bytes = readFileSync(join(DEADVOX_BASE, model.file));
        const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
        const roles = ['crane', 'cylinder', 'ejector', 'hammer', 'trigger'];
        const nodes = namedNodes(
          loaded.scene,
          loaded.parser,
          roles.map((role) => model.gun.revolver[role].node),
        );
        assert.equal(new Set(nodes).size, roles.length);
        for (const node of nodes) {
          assert.ok(node.isMesh || node.children.some((child) => child.isMesh));
        }
      }),
    );
  });

  it('rejects unknown action fields', () => {
    const { file, model } = loadExports().find(({ model: entry }) => entry.gun?.action?.fire) ?? {};
    assert.ok(file && model?.gun?.action?.fire);
    const source = `gungen/designs/${file}`;
    assert.deepEqual(buildRegistry([{ source, data: { models: [model] } }]).issues, []);
    const unknownField = 'fixtureUnknownActionField';
    const invalidModel = { ...model, gun: { ...model.gun, action: { ...model.gun.action, [unknownField]: true } } };
    const { issues } = buildRegistry([{ source, data: { models: [invalidModel] } }]);
    assert.equal(issues.length, 1);
    assert.ok(JSON.stringify(issues[0]).includes(unknownField), JSON.stringify(issues));
  });
});
