// biome-ignore-all lint/correctness/noNodejsModules: This exercises a Node-only exporter tool.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { syncItemModelMetadata } from './item-model-metadata.mjs';

const STALE = /stale/;
const BOTH_ROOTS = /both roots/;

const writeModel = (mod, file, material) => {
  const json = Buffer.from(JSON.stringify({ materials: [{ name: material }], meshes: [] }));
  const header = Buffer.alloc(20);
  header.writeUInt32LE(json.length, 12);
  mkdirSync(join(mod, 'assets/models'), { recursive: true });
  writeFileSync(join(mod, 'assets/models', file), Buffer.concat([header, json]));
};
const metadataOf = (mod) => join(mod, 'presentation/item-materials.json');

test('each mod gets one metadata file over its own models, and a mod that lost them keeps none', () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'item-model-metadata-'));
  try {
    const product = join(repositoryRoot, 'packages/deadvox/mods/fixture.product');
    const shared = join(repositoryRoot, 'packages/mods/fixture.shared');
    const emptied = join(repositoryRoot, 'packages/mods/fixture.emptied');
    writeModel(product, 'product_item.glb', 'steel');
    writeModel(shared, 'shared_item.glb', 'cloth');
    writeModel(join(repositoryRoot, 'packages/skelly-assets/built/fixture.shared'), 'built_item.glb', 'wood');
    mkdirSync(join(emptied, 'presentation'), { recursive: true });
    writeFileSync(metadataOf(emptied), '{}\n');

    assert.throws(() => syncItemModelMetadata({ check: true, repositoryRoot }), STALE);
    syncItemModelMetadata({ repositoryRoot });

    assert.deepEqual(JSON.parse(readFileSync(metadataOf(product), 'utf8')), {
      'assets/models/product_item.glb': { materials: ['steel'] },
    });
    assert.deepEqual(JSON.parse(readFileSync(metadataOf(shared), 'utf8')), {
      'assets/models/built_item.glb': { materials: ['wood'] },
      'assets/models/shared_item.glb': { materials: ['cloth'] },
    });
    assert.equal(existsSync(metadataOf(emptied)), false);
    syncItemModelMetadata({ check: true, repositoryRoot });
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test("a model in both its mod and its pack's external namespace is rejected", () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'item-model-metadata-'));
  try {
    writeModel(join(repositoryRoot, 'packages/mods/fixture.shared'), 'twice.glb', 'cloth');
    writeModel(join(repositoryRoot, 'packages/skelly-assets/built/fixture.shared'), 'twice.glb', 'cloth');
    assert.throws(() => syncItemModelMetadata({ repositoryRoot }), BOTH_ROOTS);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
