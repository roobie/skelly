import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseCartridgeJson } from '../gungen/src/ammo/parseCartridge.ts';
import { exportFileText } from '../gungen/src/cli/exportFile.ts';
import { exportAttachmentGlb } from '../gungen/src/gun/attachmentExport.ts';
import { exportCartridgeModels } from '../gungen/src/gun/cartridgeExport.ts';
import { loadGunDesign } from '../gungen/src/gun/designLoader.ts';
import { exportGunGlb } from '../gungen/src/gun/exportGlb.ts';
import { buildRegistry } from '../packages/deadvox/src/core/content.ts';
import { namedNodes } from '../packages/deadvox/src/render/firearmModel.ts';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const ROOT = new URL('../', import.meta.url).pathname;
const DESIGNS = join(ROOT, 'gungen/designs');
const DEADVOX_BASE = join(ROOT, 'packages/deadvox/src/content/base');
const FIREARM_CONTENT = JSON.parse(readFileSync(join(DEADVOX_BASE, 'models-firearms.json'), 'utf8'));
// The asset manifest credits each exported gun to its gungen design, so a new export joins the sync check with its credit.
const DESIGN_SOURCE = /\/gungen\/designs\/([^/]+\.json)$/;
const CARTRIDGE_SOURCE = /\/gungen\/cartridges\/[^/]+\.json$/;
const MODEL_FILE = /^assets\/models\/([^/]+)\.glb$/;
const ASSET_SOURCES = JSON.parse(readFileSync(join(DEADVOX_BASE, 'assets/manifest.json'), 'utf8')).sources;
const EXPORTED_GUNS = ASSET_SOURCES.flatMap(({ url, files }) => {
  const design = typeof url === 'string' ? DESIGN_SOURCE.exec(url)?.[1] : undefined;
  return design ? files.map((file) => ({ design, file, modelId: MODEL_FILE.exec(file)?.[1] })) : [];
});
const omitDeadvoxOwnedFields = ({ chargingHandleDegrees: _chargingHandleDegrees, anchors, ...model }) => {
  // Gungen owns contact geometry; Deadvox content may place the player's wrist relative to that contact.
  const { support_wrist: _supportWrist, ...exportedAnchors } = anchors ?? {};
  return { ...model, ...(anchors ? { anchors: exportedAnchors } : {}) };
};
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
const modelSyncDifference = ({ glb, modelEntry }, source) => {
  const { id, file } = modelEntry;
  const committed = FIREARM_CONTENT.models.find((model) => model.id === id);
  if (!committed) {
    return `missing Deadvox model ${id}`;
  }
  const difference = exportDifference(omitDeadvoxOwnedFields(committed), modelEntry);
  if (difference) {
    return `${id} differs from ${source}: ${difference}`;
  }
  // Node versions round linear colours in the last bit; geometry still compares byte for byte.
  const committedGlb = readFileSync(join(DEADVOX_BASE, file));
  const exportedGlb = Buffer.from(glb);
  const glbDifference = exportDifference(glbJson(committedGlb), glbJson(exportedGlb));
  if (glbDifference) {
    return `${file} differs from ${source}: ${glbDifference}`;
  }
  return glbBinary(committedGlb).equals(glbBinary(exportedGlb)) ? null : `${file} geometry differs from ${source}`;
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
      assert.equal(modelSyncDifference(result, design), null);
    }
  });

  it('keeps credited round and case exports synchronized with their cartridge sources', () => {
    const sources = ASSET_SOURCES.filter(({ url }) => typeof url === 'string' && CARTRIDGE_SOURCE.test(url));
    assert.ok(sources.length > 0, 'the manifest credits no cartridge exports');
    for (const { url, files } of sources) {
      const cartridgeFile = url.slice(url.lastIndexOf('/') + 1);
      const parsed = parseCartridgeJson(readFileSync(join(ROOT, 'gungen/cartridges', cartridgeFile), 'utf8'));
      assert.ok(parsed.ok, `${cartridgeFile}: ${JSON.stringify(parsed)}`);
      const exported = exportCartridgeModels(parsed.cartridge);
      assert.ok(exported.ok, `${cartridgeFile}: ${JSON.stringify(exported.error)}`);
      assert.ok(files.length > 0, `${cartridgeFile} credits no model files`);
      for (const file of files) {
        const model = Object.values(exported.models).find(({ modelEntry }) => modelEntry.file === file);
        assert.ok(model, `${file} is not produced by ${cartridgeFile}`);
        assert.equal(modelSyncDifference(model, cartridgeFile), null);
      }
    }
  });

  it('keeps standalone optic exports synchronized with the credited optic catalogue', () => {
    const sources = ASSET_SOURCES.filter(
      ({ url }) => typeof url === 'string' && url.endsWith('/gungen/src/gun/optics.ts'),
    );
    assert.ok(sources.length > 0, 'the manifest credits no standalone optic catalogue exports');
    for (const { files } of sources) {
      assert.ok(files.length > 0, 'the optic source credits no model files');
      for (const file of files) {
        const id = MODEL_FILE.exec(file)?.[1];
        assert.ok(id, `invalid optic model file ${file}`);
        const exported = exportAttachmentGlb(id.replaceAll('_', '-'), { id, file });
        assert.ok(exported.ok, JSON.stringify(exported.error));
        assert.equal(modelSyncDifference(exported, 'optic catalogue'), null);
      }
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
        const asset = readFileSync(join(ROOT, `packages/deadvox/src/content/base/assets/models/${id}.glb`));
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

  it('loads every exported revolver moving node through the Deadvox parser association', async () => {
    const models = FIREARM_CONTENT.models.filter((model) => model.revolver);
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
          roles.map((role) => model.revolver[role].node),
        );
        assert.equal(new Set(nodes).size, roles.length);
        for (const node of nodes) {
          assert.ok(node.isMesh || node.children.some((child) => child.isMesh));
        }
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
