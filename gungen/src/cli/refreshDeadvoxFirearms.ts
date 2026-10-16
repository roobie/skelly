import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { exportAttachmentGlb } from '../gun/attachmentExport.ts';
import { exportCartridgeModels } from '../gun/cartridgeExport.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from '../gun/exportGlb.ts';
import { exportFileText } from './exportFile.ts';
import { readCartridge } from './readCartridge.ts';

const root = resolve(import.meta.dirname, '../../..');
const base = resolve(root, 'deadvox/src/content/base');
const source = resolve(base, 'models-firearms.libsonnet');
const data = JSON.parse(readFileSync(source, 'utf8')) as {
  models: (DeadvoxModelEntry & { chargingHandleDegrees?: number })[];
};
const store = (entry: DeadvoxModelEntry, glb: Uint8Array) => {
  const index = data.models.findIndex(({ id }) => id === entry.id);
  const old = data.models[index];
  const merged = {
    ...entry,
    ...(old?.chargingHandleDegrees === undefined ? {} : { chargingHandleDegrees: old.chargingHandleDegrees }),
  };
  if (index < 0) {
    data.models.push(merged);
  } else {
    data.models[index] = merged;
  }
  writeFileSync(resolve(base, entry.file), glb);
};
const manifest = JSON.parse(readFileSync(resolve(base, 'assets/manifest.json'), 'utf8')) as {
  sources: { url: string; files: string[] }[];
};
for (const { url, files } of manifest.sources) {
  const design = /\/gungen\/designs\/([^/]+\.json)$/.exec(url)?.[1];
  if (!design) {
    continue;
  }
  for (const file of files) {
    const id = /\/([^/]+)\.glb$/.exec(file)?.[1];
    if (!id) {
      throw new Error(`Invalid firearm file: ${file}`);
    }
    const out = exportFileText(readFileSync(resolve(root, 'gungen/designs', design), 'utf8'), {
      id,
      file: file as DeadvoxModelFile,
    });
    if (!out.ok) {
      throw new Error(out.message);
    }
    if (out.warnings.length > 0) {
      throw new Error(out.warnings.join('\n'));
    }
    store(out.modelEntry, out.glb);
  }
}
const cartridge = readCartridge('308-winchester');
if (!(cartridge.ok && cartridge.cartridge)) {
  throw new Error('Missing .308 Winchester cartridge');
}
const ammunition = exportCartridgeModels(cartridge.cartridge);
if (!ammunition.ok) {
  throw new Error(JSON.stringify(ammunition.error));
}
for (const model of Object.values(ammunition.models)) {
  store(model.modelEntry, model.glb);
}
const optic = exportAttachmentGlb('optic-hunting-3-9x', {
  id: 'optic_hunting_3_9x',
  file: 'assets/models/optic_hunting_3_9x.glb',
});
if (!optic.ok) {
  throw new Error(JSON.stringify(optic.error));
}
store(optic.modelEntry, optic.glb);
const formatted = execFileSync(
  process.execPath,
  [
    resolve(root, 'node_modules/@biomejs/biome/bin/biome'),
    'format',
    '--stdin-file-path=deadvox/src/content/base/models-firearms.json',
  ],
  { cwd: root, encoding: 'utf8', input: JSON.stringify(data) },
);
writeFileSync(source, formatted);
