import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildRegistry } from '../packages/deadvox/src/core/content.ts';
import { typeWeightGrams } from '../packages/deadvox/src/core/items.ts';
import { ModelSchema } from '../packages/deadvox/src/core/schema.ts';
import { namedNodes } from '../packages/deadvox/src/render/firearmModel.ts';
import { catalogue } from '../packages/thing-authoring-tool/src/catalogue.ts';
import { loadThingRecipe } from '../packages/thing-authoring-tool/src/exports.ts';
import { modelMassKg } from '../packages/thing-core/src/mass.ts';
import { assertExportSynced, assertRecipeCredits, assertVoxelized, exportDifference } from './model-export-sync.mjs';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const { Box3, Vector3 } = deadvoxRequire('three');
const { safeParse } = deadvoxRequire('valibot');
const base = new URL('../packages/deadvox/src/content/base/', import.meta.url).pathname;
const AVATAR_SOURCE = 'player_bust';
const recipe = loadThingRecipe();
const exported = recipe.map((row) => ({ id: row.id, source: row.source, voxel: row.voxel, ...row.generate() }));
const { registry, issues } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) })),
);

describe('thing tool exports satisfy the Deadvox contract', () => {
  it('validates and reproduces every recipe model without orphaned records', () => {
    const ids = new Set(recipe.map(({ id }) => id));
    for (const out of exported) {
      const parsed = safeParse(ModelSchema, out.modelEntry);
      assert.ok(parsed.success, `${out.id}: ${JSON.stringify(parsed.issues)}`);
      assertExportSynced(out, base, 'things');
    }
    assert.equal(
      exportDifference(
        JSON.parse(readFileSync(join(base, 'things/index.json'), 'utf8')),
        exported.map(({ modelEntry }) => modelEntry),
      ),
      null,
      'the registration index derives from the recipe',
    );
    for (const file of readdirSync(join(base, 'things')).filter((entry) => entry !== 'index.json')) {
      assert.ok(
        file.endsWith('.model.json') && ids.has(file.slice(0, -'.model.json'.length)),
        `${file}: orphaned thing export`,
      );
    }
  });
  it('voxelizes every recipe model on its row class', () => {
    exported.forEach(assertVoxelized);
  });
  it('credits every consumed thing export', () => {
    assertRecipeCredits(recipe, JSON.parse(readFileSync(join(base, 'assets/manifest.json'), 'utf8')));
  });
  it('builds the registry with one authoritative mass source for each item', () => {
    assert.deepEqual(issues, []);
    for (const row of recipe) {
      if (row.source === AVATAR_SOURCE) {
        // The player figure is a model rows only; the avatar study draws it, no item holds it.
        assert.equal(registry.items.has(row.source), false);
        assert.ok(registry.models.get(row.id));
        continue;
      }
      const item = registry.items.get(row.source);
      assert.ok(item, `${row.source}: missing consumer`);
      assert.equal(item.model, row.id);
      const model = registry.models.get(row.id);
      assert.ok(model);
      if (model.parts === undefined) {
        assert.equal(typeof item.weight, 'number');
        assert.equal(typeWeightGrams(registry, item.id), item.weight);
      } else {
        assert.equal(item.weight, undefined);
        const toolItem = catalogue.items.find(({ id }) => id === row.source);
        assert.ok(toolItem);
        const authoredMass = toolItem.parts.reduce((sum, part) => sum + part.massKg, 0);
        assert.equal(exportDifference(modelMassKg(model), authoredMass), null, row.id);
      }
    }
  });
  it('loads every part node through the Deadvox GLTF association', async () => {
    await Promise.all(
      exported.map(async ({ modelEntry }) => {
        const bytes = readFileSync(join(base, modelEntry.file));
        const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
        let hasMesh = false;
        loaded.scene.traverse((node) => {
          hasMesh ||= node.isMesh === true;
        });
        assert.ok(hasMesh, `${modelEntry.id}: missing geometry`);
        for (const part of Object.values(modelEntry.parts ?? {})) {
          if (part.node !== undefined) {
            const [node] = namedNodes(loaded.scene, loaded.parser, [part.node]);
            assert.ok(
              node?.isMesh || node?.children.some((child) => child.isMesh),
              `${modelEntry.id}: missing ${part.node}`,
            );
          }
        }
      }),
    );
  });
  it('names a glow material and a flame anchor that the glb holds', async () => {
    const lit = exported.filter(({ modelEntry }) => modelEntry.emissiveMaterial || modelEntry.anchors?.flame);
    assert.ok(
      lit.some(({ modelEntry }) => modelEntry.emissiveMaterial),
      'the slice must export a glow material',
    );
    assert.ok(
      lit.some(({ modelEntry }) => modelEntry.anchors?.flame),
      'the slice must export a flame anchor',
    );
    await Promise.all(
      lit.map(async ({ modelEntry }) => {
        const bytes = readFileSync(join(base, modelEntry.file));
        const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
        const names = new Set();
        loaded.scene.traverse((node) => {
          for (const material of node.isMesh ? [node.material].flat() : []) {
            names.add(material.name);
          }
        });
        if (modelEntry.emissiveMaterial) {
          assert.ok(names.has(modelEntry.emissiveMaterial), `${modelEntry.id}: missing glow material`);
        }
        if (modelEntry.anchors?.flame) {
          // A datum lies on the drawn voxels, so the flame stands within what the file draws.
          const bounds = new Box3().setFromObject(loaded.scene).expandByScalar(1e-6);
          assert.ok(
            bounds.containsPoint(new Vector3(...modelEntry.anchors.flame)),
            `${modelEntry.id}: flame off model`,
          );
        }
      }),
    );
  });
  it('reports the sum of authored parts as the multi-part item weight', () => {
    const multi = recipe.filter((row) => catalogue.items.find(({ id }) => id === row.source).parts.length > 1);
    assert.ok(multi.length > 0, 'the slice must exercise a multi-part item');
    for (const row of multi) {
      const model = registry.models.get(row.id);
      assert.ok(model?.parts);
      assert.equal(typeWeightGrams(registry, row.source), modelMassKg(model) * 1000);
    }
  });
});
