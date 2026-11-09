import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { validate as runValidation } from '../src/cli/validate.ts';
import { CONTENT_CAPABILITIES } from '../src/core/capabilities.ts';

const validateAt = (root: string, ...files: string[]) => {
  const output: string[] = [];
  const status = runValidation(files, (line) => output.push(line), root);
  return { status, stdout: output.join('\n') };
};

const makeMinimalPack = (...fixtureDirs: string[]): string => {
  const root = mkdtempSync(join(tmpdir(), 'deadvox-validate-'));
  try {
    const base = join(root, 'mods/fixture.pack');
    mkdirSync(join(base, 'assets'), { recursive: true });
    mkdirSync(join(base, 'pack'), { recursive: true });
    writeFileSync(
      join(base, 'pack/manifest.json'),
      JSON.stringify({
        id: 'skelly.deadvox',
        version: '1',
        tier: 'product',
        product: true,
        dependencies: [],
        overrides: [],
        files: [
          { path: 'sounds.json', kind: 'content' },
          { path: 'assets/manifest.json', kind: 'json' },
        ],
      }),
    );
    writeFileSync(join(base, 'sounds.json'), JSON.stringify({ sounds: [] }));
    writeFileSync(join(base, 'assets/manifest.json'), JSON.stringify({ sources: [] }));
    const fixtures = join(root, 'test/fixtures');
    mkdirSync(fixtures, { recursive: true });
    for (const dir of fixtureDirs) {
      symlinkSync(resolve(`test/fixtures/${dir}`), join(fixtures, dir), 'dir');
    }
    return root;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
};

describe('validate CLI', () => {
  it('rejects a pack missing a required capability', () => {
    const root = makeMinimalPack();
    const [section, capabilities] = Object.entries(CONTENT_CAPABILITIES).find(([, entries]) =>
      Object.values(entries).some((requirement) => requirement === 'required'),
    )!;
    const [capability] = Object.entries(capabilities).find(([, requirement]) => requirement === 'required')!;
    try {
      const run = validateAt(root);
      expect(run.status).toBe(1);
      expect(run.stdout).toContain(`FAIL  core content ${section}: missing required capability "${capability}"`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an unlisted JSON file anywhere under a bundled pack root', () => {
    const root = makeMinimalPack();
    try {
      const directory = join(root, 'mods/fixture.pack/nested');
      mkdirSync(directory);
      writeFileSync(join(directory, 'unlisted.json'), JSON.stringify({ items: [] }));
      const run = validateAt(root);
      expect(run.status).toBe(1);
      expect(run.stdout).toContain('skelly.deadvox');
      expect(run.stdout).toContain('unlisted JSON file nested/unlisted.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('maps a parsed content argument to the real process exit code', () => {
    const root = makeMinimalPack('content');
    try {
      const run = spawnSync(
        process.execPath,
        [resolve('src/cli/validate.ts'), 'test/fixtures/content/missing-model.json'],
        { cwd: root, encoding: 'utf8' },
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toContain('FAIL  test/fixtures/content/missing-model.json items[0].model: no model "lamp"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports an unreachable component from static reachability', () => {
    const root = makeMinimalPack('content');
    try {
      const fixture = 'test/fixtures/content/reachability-unfound.json';
      expect(validateAt(root, fixture).stdout).not.toContain('neither found nor craftable');
      writeFileSync(
        join(root, 'start.json'),
        JSON.stringify({
          starts: [{ id: 'fixture_start', site: 'city', kit: [], wounds: [], skills: {}, recipes: ['torch'] }],
        }),
      );
      const run = validateAt(root, fixture, 'start.json');
      expect(run.status).toBe(1);
      expect(run.stdout).toContain(
        'recipes[0].components[0][0].item: Start "fixture_start": item "fixture_unfound" is neither found nor craftable',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects compatible content and asset fixtures with every per-file diagnostic', () => {
    const root = makeMinimalPack('content', 'packs', 'assets');
    let stdout = '';
    try {
      const output: string[] = [];
      const status = runValidation(
        [
          'test/fixtures/content/recipe-missing-item.json',
          'test/fixtures/content/recipe-too-many-combinations.json',
          'test/fixtures/content/broken-reference.json',
          'test/fixtures/content/missing-sound-file.json',
          'test/fixtures/content/zombie-with-model.json',
          'test/fixtures/content/missing-model-file.json',
          'test/fixtures/packs/stray/assets/manifest.json',
          'test/fixtures/assets/manifest.json',
        ],
        (line) => output.push(line),
        root,
      );
      expect(status).toBe(1);
      stdout = output.join('\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    for (const diagnostic of [
      'FAIL  test/fixtures/content/recipe-missing-item.json recipes[0].components[0][0].item: no item "golden_toilet"',
      'FAIL  test/fixtures/content/recipe-too-many-combinations.json recipes[0].components: 2048 component combinations exceeds maximum 1024',
      'FAIL  test/fixtures/content/broken-reference.json loot[0].entries[1].item: no item "golden_toilet"',
      'FAIL  test/fixtures/content/missing-sound-file.json sounds[0].variants[0]: "assets/audio/missing.ogg" is not in the pack',
      'FAIL  test/fixtures/content/zombie-with-model.json actors[0].strength: missing',
      'FAIL  test/fixtures/content/missing-model-file.json models[0].file: "assets/models/lamp.glb" is not in the pack',
      'FAIL  test/fixtures/packs/stray/assets/manifest.json sources: "assets/models/stray.glb" is in the pack but no source lists it',
      'FAIL  test/fixtures/assets/manifest.json sources[0].author: CC-BY-4.0 needs an author',
    ]) {
      expect(stdout).toContain(diagnostic);
    }
    expect(stdout).toContain('7 file(s):');
  });

  it('accepts a model file listed by its pack manifest', () => {
    const root = makeMinimalPack('content', 'packs', 'assets');
    try {
      const run = validateAt(
        root,
        'test/fixtures/packs/lamp/lamp.json',
        'test/fixtures/packs/lamp/assets/manifest.json',
      );
      expect(run.stdout).toContain('2 file(s):');
      expect(run.stdout).toContain('1 asset sources');
      expect(run.stdout).not.toContain('FAIL  test/fixtures/packs/lamp/lamp.json');
      expect(run.stdout).not.toContain('FAIL  test/fixtures/packs/lamp/assets/manifest.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a firearm with no authored shot sound from the CLI', () => {
    const root = makeMinimalPack('content');
    try {
      const run = validateAt(root, 'test/fixtures/content/firearm-missing-shot-sound.json');
      expect(run.status).toBe(1);
      expect(run.stdout).toContain(
        'FAIL  test/fixtures/content/firearm-missing-shot-sound.json items[0].firearm.shotSound: missing',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
