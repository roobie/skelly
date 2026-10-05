import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { keyboardViolations } from '../tools/lit-check/inputGuard.ts';

const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.[cm]?[jt]s$/.test(entry.name) ? [path] : [];
  });
it('keeps physical literals and DOM keyboard interpretation in the single registry owner', () => {
  const root = join(import.meta.dirname, '../src');
  const scanned = files(root).filter((path) => relative(root, path) !== 'game/inputBindings.ts');
  expect(scanned.length).toBeGreaterThan(0);
  const issues = scanned.flatMap((path) =>
    keyboardViolations(readFileSync(path, 'utf8')).map((issue) => `${relative(root, path)}: ${issue}`),
  );
  expect(issues).toEqual([]);
  expect(
    keyboardViolations('function key(e: KeyboardEvent) { const { code: position } = e; return position === "KeyZ"; }')
      .length,
  ).toBeGreaterThan(0);
  expect(keyboardViolations('function key(event: any) { return event.key === "g"; }').length).toBeGreaterThan(0);
});
