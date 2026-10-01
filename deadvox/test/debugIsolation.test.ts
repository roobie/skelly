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

  it('registers each debug action and shortcut in the panel table, including P noclip', () => {
    const source = readFileSync('src/debug/index.ts', 'utf8');
    const rows = [...source.matchAll(/code: 'Key([A-Z])',\s*key: '([A-Z])',\s*label: '([^']+)'/g)];
    expect(rows.map((row) => row[1])).toEqual([
      'B', 'G', 'H', 'P', 'T', 'N', 'U', 'K', 'V', 'Y', 'O', 'M', 'J', 'I', 'Q', 'L',
    ]);
    expect(rows.map((row) => row[2])).toEqual(rows.map((row) => row[1]));
    expect(rows.find((row) => row[1] === 'P')?.[3]).toBe('Noclip');
    expect(source).not.toContain("code: 'KeyF'");
    expect(source).toContain('id="reveal-zombies"');
    expect(source).toContain('id="measure-snapshot"');
    expect(source).toContain('id="export-metrics"');
  });
});
