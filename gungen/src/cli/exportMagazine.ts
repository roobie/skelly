// A curated magazine prefab, exported detached with its fitted round column for Deadvox's magazine items.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { formatCartridgeParseError, parseCartridgeJson } from '../ammo/parseCartridge.ts';
import { exportMagazineGlb } from '../gun/magazineExport.ts';
import { GUN_PREFABS } from '../gun/prefabs.ts';

const MODEL_ID = /^[a-z0-9_]+$/;
const USAGE =
  'usage: exportMagazine <cartridge.json> <prefab-id> <model-id> <finish-variant> <model-directory> [entry-directory]';

const main = (): number => {
  const [input, prefabId, modelId, variant, output, entries = output] = process.argv.slice(2);
  if (!(input && prefabId && modelId && variant && output)) {
    console.error(USAGE);
    return 2;
  }
  if (!MODEL_ID.test(modelId)) {
    console.error(`model id "${modelId}" must be lowercase letters, digits and underscores`);
    return 2;
  }
  const prefab = GUN_PREFABS.find(({ id, family }) => id === prefabId && family === 'magazine');
  if (!prefab) {
    console.error(`unknown magazine prefab "${prefabId}"`);
    return 2;
  }
  const parsed = parseCartridgeJson(readFileSync(input, 'utf8'));
  if (!parsed.ok) {
    console.error(formatCartridgeParseError(parsed.error));
    return 1;
  }
  if (parsed.cartridge.kind !== 'metallic') {
    console.error('a magazine holds metallic cartridges');
    return 2;
  }
  const result = exportMagazineGlb({
    asset: { id: modelId, file: `assets/models/${modelId}.glb` },
    params: prefab.fixedParams,
    cartridge: parsed.cartridge,
    appearance: { variant },
  });
  if (!result.ok) {
    console.error(JSON.stringify(result.error));
    return 1;
  }
  mkdirSync(output, { recursive: true });
  mkdirSync(entries!, { recursive: true });
  const file = join(output, basename(result.modelEntry.file));
  writeFileSync(file, result.glb);
  writeFileSync(join(entries!, `${modelId}.model.json`), `${JSON.stringify(result.modelEntry, null, 2)}\n`);
  console.log(`wrote ${file} (${result.glb.byteLength} bytes)`);
  return 0;
};
try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
