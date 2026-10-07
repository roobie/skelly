import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { exportAttachmentGlb } from '../gun/attachmentExport.ts';
import { ATTACHMENT_IDS } from '../gun/attachments.ts';
import type { DeadvoxModelFile } from '../gun/exportGlb.ts';

const out = process.argv[2] ?? '.';
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
  writeFileSync(join(out, `${modelId}.model.json`), `${JSON.stringify(result.modelEntry, null, 2)}\n`);
}
