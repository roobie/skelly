import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { exportAttachmentGlb } from '../gun/attachmentExport.ts';
import { ATTACHMENT_IDS } from '../gun/attachments.ts';
import type { DeadvoxModelFile } from '../gun/exportGlb.ts';
import { modelEntryJson } from './modelEntryJson.ts';

const out = process.argv[2] ?? '.';
const entries = process.argv[3] ?? out;
for (const id of ATTACHMENT_IDS) {
  const modelId = id.replaceAll('-', '_');
  const result = exportAttachmentGlb(id, { id: modelId, file: `assets/models/${modelId}.glb` as DeadvoxModelFile });
  if (!result.ok) {
    console.error(`FAIL ${id}: ${JSON.stringify(result.error)}`);
    process.exitCode = 1;
    continue;
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${modelId}.glb`), result.glb);
  mkdirSync(entries, { recursive: true });
  writeFileSync(join(entries, `${modelId}.model.json`), modelEntryJson(result.modelEntry));
}
