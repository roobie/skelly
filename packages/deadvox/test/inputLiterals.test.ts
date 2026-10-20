import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { keyboardViolations } from '../tools/lit-check/inputGuard.ts';

const sourceExtension = /\.[cm]?[jt]s$/;
// This visual-only page pans a Three.js preview; its camera keys are not gameplay bindings.
const DEBUG_CAMERA_KEY_OWNERS = new Set(['debug/vehicleSpike.ts']);
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return files(path);
    }
    return sourceExtension.test(entry.name) ? [path] : [];
  });
const root = join(import.meta.dirname, '../src');
const scanned = files(root).filter((path) => {
  const source = relative(root, path);
  return source !== 'game/inputBindings.ts' && !DEBUG_CAMERA_KEY_OWNERS.has(source);
});

it('finds source files for the keyboard-literal guard', () => {
  expect(scanned.length).toBeGreaterThan(0);
});

it.each(scanned)('keeps keyboard literals out of %s', (path) => {
  const issues = keyboardViolations(readFileSync(path, 'utf8')).map((issue) => `${relative(root, path)}: ${issue}`);
  expect(issues).toEqual([]);
});

it('detects forbidden physical-code and DOM event literal forms', () => {
  expect(
    keyboardViolations('function key(e: KeyboardEvent) { const { code: position } = e; return position === "KeyZ"; }')
      .length,
  ).toBeGreaterThan(0);
  expect(keyboardViolations('function key(event: any) { return event.key === "g"; }').length).toBeGreaterThan(0);
});
