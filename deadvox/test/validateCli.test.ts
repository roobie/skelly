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

  it.each([
    [
      'unknown-knowledge',
      ['recipes[0].knowledge: recipe "unlearned_recipe" has no starting or reachable book knowledge source'],
    ],
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
        'recipes[0].qualities.fixture_quality: no reachable tool or placed workstation provides "fixture_quality" level 2 without bootstrapping its own requirements',
      ],
    ],
  ])('rejects %s reachability with its semantic diagnostic', (fixture, diagnostics) => {
    const run = validate(`test/fixtures/content/reachability-${fixture}.json`);
    expect(run.status).toBe(1);
    for (const diagnostic of diagnostics) {
      expect(run.stdout).toContain(diagnostic);
    }
  });

  it('rejects compatible content and asset fixtures with every per-file diagnostic', () => {
    const run = validate(
      'test/fixtures/content/recipe-missing-item.json',
      'test/fixtures/content/recipe-too-many-combinations.json',
      'test/fixtures/content/broken-reference.json',
      'test/fixtures/content/missing-sound-file.json',
      'test/fixtures/content/zombie-with-model.json',
      'test/fixtures/content/missing-model-file.json',
      'test/fixtures/packs/stray/assets/manifest.json',
      'test/fixtures/assets/manifest.json',
    );
    expect(run.status).toBe(1);
    for (const diagnostic of [
      'FAIL  test/fixtures/content/recipe-missing-item.json recipes[0].components[0][0].item: no item "golden_toilet"',
      'FAIL  test/fixtures/content/recipe-too-many-combinations.json recipes[0].components: 2048 component combinations exceeds maximum 1024',
      'FAIL  test/fixtures/content/broken-reference.json loot[0].entries[1].item: no item "golden_toilet"',
      'FAIL  test/fixtures/content/missing-sound-file.json sounds[0].variants[0]: "assets/audio/missing.ogg" is not in the pack',
      'FAIL  test/fixtures/content/zombie-with-model.json zombies[0].model: unknown field "model"',
      'FAIL  test/fixtures/content/missing-model-file.json models[0].file: "assets/models/lamp.glb" is not in the pack',
      'FAIL  test/fixtures/packs/stray/assets/manifest.json sources: "assets/models/stray.glb" is in the pack but no source lists it',
      'FAIL  test/fixtures/assets/manifest.json sources[0].author: CC-BY-4.0 needs an author',
    ]) {
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
  });

  it('passes on a pack with a model, its file and a manifest that lists it', () => {
    const run = validate('test/fixtures/packs/lamp/lamp.json', 'test/fixtures/packs/lamp/assets/manifest.json');
    // The fixture is validated on top of the base pack, including the new cartridge round and case models.
    expect(run.stdout).toContain('0 issue(s)');
    expect(run.status).toBe(0);
  });

  it('fails when an item references a missing model', () => {
    const run = validate('test/fixtures/content/missing-model.json');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('FAIL  test/fixtures/content/missing-model.json items[0].model: no model "lamp"');
  });
});
