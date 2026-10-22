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
import { assertExportSynced, assertRecipeCredits, exportDifference } from './model-export-sync.mjs';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const { safeParse } = deadvoxRequire('valibot');
const base = new URL('../packages/deadvox/src/content/base/', import.meta.url).pathname;
const recipe = loadThingRecipe();
const exported = recipe.map((row) => ({ id: row.id, source: row.source, ...row.generate() }));
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
    for (const file of readdirSync(join(base, 'things')).filter((entry) => entry.endsWith('.model.json'))) {
      assert.ok(ids.has(file.slice(0, -'.model.json'.length)), `${file}: orphaned thing export`);
    }
  });
  it('credits every consumed thing export', () => {
    assertRecipeCredits(recipe, JSON.parse(readFileSync(join(base, 'assets/manifest.json'), 'utf8')));
  });
  it('builds the registry with one authoritative mass source for each item', () => {
    assert.deepEqual(issues, []);
    for (const row of recipe) {
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
        for (const part of Object.values(modelEntry.parts)) {
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
