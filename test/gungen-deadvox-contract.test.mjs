import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadExportRecipe } from '../gungen/src/cli/exportRecipe.ts';
import { PART_CATALOGUE } from '../gungen/src/gun/catalogue.ts';
import { loadGunDesign } from '../gungen/src/gun/designLoader.ts';
import { exportGunGlb } from '../gungen/src/gun/exportGlb.ts';
import { buildRegistry } from '../packages/deadvox/src/core/content.ts';
import { typeWeightGrams } from '../packages/deadvox/src/core/items.ts';
import { magazineFits } from '../packages/deadvox/src/core/magazine.ts';
import { ModelSchema } from '../packages/deadvox/src/core/schema.ts';
import { ammoMatchesCalibre, spentCaseItemId } from '../packages/deadvox/src/game/firearmHandling.ts';
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
const PART_ITEM_PATH = /^models\[0\]\.parts\.[^.]+\.item$/;
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
const BASE_SOURCES = readdirSync(DEADVOX_BASE)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(DEADVOX_BASE, file), 'utf8')) }));
const RECIPE_IDS = new Set(RECIPE.map(({ id }) => id));
const modelOf = (registry, item) => (item.model === undefined ? undefined : registry.models.get(item.model));
const certifiedAttachments = (model) =>
  new Set([
    ...(model.gun?.attachments ?? []).map(({ id }) => id),
    ...Object.values(model.gun?.compatibility ?? {}).flat(),
  ]);
