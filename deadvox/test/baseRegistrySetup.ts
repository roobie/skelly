import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialize } from 'node:v8';
import type { TestProject } from 'vitest/node';
import { buildRegistry } from '../src/core/content.ts';

function writeBaseRegistry(path: string) {
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
  writeFileSync(path, serialize(result.registry));
}

export function setup(project: Pick<TestProject, 'provide' | 'onTestsRerun'>) {
  const directory = mkdtempSync(join(tmpdir(), 'base-registry-'));
  const path = join(directory, 'base-registry.bin');
  try {
    writeBaseRegistry(path);
    project.provide('baseRegistryPath', path);
    project.onTestsRerun(() => {
      writeBaseRegistry(path);
    });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return () => rmSync(directory, { recursive: true, force: true });
}
