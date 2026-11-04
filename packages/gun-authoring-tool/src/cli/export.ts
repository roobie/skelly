// Writes a design's (or fixture's) voxelized .glb, at the gun class, and the matching deadvox model entry.
//
//   npm run export:glb -- designs/archetype-ar.json --out "$XDG_RUNTIME_DIR/export" [--entry-out "$XDG_RUNTIME_DIR/entries"] [--id rifle_test]
//
// Writes <out>/<id>.glb and <entry-out>/<id>.model.json (entry-out defaults to out). The entry's `file` is `assets/models/<id>.glb`, where
// deadvox expects the model; `--id` defaults to the input's file name with dashes turned to underscores.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import { modelEntryJson } from '@skelly/thing-export/files.ts';
import gunVoxel from '../gun/gunVoxel.json' with { type: 'json' };
import { exportCliPlan } from './exportArgs.ts';
import { exportFileText } from './exportFile.ts';

const main = (): number => {
  const plan = exportCliPlan(process.argv.slice(2));
  if (!plan.ok) {
    console.error(plan.message);
    return 2;
  }
  const { input, glbPath, entryPath } = plan;
  const result = exportFileText(readFileSync(input, 'utf8'), plan.asset, plan.metadata, {
    voxelGrain: gunVoxel.grain,
    voxelDetailGrain: gunVoxel.detailGrain,
  });
  if (!result.ok) {
    console.error(`FAIL ${input}: ${result.message}`);
    return 1;
  }
  for (const warning of result.warnings) {
    console.warn(`WARN ${input}: ${warning}`);
  }
  mkdirSync(dirname(glbPath), { recursive: true });
  mkdirSync(dirname(entryPath), { recursive: true });
  writeFileSync(glbPath, result.glb);
  writeFileSync(entryPath, modelEntryJson(result.modelEntry));
  console.log(`wrote ${glbPath} (${result.glb.byteLength} bytes)`);
  console.log(`wrote ${entryPath}`);
  return 0;
};

process.exitCode = main();
