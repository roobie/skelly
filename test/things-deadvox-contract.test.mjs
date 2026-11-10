import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { ARM_SEGMENTS, buildRegistry, LEG_SEGMENTS, ModelSchema } from '../packages/engine/src/content.ts';
import { typeWeightGrams } from '../packages/engine/src/inventory.ts';
import { namedNodes } from '../packages/deadvox/src/render/firearmModel.ts';
import { readStackContentSources } from '../packages/deadvox/tools/readBundledPacks.ts';
import { modelMassKg } from '../packages/skelly-assets/tools/packages/thing-core/src/mass.ts';
import { readRecipes } from '../packages/skelly-assets/tools/recipes.mjs';
import {
  assertCutOver,
  assertPinnedRow,
  assertVoxelized,
  PACKAGE_ROOT,
  pinnedFiles,
  readCutOver,
} from './model-export-sync.mjs';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const { Box3, Vector3 } = deadvoxRequire('three');
const { safeParse } = deadvoxRequire('valibot');
// The thing tool's cut-over: per kind, the pinned rows its bundled packs consume from the external root.
const CUT_OVER = readCutOver('things');
const exported = CUT_OVER.rows.map((use) => ({ ...use, id: use.row.id, ...pinnedFiles(use) }));
const { registry, issues } = buildRegistry(readStackContentSources(PACKAGE_ROOT, 'skelly.deadvox'));
/** Each part a figure row names: its model, the anchors the row names on it and, for a limb, its rig's parts. */
const figureParts = [...registry.figures.values()].flatMap((figure) => [
  {
    model: figure.body.model,
    joints: { ...figure.body.joints, 'head pivot': figure.body.head.pivot },
    parts: [figure.body.head.part],
  },
  ...Object.entries(figure.limbs).map(([limb, { model, joint }]) => {
    if (!limb.endsWith('Arm')) {
      const legPivots = Object.fromEntries(
        LEG_SEGMENTS.map((segment) => [`${segment} pivot`, figure.legRig[segment].pivot]),
      );
      return {
        model,
        joints: { [limb]: joint, ...legPivots },
        parts: LEG_SEGMENTS.map((segment) => figure.legRig[segment].part),
      };
    }
    const rig = figure.armRig;
    const pivots = Object.fromEntries(ARM_SEGMENTS.map((segment) => [`${segment} pivot`, rig[segment].pivot]));
    return {
      model,
      joints: { [limb]: joint, grip: rig.grip, ...pivots },
      parts: ARM_SEGMENTS.map((segment) => rig[segment].part),
    };
  }),
]);
// Models drawn only on a figure: its parts, and the worn looks items name in their `figureModels` but none holds.
const itemModels = new Set([...registry.items.values()].map(({ model }) => model));
const figureModels = new Set([
  ...figureParts.map(({ model }) => model),
  ...[...registry.items.values()]
    .flatMap((item) =>
      (item.figureModels ?? []).flatMap(({ model, overTorso }) => [model, ...Object.values(overTorso ?? {})]),
    )
    .filter((model) => !itemModels.has(model)),
]);
const itemsDrawing = (model) => [...registry.items.values()].filter((item) => item.model === model);
const loadGlb = async (glb) => await new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, '');

