import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { formatJson } from './jsonnet/compile.mjs';
import { modDirectories } from './thing-recipes.ts';

const METADATA_PATH = 'presentation/item-materials.json';

const modelMetadata = (base) => {
  const directory = resolve(base, 'assets/models');
  const files = existsSync(directory) ? readdirSync(directory).filter((file) => file.endsWith('.glb')) : [];
  const metadata = {};
  for (const file of files.sort()) {
    const bytes = readFileSync(resolve(directory, file));
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    metadata[`assets/models/${file}`] = {
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
export const syncItemModelMetadata = ({ check = false, repositoryRoot } = {}) => {
  for (const base of modDirectories(repositoryRoot)) {
    const file = resolve(base, METADATA_PATH);
    const metadata = modelMetadata(base);
    const present = existsSync(file);
    const output = metadata && formatJson(JSON.stringify(metadata), file);
    if (check) {
      if (output === undefined ? present : !present || readFileSync(file, 'utf8') !== output) {
        throw new Error(`Item model metadata is stale in ${base}; run npm run export:deadvox`);
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
