import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialize } from 'node:v8';
import type { TestProject } from 'vitest/node';
import { buildRegistry } from '../src/core/content.ts';

function writeBaseRegistry() {
  const directory = 'src/content/base';
  const result = buildRegistry(
    readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(directory, file), 'utf8')) as unknown })),
  );
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  const path = join(tmpdir(), 'base-registry.bin');
  writeFileSync(path, serialize(result.registry));
  return path;
}

export function setup(project: TestProject) {
  project.provide('baseRegistryPath', writeBaseRegistry());
  project.onTestsRerun(() => {
    writeBaseRegistry();
  });
}
