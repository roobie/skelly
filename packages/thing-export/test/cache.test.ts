import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { exportCache } from '../src/cache.ts';
import { writeRecipeExports } from '../src/files.ts';
import type { RecipeExport } from '../src/recipe.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'thing-export-cache-'));
  dirs.push(dir);
  return dir;
};

it('regenerates a model only when its code or inputs change', () => {
  const base = scratch();
  const store = exportCache(scratch());
  const generated: string[] = [];
  const row = (colour: string): RecipeExport => ({
    id: 'probe',
    kind: 'item',
    source: 'probe',
    voxel: { voxelGrain: 0.01 },
    inputs: () => ({ colour }),
    generate: () => {
      generated.push(colour);
      return { modelEntry: { id: 'probe', file: 'assets/models/probe.glb' }, glb: new TextEncoder().encode(colour) };
    },
  });
  const run = (colour: string, code = 'v1') =>
    writeRecipeExports([row(colour)], base, 'things', { cache: { store, code } });

  run('red');
  run('red');
  expect(generated).toEqual(['red']);
  run('blue');
  expect(readFileSync(join(base, 'assets/models/probe.glb'), 'utf8')).toBe('blue');
  run('blue', 'v2');
  expect(generated).toEqual(['red', 'blue', 'blue']);
});
