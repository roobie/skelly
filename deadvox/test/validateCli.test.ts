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
});
