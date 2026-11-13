import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRegistry, loadVehicleBlueprint, vehicleContentIssues } from '@skelly/engine/content';
import {
  packFileBytes,
  readAvailablePacks,
  readStackContentFiles,
} from '../packages/deadvox/tools/readBundledPacks.ts';

const deadvoxRequire = createRequire(new URL('../packages/deadvox/package.json', import.meta.url));
const { GLTFLoader } = await import(deadvoxRequire.resolve('three/addons/loaders/GLTFLoader.js'));
const PACKAGE_ROOT = fileURLToPath(new URL('../packages/deadvox/', import.meta.url));
const STACK = readStackContentFiles(PACKAGE_ROOT, 'skelly.deadvox');
const { registry, issues } = buildRegistry(STACK.map(({ file, data }) => ({ source: file, data })));
// The blueprints the ground-vehicles pack authors, from its own content files.
const BLUEPRINTS = STACK.filter(({ pack }) => pack.endsWith('/skelly.ground-vehicles')).flatMap(
  ({ data }) => data.vehicleBlueprints ?? [],
);
const PACKS = readAvailablePacks(PACKAGE_ROOT);
// A fitted part's drawn file, from the one pack that declares it.
const declaredBytes = (path) => {
  const owners = PACKS.filter(({ manifest }) => manifest.files.some((file) => file.path === path));
  if (owners.length !== 1) {
    throw new Error(`${owners.length} packs declare ${path}`);
  }
  return packFileBytes(PACKAGE_ROOT, owners[0], path);
};

describe('vehicle exports satisfy the Deadvox contract', () => {
  it('admits the base stack with no vehicle content issue', () => {
    assert.deepEqual(issues, []);
    assert.deepEqual(vehicleContentIssues(registry), []);
  });

  it('loads every ground-vehicles blueprint with fitted parts whose exports the packs declare', async () => {
    assert.ok(BLUEPRINTS.length > 0, 'the ground-vehicles pack must author a blueprint');
    const files = new Set();
    for (const { id } of BLUEPRINTS) {
      assert.ok(registry.vehicleBlueprints.has(id), `${id}: not admitted`);
      const { fittings } = loadVehicleBlueprint(registry, id);
      assert.ok(fittings.length > 0, `${id}: no fittings`);
      for (const { part } of fittings) {
        files.add(registry.models.get(registry.items.get(part).model).file);
      }
    }
    await Promise.all(
      [...files].map(async (file) => {
        const glb = declaredBytes(file);
        const loaded = await new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, '');
        let hasMesh = false;
        loaded.scene.traverse((node) => {
          hasMesh ||= node.isMesh === true;
        });
        assert.ok(hasMesh, `${file}: no geometry`);
      }),
    );
  });
});
