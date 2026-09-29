// Cheap static guard for the `@mobgen/` alias (vite.config.ts, tsconfig.json): deadvox reuses mobgen's
// pure core/mob modules, but must never pull in three.js or the DOM through them. three.js has to come
// from *this* project's own node_modules — see src/render/mobActors.ts's header comment.
//
// Two directions can break that:
//   1. Something here starts importing mobgen/src/viewer/** (which itself imports three, from mobgen's
//      own node_modules — a different copy than deadvox's).
//   2. mobgen/src/core/** or mobgen/src/mob/** (the directories `@mobgen/` actually points reuse) starts
//      importing 'three' or a DOM lib/global, breaking the "pure" assumption for every consumer, not just
//      deadvox.
// Both are plain text scans — no bundler involved, so this stays fast and independent of build config.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const DEADVOX_SRC = join(REPO_ROOT, 'deadvox', 'src');
const MOBGEN_PURE_DIRS = [join(REPO_ROOT, 'mobgen', 'src', 'core'), join(REPO_ROOT, 'mobgen', 'src', 'mob')];

const TS_FILE = /\.tsx?$/;
const MOBGEN_VIEWER_IMPORT = /@mobgen\/viewer\b/;
const THREE_IMPORT = /from ['"]three['"]/;
const DOM_GLOBAL = /\bdocument\.|\bwindow\./;

const listFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...listFiles(path));
    } else if (TS_FILE.test(entry)) {
      out.push(path);
    }
  }
  return out;
};

describe('the @mobgen/ alias boundary', () => {
  it("deadvox's own source never imports mobgen's viewer layer (three-touching) through the alias", () => {
    const offenders = listFiles(DEADVOX_SRC).filter((path) => MOBGEN_VIEWER_IMPORT.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it("mobgen's core/ and mob/ (what @mobgen/ actually reuses) never import three or a DOM lib", () => {
    const offenders: string[] = [];
    for (const dir of MOBGEN_PURE_DIRS) {
      for (const path of listFiles(dir)) {
        const text = readFileSync(path, 'utf8');
        if (THREE_IMPORT.test(text) || DOM_GLOBAL.test(text)) {
          offenders.push(path);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
