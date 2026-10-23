import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadExportRecipe } from '../gungen/src/cli/exportRecipe.ts';
import { loadGunDesign } from '../gungen/src/gun/designLoader.ts';
import { exportGunGlb } from '../gungen/src/gun/exportGlb.ts';
import { buildRegistry } from '../packages/deadvox/src/core/content.ts';
import { ModelSchema } from '../packages/deadvox/src/core/schema.ts';
import { namedNodes } from '../packages/deadvox/src/render/firearmModel.ts';
import {
  assertExportSynced,
  assertRecipeCredits,
  assertVoxelized,
  exportDifference,
  glbJson,
} from './model-export-sync.mjs';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const { safeParse } = deadvoxRequire('valibot');
const ROOT = new URL('../', import.meta.url).pathname;
const DESIGNS = join(ROOT, 'gungen/designs');
const DEADVOX_BASE = join(ROOT, 'packages/deadvox/src/content/base');
const RECIPE = loadExportRecipe();
const EXPORTED = RECIPE.map((row) => ({ id: row.id, source: row.source, voxel: row.voxel, ...row.generate() }));
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
const CURATED_EXPORTS = loadExports();
const MODELS_FILE = /^models-.*\.json$/;
const hasMesh = (scene) => {
  let found = false;
  scene.traverse((node) => {
    found ||= node.isMesh === true;
  });
  return found;
};
// Fields the committed entry may add on top of the exporter's output (hand-authored, e.g. chargingHandleDegrees).
const exportedShape = (committed, exported) =>
  exported !== null && typeof exported === 'object' && !Array.isArray(exported)
    ? Object.fromEntries(Object.keys(exported).map((key) => [key, exportedShape(committed?.[key], exported[key])]))
    : committed;
const committedModels = () =>
  new Map(
    readdirSync(DEADVOX_BASE)
      .filter((file) => MODELS_FILE.test(file))
      .flatMap((file) => JSON.parse(readFileSync(join(DEADVOX_BASE, file), 'utf8')).models)
      .map((model) => [model.id, model]),
  );

describe('gungen exports satisfy deadvox model validation', () => {
  it('validates each curated gun model entry, including action metadata', () => {
    assert.ok(CURATED_EXPORTS.length > 0);
    for (const { file, model } of CURATED_EXPORTS) {
      assert.ok(model.gun, `${file}: missing gun pack block`);
      const parsed = safeParse(ModelSchema, model);
      assert.ok(parsed.success, `${file}: ${JSON.stringify(parsed.issues)}`);
      const { issues } = buildRegistry([{ source: `gungen/designs/${file}`, data: { models: [model] } }]);
      assert.deepEqual(issues, [], `${file}: invalid consumer model`);
    }
  });

  it('keeps each committed models-*.json entry equal to the exporter output for its recipe id', () => {
    const committed = committedModels();
    let compared = 0;
    for (const { id, modelEntry } of EXPORTED) {
      const entry = committed.get(id);
      if (entry !== undefined) {
        compared += 1;
        assert.equal(
          exportDifference(exportedShape(entry, modelEntry), modelEntry),
          null,
          `${id}: stale committed entry`,
        );
      }
    }
    assert.ok(compared > 0, 'no recipe id has a committed models entry');
  });

  it('reproduces the exporter-written model entry and GLB of every recipe row', () => {
    for (const exported of EXPORTED) {
      assertExportSynced(exported, DEADVOX_BASE, 'gungen');
      assert.ok(safeParse(ModelSchema, exported.modelEntry).success, `${exported.id}: invalid exported model`);
    }
  });

  it('validates and loads every recipe output and resolves its declared part nodes', async () => {
    assert.ok(EXPORTED.length > 0, 'the consumption recipe must not be empty');
    await Promise.all(
      EXPORTED.map(async ({ modelEntry, glb }) => {
        const { issues } = buildRegistry([{ source: modelEntry.file, data: { models: [modelEntry] } }]);
        assert.deepEqual(issues, [], `${modelEntry.id}: invalid consumer model`);
        const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, '');
        assert.ok(hasMesh(loaded.scene), `${modelEntry.id}: loaded scene has no geometry`);
        const declared = [
          ...Object.values(modelEntry.parts ?? {}).map((part) => part.node),
          ...Object.values(modelEntry.gun?.action?.parts ?? {}).map((part) => part.node),
          modelEntry.gun?.slots?.magazine?.node,
        ].filter((node) => node !== undefined);
        for (const node of declared) {
          assert.doesNotThrow(
            () => namedNodes(loaded.scene, loaded.parser, [node]),
            `${modelEntry.id}: unresolved node ${node}`,
          );
        }
      }),
    );
  });

  it('voxelizes every recipe model on its row class', () => {
    EXPORTED.forEach(assertVoxelized);
  });

  it('credits every recipe export in the asset manifest', () => {
    assertRecipeCredits(RECIPE, JSON.parse(readFileSync(join(DEADVOX_BASE, 'assets/manifest.json'), 'utf8')));
  });

  it('leaves no committed exporter-written model without a recipe row', () => {
    const ids = new Set(RECIPE.map(({ id }) => id));
    for (const file of readdirSync(join(DEADVOX_BASE, 'gungen')).filter((entry) => entry.endsWith('.model.json'))) {
      assert.ok(ids.has(file.slice(0, -'.model.json'.length)), `${file}: orphaned export`);
    }
  });

  // A fitted muzzle attachment is an item the player can remove and refit, so its host must certify it.
  it('certifies every fitted muzzle attachment on the host it is mounted at', () => {
    const fitted = EXPORTED.flatMap(({ modelEntry }) =>
      (modelEntry.gun?.attachments ?? [])
        .filter(({ mount }) => mount === 'muzzle')
        .map((attachment) => ({ model: modelEntry, attachment })),
    );
    assert.ok(fitted.length > 0);
    for (const { model, attachment } of fitted) {
      assert.ok(
        model.gun.compatibility?.[attachment.mountedAt]?.includes(attachment.id),
        `${model.id}: ${attachment.id} is not certified on ${attachment.mountedAt}`,
      );
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
    const withAction = CURATED_EXPORTS.filter(({ model }) => model.gun?.action?.fire);
    assert.ok(withAction.length > 0);
    for (const { file, model } of withAction) {
      const source = `gungen/designs/${file}`;
      assert.deepEqual(buildRegistry([{ source, data: { models: [model] } }]).issues, []);
      const unknownField = 'fixtureUnknownActionField';
      const invalidModel = { ...model, gun: { ...model.gun, action: { ...model.gun.action, [unknownField]: true } } };
      const { issues } = buildRegistry([{ source, data: { models: [invalidModel] } }]);
      assert.equal(issues.length, 1, file);
      assert.ok(JSON.stringify(issues[0]).includes(unknownField), JSON.stringify(issues));
    }
  });
});
