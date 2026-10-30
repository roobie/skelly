import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { formatJson } from './jsonnet/compile.mjs';

const base = new URL('../packages/deadvox/src/content/base/', import.meta.url);
const metadata = {};
for (const file of readdirSync(new URL('assets/models/', base)).sort()) {
  if (!file.endsWith('.glb')) {
    continue;
  }
  const bytes = readFileSync(new URL(`assets/models/${file}`, base));
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
const file = new URL('presentation/item-materials.json', base);
const output = formatJson(JSON.stringify(metadata), fileURLToPath(file));
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== output) {
    throw new Error('Item model metadata is stale; run npm run export:deadvox');
  }
} else {
  writeFileSync(file, output);
}
