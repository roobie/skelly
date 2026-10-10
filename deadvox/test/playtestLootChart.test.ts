import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '..');
const map = JSON.parse(readFileSync(resolve(projectRoot, 'maps/playtest.tmj'), 'utf8')) as {
  layers: { name: string; objects: { name: string }[] }[];
};
const beats = map.layers.find((layer) => layer.name === 'Beats')?.objects ?? [];

describe('playtest loot chart', () => {
  it('runs and prints a heading for every authored beat', () => {
    expect(beats.length).toBeGreaterThan(0);
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--import', './tools/register-mobgen-alias.mjs', 'tools/playtest-loot-chart.mjs'],
      { cwd: projectRoot, encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    for (const beat of beats) {
      expect(result.stdout).toContain(`## ${beat.name}`);
    }
  });
});
