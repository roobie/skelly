import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildRegistry } from '../deadvox/src/core/content.ts';
import { exportFileText } from '../gungen/src/cli/exportFile.ts';
import { exportAttachmentGlb } from '../gungen/src/gun/attachmentExport.ts';
import { loadGunDesign } from '../gungen/src/gun/designLoader.ts';
import { exportGunGlb } from '../gungen/src/gun/exportGlb.ts';

const deadvoxRequire = createRequire(new URL('../deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const ROOT = new URL('../', import.meta.url).pathname;
const DESIGNS = join(ROOT, 'gungen/designs');
const DEADVOX_BASE = join(ROOT, 'deadvox/src/content/base');
const FIREARM_CONTENT = JSON.parse(readFileSync(join(DEADVOX_BASE, 'models-firearms.json'), 'utf8'));
// The asset manifest credits each exported gun to its gungen design, so a new export joins the sync check with its credit.
const DESIGN_SOURCE = /\/gungen\/designs\/([^/]+\.json)$/;
const MODEL_FILE = /^assets\/models\/([^/]+)\.glb$/;
const EXPORTED_GUNS = JSON.parse(readFileSync(join(DEADVOX_BASE, 'assets/manifest.json'), 'utf8')).sources.flatMap(
  ({ url, files }) => {
    const design = typeof url === 'string' ? DESIGN_SOURCE.exec(url)?.[1] : undefined;
    return design ? files.map((file) => ({ design, file, modelId: MODEL_FILE.exec(file)?.[1] })) : [];
  },
);
const omitDeadvoxOwnedFields = ({ chargingHandleDegrees: _chargingHandleDegrees, ...model }) => model;
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
        { variant: loaded.design.template },
      );
      if (!result.ok) {
        throw new Error(`${file}: ${JSON.stringify(result.error)}`);
      }
      return { file, model: result.modelEntry };
    });

describe('gungen exports satisfy deadvox model validation', () => {
  it('validates each exported gun model entry, including action metadata', () => {
    const exportedGuns = loadExports();
    assert.ok(exportedGuns.length > 0);
    for (const { file, model } of exportedGuns) {
      const { issues } = buildRegistry([{ source: `gungen/designs/${file}`, data: { models: [model] } }]);
      assert.deepEqual(issues, [], `${file}: ${JSON.stringify(issues)}`);
    }
  });

  it("keeps Deadvox's copy of every exported gun identical to gungen's export", () => {
    assert.ok(EXPORTED_GUNS.length > 0, 'the asset manifest credits no gungen design');
    for (const { design, file, modelId } of EXPORTED_GUNS) {
      assert.ok(modelId, `${design}: ${file} is not a Deadvox model file`);
      const result = exportFileText(readFileSync(join(DESIGNS, design), 'utf8'), { id: modelId, file });
      assert.ok(result.ok, `${design}: ${result.ok ? '' : result.message}`);
      const firearm = FIREARM_CONTENT.models.find(({ id }) => id === modelId);
      assert.ok(firearm, `missing Deadvox firearm model ${modelId}`);
      const difference = exportDifference(omitDeadvoxOwnedFields(firearm), result.modelEntry);
      assert.equal(
        difference,
        null,
        `${modelId} differs from gungen's export outside Deadvox-owned fields${difference ? `: ${difference}` : ''}`,
      );
      // Node versions round the exported linear colours differently in the last bit, so the GLB's JSON is compared
      // with the entry's tolerance and only its binary geometry byte for byte.
      const committedGlb = readFileSync(join(DEADVOX_BASE, file));
      const exportedGlb = Buffer.from(result.glb);
      const glbDifference = exportDifference(glbJson(committedGlb), glbJson(exportedGlb));
      assert.equal(
        glbDifference,
        null,
        `${file} differs from gungen's export of ${design}${glbDifference ? `: ${glbDifference}` : ''}`,
      );
      assert.ok(
        glbBinary(committedGlb).equals(glbBinary(exportedGlb)),
        `${file} geometry differs from gungen's export of ${design}`,
      );
    }
  });

  it('loads each exported suppressor material without changing its colour', async () => {
    await Promise.all(
      ['real_suppressor', 'improvised_suppressor'].map(async (id) => {
        const exported = exportAttachmentGlb(id.replaceAll('_', '-'), {
          id,
          file: `assets/models/${id}.glb`,
        });
        assert.ok(exported.ok, exported.ok ? '' : JSON.stringify(exported.error));
        const exportedColor = glbJson(Buffer.from(exported.glb)).materials[0].pbrMetallicRoughness.baseColorFactor;
        const asset = readFileSync(join(ROOT, `deadvox/src/content/base/assets/models/${id}.glb`));
        const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(asset).buffer, '');
        const loadedColors = [];
        loaded.scene.traverse((object) => {
          if (object.isMesh) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            loadedColors.push(...materials.map(({ color }) => color.toArray()));
          }
        });
        assert.ok(loadedColors.length > 0, `Deadvox ${id} GLB loaded no mesh materials`);
        assert.deepEqual(loadedColors, [exportedColor.slice(0, 3)]);
      }),
    );
  });

  it('rejects unknown action fields', () => {
    const { file, model } = loadExports().find(({ model: entry }) => entry.action?.fire) ?? {};
    assert.ok(file && model?.action?.fire);
    const source = `gungen/designs/${file}`;
    assert.deepEqual(buildRegistry([{ source, data: { models: [model] } }]).issues, []);
    const unknownField = 'fixtureUnknownActionField';
    const invalidModel = { ...model, action: { ...model.action, [unknownField]: true } };
    const { issues } = buildRegistry([{ source, data: { models: [invalidModel] } }]);
    assert.equal(issues.length, 1);
    assert.ok(JSON.stringify(issues[0]).includes(unknownField), JSON.stringify(issues));
  });
});
