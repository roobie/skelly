// Writes a design's (or fixture's) .glb and the matching deadvox model entry (PROJECT.md 3.4).
//
//   npm run export:glb -- designs/archetype-ar.json --out "$XDG_RUNTIME_DIR/export" [--entry-out "$XDG_RUNTIME_DIR/entries"] [--id rifle_test]
//
// Writes <out>/<id>.glb and <entry-out>/<id>.model.json (entry-out defaults to out). The entry's `file` is `assets/models/<id>.glb`, where
// deadvox expects the model; `--id` defaults to the input's file name with dashes turned to underscores.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import type { DeadvoxModelFile } from '../gun/exportGlb.ts';
import { exportFileText } from './exportFile.ts';
import { readCartridge } from './readCartridge.ts';

const USAGE =
  'usage: export <design-or-fixture.json> [--out <dir>] [--entry-out <dir>] [--id <model_id>] [--calibre <cartridge_id>]';

const flag = (args: string[], name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const main = (): number => {
  const args = process.argv.slice(2);
  const input = args.find((a, i) => !(a.startsWith('--') || args[i - 1]?.startsWith('--')));
  if (!input) {
    console.error(USAGE);
    return 2;
  }
  const out = flag(args, '--out') ?? '.';
  const entryOut = flag(args, '--entry-out') ?? out;
  const id = flag(args, '--id') ?? basename(input, '.json').replaceAll('-', '_');
  const cartridgeResult = readCartridge(flag(args, '--calibre'));
  if (!cartridgeResult.ok) {
    console.error(`FAIL --calibre: ${cartridgeResult.message}`);
    return 2;
  }
  const result = exportFileText(
    readFileSync(input, 'utf8'),
    {
      id,
      file: `assets/models/${id}.glb` as DeadvoxModelFile,
    },
    cartridgeResult.cartridge === undefined ? {} : { cartridge: cartridgeResult.cartridge },
  );
  if (!result.ok) {
    console.error(`FAIL ${input}: ${result.message}`);
    return 1;
  }
  for (const warning of result.warnings) {
    console.warn(`WARN ${input}: ${warning}`);
  }
  mkdirSync(out, { recursive: true });
  mkdirSync(entryOut, { recursive: true });
  const glbPath = join(out, `${id}.glb`);
  const entryPath = join(entryOut, `${id}.model.json`);
  writeFileSync(glbPath, result.glb);
  writeFileSync(entryPath, `${JSON.stringify(result.modelEntry, null, 2)}\n`);
  console.log(`wrote ${glbPath} (${result.glb.byteLength} bytes)`);
  console.log(`wrote ${entryPath}`);
  return 0;
};

process.exitCode = main();
