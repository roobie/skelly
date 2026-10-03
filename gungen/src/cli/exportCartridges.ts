// Both metallic and shotshell kinds use the same cartridge exporter and model-entry contract.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { formatCartridgeParseError, parseCartridgeJson } from '../ammo/parseCartridge.ts';
import { exportCartridgeModels } from '../gun/cartridgeExport.ts';

const main = (): number => {
  const [input, output, entries = output] = process.argv.slice(2);
  if (!(input && output)) {
    console.error('usage: exportCartridges <cartridge.json> <output-directory> [entry-directory]');
    return 2;
  }
  const parsed = parseCartridgeJson(readFileSync(input, 'utf8'));
  if (!parsed.ok) {
    console.error(formatCartridgeParseError(parsed.error));
    return 1;
  }
  const result = exportCartridgeModels(parsed.cartridge);
  if (!result.ok) {
    console.error(JSON.stringify(result.error));
    return 1;
  }
  mkdirSync(output, { recursive: true });
  mkdirSync(entries!, { recursive: true });
  for (const model of Object.values(result.models)) {
    const file = join(output, basename(model.modelEntry.file));
    writeFileSync(file, model.glb);
    writeFileSync(
      join(entries!, `${model.modelEntry.id}.model.json`),
      `${JSON.stringify(model.modelEntry, null, 2)}\n`,
    );
    console.log(`wrote ${file} (${model.glb.byteLength} bytes)`);
  }
  return 0;
};
try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
