import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSources = (dir: string): { file: string; text: string }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path === 'src/debug') {
        return [];
      }
      return readSources(path);
    }
    return entry.name.endsWith('.ts') ? [{ file: path, text: readFileSync(path, 'utf8') }] : [];
  });

const importsDebug = /(?:from\s*|import\s*\()\s*['"][^'"]*\/debug\/[^'"]*['"]/g;
const guardedDebugImport = /config\.debug\s*\?\s*await\s+import\('\.\/debug\/index\.ts'\)/;
const staticDebugNode = /id="(?:hotbar|spawn|debug-ui-root)"/;

describe('debug isolation', () => {
  it('only the config-gated main entry dynamically imports src/debug', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(guardedDebugImport);
    const remainingMain = main.replace("await import('./debug/index.ts')", '');
    expect([...remainingMain.matchAll(importsDebug)]).toEqual([]);
    const offenders = readSources('src')
      .filter(({ file }) => file !== 'src/main.ts')
      .flatMap(({ file, text }) => [...text.matchAll(importsDebug)].map((match) => `${file}: ${match[0]}`));
    expect(offenders).toEqual([]);
  });

  it('has no debug UI nodes in static HTML', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(staticDebugNode);
  });
});
