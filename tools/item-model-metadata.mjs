import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compareCodeUnits } from '../packages/engine/src/core/codeUnitOrder.ts';
import { formatJson } from './jsonnet/compile.mjs';

const METADATA_PATH = 'presentation/item-materials.json';
const MOD_ROOTS = ['packages/deadvox/mods', 'packages/mods'];
/** skelly-assets' built files, one directory per pack id; see `packages/deadvox/src/product/externalRoot.ts`. */
const EXTERNAL_ROOT = 'packages/skelly-assets/built';
const repository = resolve(import.meta.dirname, '..');

const modDirectories = (repositoryRoot) =>
  MOD_ROOTS.flatMap((root) => {
    const directory = resolve(repositoryRoot, root);
    return existsSync(directory)
      ? readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => resolve(directory, entry.name))
      : [];
  }).sort();

/** A mod's pack id, which also names its directory under the external root. */
const packId = (base) => {
  const manifest = resolve(base, 'pack/manifest.json');
  return existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).id : basename(base);
};

const glbFiles = (directory) =>
  existsSync(directory) ? readdirSync(directory).filter((file) => file.endsWith('.glb')) : [];

/**
 * Its pack's top-level models, from the mod and from the pack's external namespace, as the game resolves either root
 * by the same logical path; one found in both is an error, as it is for the pack reader.
 */
const modelMetadata = (base, repositoryRoot) => {
  const local = resolve(base, 'assets/models');
  const external = resolve(repositoryRoot, EXTERNAL_ROOT, packId(base), 'assets/models');
  const owned = glbFiles(local).map((file) => ({ file, directory: local }));
  const built = glbFiles(external).map((file) => ({ file, directory: external }));
  const files = [...owned, ...built].sort((left, right) => compareCodeUnits(left.file, right.file));
  const metadata = {};
  for (const { file, directory } of files) {
    const key = `assets/models/${file}`;
    if (key in metadata) {
      throw new Error(`${base}: file found in both roots ${key}`);
    }
    const bytes = readFileSync(resolve(directory, file));
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    metadata[key] = {
      materials: [
        ...(gltf.materials ?? []).map((material) => material.extras?.materialId ?? material.name ?? null),
        ...(gltf.meshes?.some((mesh) => mesh.primitives.some((primitive) => primitive.material === undefined))
          ? [null]
          : []),
      ],
    };
  }
  return files.length > 0 ? metadata : undefined;
};

/** Each mod owns one metadata file over its own models, so a model move cannot leave its row in another mod. */
export const syncItemModelMetadata = ({ check = false, repositoryRoot = repository } = {}) => {
  for (const base of modDirectories(repositoryRoot)) {
    const file = resolve(base, METADATA_PATH);
    const metadata = modelMetadata(base, repositoryRoot);
    const present = existsSync(file);
    const output = metadata && formatJson(JSON.stringify(metadata), file);
    if (check) {
      if (output === undefined ? present : !present || readFileSync(file, 'utf8') !== output) {
        throw new Error(`Item model metadata is stale in ${base}; run node tools/item-model-metadata.mjs`);
      }
    } else if (output === undefined) {
      rmSync(file, { force: true });
    } else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, output);
    }
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncItemModelMetadata({ check: process.argv.includes('--check') });
}
