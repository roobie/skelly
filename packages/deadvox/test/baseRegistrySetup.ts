import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { deserialize, serialize } from 'node:v8';
import type { TestProject } from 'vitest/node';
import { buildRegistry } from '../src/core/content.ts';

/** A value the v8 round trip changes (a dropped class, function or undefined field) must not reach the tests. */
function writeCached(path: string, value: unknown) {
  const bytes = serialize(value);
  if (!isDeepStrictEqual(deserialize(bytes), value)) {
    throw new Error(`The v8 round trip changed the cached content for ${path}`);
  }
  writeFileSync(path, bytes);
}

function writeBaseRegistry(path: string, startupPath: string) {
  const directory = 'src/content/base';
  const sources = readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(directory, file), 'utf8')) as unknown }));
  const result = buildRegistry(sources);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  writeCached(path, result.registry);
  const startup = buildRegistry(
    sources
      .map(({ source, data }) => ({ source: `../content/base/${source}`, data }))
      .sort((left, right) => left.source.localeCompare(right.source)),
  );
  if (startup.issues.length > 0) {
    throw new Error(JSON.stringify(startup.issues));
  }
  writeCached(startupPath, startup);
}

export function setup(project: Pick<TestProject, 'provide' | 'onTestsRerun'>) {
  const directory = mkdtempSync(join(tmpdir(), 'base-registry-'));
  const path = join(directory, 'base-registry.bin');
  const startupPath = join(directory, 'startup-content.bin');
  try {
    writeBaseRegistry(path, startupPath);
    project.provide('baseRegistryPath', path);
    project.provide('startupContentPath', startupPath);
    project.onTestsRerun(() => {
      writeBaseRegistry(path, startupPath);
    });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return () => rmSync(directory, { recursive: true, force: true });
}