// The items the game pairs with a gun: ammo of its calibre, its spent case, fitting magazines and its attachments.
const companionsOf = (registry, gun) => {
  const model = modelOf(registry, gun);
  const calibre = model.gun?.calibre;
  const attachments = certifiedAttachments(model);
  return [...registry.items.values()].filter(
    (item) =>
      item !== gun &&
      ((calibre !== undefined &&
        (ammoMatchesCalibre(item.id, calibre, registry) || item.id === spentCaseItemId(calibre))) ||
        magazineFits(registry, gun.id, item.id) ||
        attachments.has(modelOf(registry, item)?.gun?.attachment?.id)),
  );
};
// Builds the whole content base, as the game does, and lists what breaks the recipe's consumption boundary.
const consumptionGaps = (sources) => {
  const { registry, issues } = buildRegistry(sources);
  const gaps = issues.map(({ source, path, message }) => `${source} ${path}: ${message}`);
  const items = [...registry.items.values()];
  for (const id of RECIPE_IDS) {
    if (!registry.models.has(id)) {
      gaps.push(`${id}: the recipe export is not a registered model`);
    } else if (!items.some((item) => item.model === id)) {
      gaps.push(`${id}: no item draws the recipe export`);
    }
  }
  const guns = items.filter((item) => item.firearm && RECIPE_IDS.has(item.model));
  let companions = 0;
  for (const gun of guns) {
    const paired = companionsOf(registry, gun);
    if (paired.length === 0) {
      gaps.push(`${gun.id}: no companion item`);
    }
    companions += paired.length;
    for (const item of paired.filter(({ model }) => !RECIPE_IDS.has(model))) {
      gaps.push(`${gun.id}: companion ${item.id} draws ${item.model}, which no recipe row exports`);
    }
  }
  return { registry, gaps, guns: guns.length, companions };
};
const BASE_CONSUMPTION = consumptionGaps(BASE_SOURCES);
// Recipe guns whose authored design names part items, with that instance → item composition.
const COMPOSED_GUNS = RECIPE.filter(({ kind }) => kind === 'design').flatMap(({ id, source }) => {
  const loaded = loadGunDesign(readFileSync(join(ROOT, source), 'utf8'));
  if (!loaded.ok) {
    throw new Error(`${source}: ${loaded.error.message}`);
  }
  const items = loaded.design.items ?? {};
  return Object.keys(items).length === 0 ? [] : [{ id, items }];
});

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
        // A part's item lives in another file; the full-base test resolves it.
        const own = issues.filter(({ path }) => !PART_ITEM_PATH.test(path));
        assert.deepEqual(own, [], `${modelEntry.id}: invalid consumer model`);
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

  it('registers every recipe export in the full base and keeps each gun companion inside the recipe', () => {
    const { gaps, guns, companions } = BASE_CONSUMPTION;
    assert.deepEqual(gaps, []);
    assert.ok(guns > 0 && companions > 0, 'the base must consume a recipe gun and its companions');
  });

  it('fits each recipe gun with its authored part items, each drawn and weighed as its loose export', () => {
    const { registry } = BASE_CONSUMPTION;
    assert.ok(COMPOSED_GUNS.length > 0, 'the recipe must ship a gun composed of part items');
    const looseExport = new Map(RECIPE.filter(({ kind }) => kind === 'part').map(({ id, source }) => [source, id]));
    for (const gun of COMPOSED_GUNS) {
      const parts = registry.models.get(gun.id)?.parts ?? {};
      const fitted = Object.fromEntries(
        Object.entries(parts)
          .filter(([, part]) => part.item !== undefined)
          .map(([id, part]) => [id, part.item]),
      );
      assert.deepEqual(fitted, gun.items, `${gun.id}: fitted part items differ from its design`);
      // A composed body has no part left weighed by a mass row.
      assert.deepEqual(Object.keys(fitted).sort(), Object.keys(parts).sort(), `${gun.id}: body part without an item`);
      for (const [id, itemId] of Object.entries(gun.items)) {
        const item = registry.items.get(itemId);
        const loose = item && modelOf(registry, item);
        assert.ok(loose && item.model === looseExport.get(itemId), `${gun.id} ${id}: ${itemId} is no loose export`);
        const { massKg } = parts[id];
        assert.equal(massKg, PART_CATALOGUE.items.get(itemId)?.massKg, `${gun.id} ${id}: mass differs from ${itemId}`);
        assert.deepEqual(
          Object.values(loose.parts ?? {}).map((part) => part.massKg),
          [massKg],
          `${gun.id} ${id}: loose mass`,
        );
        assert.equal(typeWeightGrams(registry, itemId), massKg * 1000, `${gun.id} ${id}: ${itemId} weight`);
      }
    }
  });

  it('weighs the replaceable children of each composed recipe gun as children, never as body parts', () => {
    const { registry } = BASE_CONSUMPTION;
    let children = 0;
    for (const gun of COMPOSED_GUNS) {
      const model = registry.models.get(gun.id);
      const replaceable = [model.gun?.slots?.magazine?.node, ...(model.gun?.attachments ?? []).map(({ node }) => node)];
      const body = new Set(Object.values(model.parts ?? {}).map(({ node }) => node));
      for (const node of replaceable.filter((child) => child !== undefined)) {
        children += 1;
        assert.ok(!body.has(node), `${gun.id}: replaceable ${node} is weighed as a body part`);
      }
    }
    assert.ok(children > 0, 'no composed recipe gun has a replaceable child');
  });

  it('reports a dangling model reference and a gun companion drawn from outside the recipe', () => {
    const { registry } = BASE_CONSUMPTION;
    const gun = [...registry.items.values()].find((item) => item.firearm && RECIPE_IDS.has(item.model));
    const ammo = companionsOf(registry, gun).find((item) => item.ammo);
    const stray = [...registry.models.values()].find(
      (model) => !(RECIPE_IDS.has(model.id) || model.gun || model.parts),
    );
    assert.ok(gun && ammo && stray);
    const fixture = (id, model) => ({
      source: `fixture-${id}.json`,
      data: { items: [{ ...ammo, id, name: `Fixture ${id}`, model }] },
    });
    const { gaps } = consumptionGaps([
      ...BASE_SOURCES,
      fixture('dangling_cartridge', 'fixture_missing_model'),
      fixture('stray_cartridge', stray.id),
    ]);
    assert.ok(
      gaps.some((gap) => gap.startsWith('fixture-dangling_cartridge.json') && gap.includes('fixture_missing_model')),
      JSON.stringify(gaps),
    );
    assert.ok(
      gaps.includes(`${gun.id}: companion stray_cartridge draws ${stray.id}, which no recipe row exports`),
      JSON.stringify(gaps),
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
