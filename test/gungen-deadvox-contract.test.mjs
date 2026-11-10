import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { buildRegistry, ModelSchema } from '@skelly/engine/content';
import { ammoMatchesCalibre, magazineFits, spentCaseItemId, typeWeightGrams } from '@skelly/engine/inventory';
import { namedNodes } from '../packages/deadvox/src/presentation/entries/render.ts';
import { readStackContentSources } from '../packages/deadvox/tools/readBundledPacks.ts';
import {
  assertCutOver,
  assertPinnedRow,
  glbJson,
  PACKAGE_ROOT,
  pinnedFiles,
  readCutOver,
} from './model-export-sync.mjs';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const { safeParse } = deadvoxRequire('valibot');
// The gun tool's cut-over: per kind, the pinned rows its bundled packs consume from the external root.
const CUT_OVER = readCutOver('gungen');
const EXPORTED = CUT_OVER.rows.map((use) => ({ ...use, ...pinnedFiles(use) }));
const PART_ITEM_PATH = /^models\[0\]\.parts\.[^.]+\.item$/;
const hasMesh = (scene) => {
  let found = false;
  scene.traverse((node) => {
    found ||= node.isMesh === true;
  });
  return found;
};
const loadGlb = async (glb) => await new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, '');
// A part's item lives in another file; the full-base test resolves it.
const ownIssues = (model) =>
  buildRegistry([{ source: model.file, data: { models: [model] } }]).issues.filter(
    ({ path }) => !PART_ITEM_PATH.test(path),
  );
const BASE_SOURCES = readStackContentSources(PACKAGE_ROOT, 'skelly.deadvox');
const EXPORT_IDS = new Set(EXPORTED.map(({ modelEntry }) => modelEntry.id));
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
// Builds the whole content base, as the game does, and lists what breaks the export's consumption boundary.
const consumptionGaps = (sources) => {
  const { registry, issues } = buildRegistry(sources);
  const gaps = issues.map(({ source, path, message }) => `${source} ${path}: ${message}`);
  const items = [...registry.items.values()];
  for (const id of EXPORT_IDS) {
    if (!registry.models.has(id)) {
      gaps.push(`${id}: the consumed export is not a registered model`);
    } else if (!items.some((item) => item.model === id)) {
      gaps.push(`${id}: no item draws the consumed export`);
    }
  }
  const guns = items.filter((item) => item.firearm && EXPORT_IDS.has(item.model));
  let companions = 0;
  for (const gun of guns) {
    const paired = companionsOf(registry, gun);
    if (paired.length === 0) {
      gaps.push(`${gun.id}: no companion item`);
    }
    companions += paired.length;
    for (const item of paired.filter(({ model }) => !EXPORT_IDS.has(model))) {
      gaps.push(`${gun.id}: companion ${item.id} draws ${item.model}, which no gun export declares`);
    }
  }
  return { registry, gaps, guns: guns.length, companions };
};
const BASE_CONSUMPTION = consumptionGaps(BASE_SOURCES);
// Exported guns whose body parts name part items.
const COMPOSED_GUNS = [...EXPORT_IDS]
  .map((id) => BASE_CONSUMPTION.registry.models.get(id))
  .filter((model) => model?.gun && Object.values(model.parts ?? {}).some(({ item }) => item !== undefined));

describe('gungen exports satisfy deadvox model validation', () => {
  // biome-ignore lint/style/noDoneCallback: Node's TestContext prints the per-pack listing, not a done callback.
  it('consumes only pinned gun rows, from the external root', (t) => {
    assertCutOver(CUT_OVER, t);
  });

  it('matches each consumed gun row to its pinned manifest row', async () => {
    await Promise.all(EXPORTED.map(async (out) => assertPinnedRow({ ...out, loaded: await loadGlb(out.glb) })));
  });

  it('validates and loads every consumed export and resolves its declared part nodes', async () => {
    await Promise.all(
      EXPORTED.map(async ({ modelEntry, glb }) => {
        const parsed = safeParse(ModelSchema, modelEntry);
        assert.ok(parsed.success, `${modelEntry.id}: ${JSON.stringify(parsed.issues)}`);
        assert.deepEqual(ownIssues(modelEntry), [], `${modelEntry.id}: invalid consumer model`);
        const loaded = await loadGlb(glb);
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
    assert.ok(guns > 0 && companions > 0, 'the base must consume an exported gun and its companions');
  });

  it('fits each composed gun with part items, each drawn and weighed as its loose export', () => {
    const { registry } = BASE_CONSUMPTION;
    assert.ok(COMPOSED_GUNS.length > 0, 'the exports must ship a gun composed of part items');
    for (const gun of COMPOSED_GUNS) {
      const parts = Object.entries(gun.parts);
      // A composed body has no part left weighed by a mass row.
      for (const [id, { item: itemId, massKg }] of parts) {
        assert.ok(itemId !== undefined, `${gun.id}: body part ${id} without an item`);
        const item = registry.items.get(itemId);
        const loose = item && modelOf(registry, item);
        assert.ok(loose && EXPORT_IDS.has(item.model), `${gun.id} ${id}: ${itemId} is no loose export`);
        assert.deepEqual(
          Object.values(loose.parts ?? {}).map((part) => part.massKg),
          [massKg],
          `${gun.id} ${id}: loose mass`,
        );
        assert.equal(typeWeightGrams(registry, itemId), massKg * 1000, `${gun.id} ${id}: ${itemId} weight`);
      }
    }
  });

  it('weighs the replaceable children of each composed gun as children, never as body parts', () => {
    let children = 0;
    for (const model of COMPOSED_GUNS) {
      const replaceable = [model.gun?.slots?.magazine?.node, ...(model.gun?.attachments ?? []).map(({ node }) => node)];
      const body = new Set(Object.values(model.parts ?? {}).map(({ node }) => node));
      for (const node of replaceable.filter((child) => child !== undefined)) {
        children += 1;
        assert.ok(!body.has(node), `${model.id}: replaceable ${node} is weighed as a body part`);
      }
    }
    assert.ok(children > 0, 'no composed gun has a replaceable child');
  });

  it('reports a dangling model reference and a gun companion drawn from outside the exports', () => {
    const { registry } = BASE_CONSUMPTION;
    const gun = [...registry.items.values()].find((item) => item.firearm && EXPORT_IDS.has(item.model));
    const ammo = companionsOf(registry, gun).find((item) => item.ammo);
    const stray = [...registry.models.values()].find(
      (model) => !(EXPORT_IDS.has(model.id) || model.gun || model.parts),
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
      gaps.includes(`${gun.id}: companion stray_cartridge draws ${stray.id}, which no gun export declares`),
      JSON.stringify(gaps),
    );
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
        const raw = glbJson(glb);
        const loaded = await loadGlb(glb);
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
    const revolvers = EXPORTED.filter(({ modelEntry }) => modelEntry.gun?.revolver);
    assert.ok(revolvers.length > 0);
    await Promise.all(
      revolvers.map(async ({ modelEntry: model, glb }) => {
        const loaded = await loadGlb(glb);
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
    const withAction = EXPORTED.map(({ modelEntry }) => modelEntry).filter((model) => model.gun?.action?.fire);
    assert.ok(withAction.length > 0);
    for (const model of withAction) {
      const unknownField = 'fixtureUnknownActionField';
      const invalidModel = { ...model, gun: { ...model.gun, action: { ...model.gun.action, [unknownField]: true } } };
      const issues = ownIssues(invalidModel);
      assert.equal(issues.length, 1, model.id);
      assert.ok(JSON.stringify(issues[0]).includes(unknownField), JSON.stringify(issues));
    }
  });
});
