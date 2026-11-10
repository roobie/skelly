import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { deserialize, serialize } from 'node:v8';
import { buildRegistry } from '@skelly/engine/content';
import type { TestProject } from 'vitest/node';
import { baseContentSources, startupContentSources } from './baseContentFiles.ts';

/** A value the v8 round trip changes (a dropped class, function or undefined field) must not reach the tests. */
function writeCached(path: string, value: unknown) {
  const bytes = serialize(value);
  if (!isDeepStrictEqual(deserialize(bytes), value)) {
    throw new Error(`The v8 round trip changed the cached content for ${path}`);
  }
  writeFileSync(path, bytes);
}

function writeBaseRegistry(
  path: string,
  startupPath: string,
  readBaseSources: typeof baseContentSources,
  readStartupSources: typeof startupContentSources,
) {
  const result = buildRegistry(readBaseSources());
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  writeCached(path, result.registry);
  const startup = buildRegistry(readStartupSources());
  if (startup.issues.length > 0) {
    throw new Error(JSON.stringify(startup.issues));
  }
  const manifest = JSON.parse(readFileSync('mods/skelly.deadvox/pack/manifest.json', 'utf8')) as {
    defaultStart: string;
  };
  writeCached(startupPath, { ...startup, defaultStart: manifest.defaultStart });
}

export function setup(
  project: Pick<TestProject, 'provide' | 'onTestsRerun'>,
  readBaseSources = baseContentSources,
  readStartupSources = startupContentSources,
) {
  const directory = mkdtempSync(join(tmpdir(), 'base-registry-'));
  const path = join(directory, 'base-registry.bin');
  const startupPath = join(directory, 'startup-content.bin');
  try {
    writeBaseRegistry(path, startupPath, readBaseSources, readStartupSources);
    project.provide('baseRegistryPath', path);
    project.provide('startupContentPath', startupPath);
    project.onTestsRerun(() => {
      writeBaseRegistry(path, startupPath, readBaseSources, readStartupSources);
    });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return () => rmSync(directory, { recursive: true, force: true });
}