describe('thing tool exports satisfy the Deadvox contract', () => {
  // biome-ignore lint/style/noDoneCallback: Node's TestContext prints the per-pack listing, not a done callback.
  it('consumes only pinned thing rows, from the external root', (t) => {
    assertCutOver(CUT_OVER, t);
  });
  it('matches each consumed thing row to its pinned manifest row', async () => {
    await Promise.all(exported.map(async (out) => assertPinnedRow({ ...out, loaded: await loadGlb(out.glb) })));
  });
  it('validates and registers every consumed thing entry', () => {
    for (const { id, modelEntry } of exported) {
      const parsed = safeParse(ModelSchema, modelEntry);
      assert.ok(parsed.success, `${id}: ${JSON.stringify(parsed.issues)}`);
      assert.ok(registry.models.get(id), `${id}: not registered`);
    }
  });
  it('loads authored handling and anchors without consumer overrides', () => {
    const authored = exported.filter(({ modelEntry }) => modelEntry.grip || modelEntry.anchors);
    assert.ok(authored.length > 0, 'the consumed rows must exercise authored datums');
    for (const { modelEntry } of authored) {
      const loaded = registry.models.get(modelEntry.id);
      assert.ok(loaded, `${modelEntry.id}: missing consumer model`);
      for (const field of ['grip', 'hold', 'rest', 'roll', 'anchors']) {
        if (modelEntry[field] !== undefined) {
          assert.deepEqual(loaded[field], modelEntry[field], `${modelEntry.id}: consumer overrides exported ${field}`);
        }
      }
    }
  });
  it('voxelizes every consumed thing model on its recipe row class', () => {
    const classes = new Map(
      readRecipes().flatMap(({ packId, value }) => value.map(({ id, voxel }) => [`${packId}/${id}`, voxel])),
    );
    for (const { id, glb, row } of exported) {
      assertVoxelized({ id, glb, voxel: classes.get(`${row.pack}/${id}`) });
    }
  });
  it('builds the registry with one authoritative mass source for each item', () => {
    assert.deepEqual(issues, []);
    for (const { id, modelEntry } of exported) {
      const items = itemsDrawing(id);
      if (figureModels.has(id)) {
        // A model drawn only on a figure belongs to its figure row or to the item worn; no item holds it.
        assert.deepEqual(items, [], `${id}: a figure model held by an item`);
        assert.ok(registry.models.get(id));
        continue;
      }
      const model = registry.models.get(id);
      assert.ok(model);
      for (const item of items) {
        if (model.parts === undefined) {
          assert.equal(typeof item.weight, 'number');
          assert.equal(typeWeightGrams(registry, item.id), item.weight);
        } else {
          assert.equal(item.weight, undefined, `${item.id}: a second mass source`);
          // Part order may differ, so the sums may differ in the last bit.
          assert.ok(Math.abs(modelMassKg(model) - modelMassKg(modelEntry)) <= 1e-12, id);
        }
      }
    }
  });
  it('registers each jack and hoist as an ordinary tool item on a nonempty model', () => {
    const jacks = [...registry.items.values()].filter((item) => item.tool?.qualities?.jacking !== undefined);
    assert.ok(jacks.length > 0, 'no item carries a jacking quality');
    for (const item of jacks) {
      const { id } = item;
      assert.equal(item.category, 'tool', `${id}: a jack is a tool`);
      assert.equal(item.vehicle, undefined, `${id}: a jack is carried, not fitted`);
      assert.ok(item.tool.qualities.jacking >= 1, `${id}: missing jacking quality`);
      const model = registry.models.get(item.model);
      assert.ok(model && Object.keys(model.parts ?? {}).length > 0, `${id}: empty model`);
    }
  });
  it('resolves every figure part to an exported model holding each named anchor and rig part', () => {
    assert.ok(registry.figures.size > 0, 'the base content must author a figure');
    for (const part of figureParts) {
      const out = exported.find(({ id }) => id === part.model);
      assert.ok(out, `${part.model}: no consumed export`);
      for (const [joint, anchor] of Object.entries(part.joints)) {
        assert.ok(out.modelEntry.anchors?.[anchor], `${part.model}: ${joint} names missing anchor ${anchor}`);
      }
      for (const rigPart of part.parts) {
        assert.ok(out.modelEntry.parts?.[rigPart], `${part.model}: rig names missing part ${rigPart}`);
      }
    }
  });
  it('loads every part node through the Deadvox GLTF association', async () => {
    await Promise.all(
      exported.map(async ({ modelEntry, glb }) => {
        const loaded = await loadGlb(glb);
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
      lit.map(async ({ modelEntry, glb }) => {
        const loaded = await loadGlb(glb);
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
    // A model drawn only on a figure is multi-part too, but no item holds it, so it has no weight to report.
    const multi = exported
      .flatMap(({ id }) => itemsDrawing(id).map((item) => ({ item, model: registry.models.get(id) })))
      .filter(({ model }) => !figureModels.has(model.id) && Object.keys(model.parts ?? {}).length > 1);
    assert.ok(multi.length > 0, 'the slice must exercise a multi-part item');
    for (const { item, model } of multi) {
      assert.equal(typeWeightGrams(registry, item.id), modelMassKg(model) * 1000, item.id);
    }
  });
});
