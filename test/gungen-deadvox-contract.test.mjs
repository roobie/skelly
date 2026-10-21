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
import { assertExportSynced, assertRecipeCredits, glbJson } from './model-export-sync.mjs';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const { safeParse } = deadvoxRequire('valibot');
const ROOT = new URL('../', import.meta.url).pathname;
const DESIGNS = join(ROOT, 'gungen/designs');
const DEADVOX_BASE = join(ROOT, 'packages/deadvox/src/content/base');
const RECIPE = loadExportRecipe();
const EXPORTED = RECIPE.map((row) => ({ id: row.id, source: row.source, ...row.generate() }));
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

describe('gungen exports satisfy deadvox model validation', () => {
  it('validates each curated gun model entry, including action metadata', () => {
    assert.ok(CURATED_EXPORTS.length > 0);
    for (const { file, model } of CURATED_EXPORTS) {
      assert.ok(model.gun, `${file}: missing gun pack block`);
      const parsed = safeParse(ModelSchema, model);
      assert.ok(parsed.success, `${file}: ${JSON.stringify(parsed.issues)}`);
    }
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
        for (const part of Object.values(modelEntry.parts ?? {})) {
          if (part.node !== undefined) {
            assert.doesNotThrow(
              () => namedNodes(loaded.scene, loaded.parser, [part.node]),
              `${modelEntry.id}: unresolved part node ${part.node}`,
            );
          }
        }
      }),
    );
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
    const { file, model } = CURATED_EXPORTS.find(({ model: entry }) => entry.gun?.action?.fire) ?? {};
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
