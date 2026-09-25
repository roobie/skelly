import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const validate = (...files: string[]) =>
  spawnSync(process.execPath, ['src/cli/validate.ts', ...files], { encoding: 'utf8' });

describe('npm run validate', () => {
  it('passes on the base pack', () => {
    const run = validate();
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('0 issue(s)');
  });

  it('fails on a fixture with a broken reference', () => {
    const run = validate('test/fixtures/content/broken-reference.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      'FAIL  test/fixtures/content/broken-reference.json loot[0].entries[1].item: no item "golden_toilet"',
    );
  });

  it('fails on an asset manifest with a CC BY source and no author', () => {
    const run = validate('test/fixtures/assets/manifest.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      'FAIL  test/fixtures/assets/manifest.json sources[0].author: CC-BY-4.0 needs an author',
    );
  });
});
