import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { isBoltAssembly } from '../gun/boltCartridge.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from '../gun/exportGlb.ts';
import { boltCompanionExports } from './boltCompanionExports.ts';
import { exportFileText } from './exportFile.ts';

const MODEL_FILE = /\/([^/]+)\.glb$/;
const root = resolve(import.meta.dirname, '../../..');
const base = resolve(root, 'packages/deadvox/src/content/base');
const data = JSON.parse(compileJsonnetFile(resolve(base, 'models-firearms.libsonnet'))) as {
  models: (DeadvoxModelEntry & { chargingHandleDegrees?: number })[];
};
const entries = resolve(base, 'gungen');
mkdirSync(entries, { recursive: true });
const store = (entry: DeadvoxModelEntry, glb: Uint8Array) => {
  const old = data.models.find(({ id }) => id === entry.id);
  const merged = {
    ...entry,
    ...(old?.chargingHandleDegrees === undefined ? {} : { chargingHandleDegrees: old.chargingHandleDegrees }),
  };
  const formatted = execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/@biomejs/biome/bin/biome'),
      'format',
      `--stdin-file-path=packages/deadvox/src/content/base/gungen/${entry.id}.model.json`,
    ],
    { cwd: root, encoding: 'utf8', input: JSON.stringify(merged) },
  );
  writeFileSync(resolve(entries, `${entry.id}.model.json`), formatted);
  writeFileSync(resolve(base, entry.file), glb);
};
const manifest = JSON.parse(readFileSync(resolve(base, 'assets/manifest.json'), 'utf8')) as {
  sources: { url: string | null; files: string[] }[];
};
const optics = manifest.sources
  .filter(({ url }) => url?.endsWith('/gungen/src/gun/optics.ts'))
  .flatMap(({ files }) =>
    files.map((file) => {
      const id = MODEL_FILE.exec(file)?.[1];
      if (!id) {
        throw new Error(`Invalid optic file: ${file}`);
      }
      return { id, file: file as DeadvoxModelFile };
    }),
  );
for (const { url, files } of manifest.sources) {
  const design = /\/gungen\/designs\/([^/]+\.json)$/.exec(url ?? '')?.[1];
  if (!design) {
    continue;
  }
  for (const file of files) {
    const id = /\/([^/]+)\.glb$/.exec(file)?.[1];
    if (!id) {
      throw new Error(`Invalid firearm file: ${file}`);
    }
    const text = readFileSync(resolve(root, 'gungen/designs', design), 'utf8');
    const out = exportFileText(text, {
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
    const raw = JSON.parse(text);
    if (isBoltAssembly(raw.assembly ?? raw)) {
      for (const companion of boltCompanionExports(out.modelEntry, optics)) {
        store(companion.modelEntry, companion.glb);
      }
    }
  }
}
