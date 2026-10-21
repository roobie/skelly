import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const vendor = new URL('../vendor/rapier-f64/', import.meta.url);
const tools = new URL('../tools/rapier-f64/', import.meta.url);
const digest = (url: URL) => createHash('sha256').update(readFileSync(url)).digest('hex');

describe('committed Rapier supply', () => {
  it('materializes only pinned sources even with checkout extras and inherited Git bindings', () => {
    execFileSync('python3', ['-B', fileURLToPath(new URL('build_test.py', tools))], { stdio: 'pipe' });
  });

  it('matches the generated provenance and the regeneration inputs', () => {
    const provenance = JSON.parse(readFileSync(new URL('provenance.json', vendor), 'utf8')) as {
      inputs: Record<string, string>;
      files: Record<string, string>;
      typescript: string;
    };
    const files = readdirSync(vendor, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(fileURLToPath(vendor), join(entry.parentPath, entry.name)))
      .filter((path) => path !== 'provenance.json');
    expect(files.sort()).toEqual(Object.keys(provenance.files).sort());
    for (const [path, expected] of Object.entries(provenance.files)) {
      expect(digest(new URL(path, vendor)), path).toBe(expected);
    }
    expect(Object.keys(provenance.inputs).length).toBeGreaterThan(0);
    for (const [path, expected] of Object.entries(provenance.inputs)) {
      expect(digest(new URL(path, tools)), path).toBe(expected);
    }
    const typescript = JSON.parse(
      readFileSync(new URL('../../../node_modules/typescript/package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(provenance.typescript).toBe(typescript.version);
  });
});
