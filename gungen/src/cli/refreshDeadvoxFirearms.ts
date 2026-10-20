import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isBoltAssembly } from '../gun/boltCartridge.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from '../gun/exportGlb.ts';
import { boltCompanionExports } from './boltCompanionExports.ts';
import { exportFileText } from './exportFile.ts';
import { modelEntryJson } from './modelEntryJson.ts';

const MODEL_FILE = /\/([^/]+)\.glb$/;
const root = resolve(import.meta.dirname, '../../..');
const base = resolve(root, 'packages/deadvox/src/content/base');
const entries = resolve(base, 'gungen');
mkdirSync(entries, { recursive: true });
const store = (entry: DeadvoxModelEntry, glb: Uint8Array) => {
  writeFileSync(resolve(entries, `${entry.id}.model.json`), modelEntryJson(entry));
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
