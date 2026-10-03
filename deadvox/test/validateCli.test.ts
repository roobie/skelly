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
    expect(run.stdout).toContain('Component closure: 36 item types');
    expect(run.stdout).toContain('Content count: 36 reachable / 40 defined eligible types');
    expect(run.stdout).toContain('Defined but unreachable: baseball_bat, fanny_pack, hiking_backpack, utility_vest');
    expect(run.stdout).toContain('4 pending prerequisite(s)');
  });

  it.each([
    ['unfound', ['recipes[0].components[0][0].item: item "fixture_unfound" is neither found nor craftable']],
    [
      'cycle',
      [
        'recipes[0].components[0][0].item: item "fixture_b" is neither found nor craftable',
        'recipes[1].components[0][0].item: item "fixture_a" is neither found nor craftable',
      ],
    ],
    [
      'self-tool',
      [
        'recipes[0].qualities.fixture_quality: no reachable tool provides "fixture_quality" level 2 without bootstrapping its own requirements',
      ],
    ],
  ])('rejects %s reachability with its semantic diagnostic', (fixture, diagnostics) => {
    const run = validate(`test/fixtures/content/reachability-${fixture}.json`);
    expect(run.status).toBe(1);
    for (const diagnostic of diagnostics) {
      expect(run.stdout).toContain(diagnostic);
    }
  });

  it('accepts the same unfound component when a grounded recipe makes it', () => {
    const run = validate(
      'test/fixtures/content/reachability-unfound.json',
      'test/fixtures/content/reachability-craftable.json',
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('0 issue(s)');
    expect(run.stdout).toContain('Component closure: 38 item types');
  });

  it('rejects a recipe with a missing component item and names its reference', () => {
    const run = validate('test/fixtures/content/recipe-missing-item.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('recipes[0].components[0][0].item: no item "golden_toilet"');
  });

  it('rejects a recipe above 1024 component combinations and reports its exact count', () => {
    const run = validate('test/fixtures/content/recipe-too-many-combinations.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('recipes[0].components: 2048 component combinations exceeds maximum 1024');
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
    // The fixture is validated on top of the base pack, including the new cartridge round and case models.
    expect(run.stdout).toContain('35 models');
    expect(run.stdout).toContain('0 issue(s)');
    expect(run.status).toBe(0);
  });

  it("fails on a sound whose variant file isn't in the pack", () => {
    const run = validate('test/fixtures/content/missing-sound-file.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      'FAIL  test/fixtures/content/missing-sound-file.json sounds[0].variants[0]: "assets/audio/missing.ogg" is not in the pack',
    );
  });

  it('rejects a zombie type that still declares a model', () => {
    const run = validate('test/fixtures/content/zombie-with-model.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      'FAIL  test/fixtures/content/zombie-with-model.json zombies[0].model: unknown field "model"',
    );
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
