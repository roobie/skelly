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

  it('passes on a pack with a model, its file and a manifest that lists it', () => {
    const run = validate('test/fixtures/packs/lamp/lamp.json', 'test/fixtures/packs/lamp/assets/manifest.json');
    expect(run.stdout).toContain('1 models');
    expect(run.stdout).toContain('0 issue(s)');
    expect(run.status).toBe(0);
  });

  it('fails on an item whose model is missing', () => {
    const run = validate('test/fixtures/content/missing-model.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('FAIL  test/fixtures/content/missing-model.json items[0].model: no model "lamp"');
  });

  it("fails on a model whose file isn't in the pack", () => {
    const run = validate('test/fixtures/content/missing-model-file.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      'FAIL  test/fixtures/content/missing-model-file.json models[0].file: "assets/models/lamp.glb" is not in the pack',
    );
  });

  it("fails on an asset file the manifest doesn't list", () => {
    const run = validate('test/fixtures/packs/stray/assets/manifest.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      'FAIL  test/fixtures/packs/stray/assets/manifest.json sources: "assets/models/stray.glb" is in the pack but no source lists it',
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
