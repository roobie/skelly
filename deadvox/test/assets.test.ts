import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assetFileIssues, modelFileIssues, validateManifest } from '../src/core/assets.ts';
import { buildRegistry } from '../src/core/content.ts';

const source = (fields: Record<string, unknown> = {}) => ({
  title: 'Torch',
  url: 'https://opengameart.org/content/torch',
  author: 'Someone',
  licence: 'CC0-1.0',
  download: 'torch.zip',
  files: ['assets/models/flashlight.glb'],
  changes: null,
  ...fields,
});

const check = (...sources: unknown[]) => validateManifest('manifest.json', { sources });

describe('asset manifest', () => {
  it('the base manifest has no issues', () => {
    const data = JSON.parse(readFileSync('src/content/base/assets/manifest.json', 'utf8')) as unknown;
    expect(validateManifest('base', data).issues).toEqual([]);
  });

  it('accepts CC0 and CC BY, and refuses other licences', () => {
    expect(check(source(), source({ licence: 'CC-BY-4.0', files: ['assets/models/a.glb'] })).issues).toEqual([]);
    expect(check(source({ licence: 'CC-BY-3.0' })).issues).toEqual([]);
    const { issues } = check(source({ licence: 'CC-BY-SA-4.0' }));
    expect(issues.map((i) => i.path)).toEqual(['sources[0].licence']);
  });

  it('needs an author and a link for CC BY, but not for CC0', () => {
    expect(check(source({ author: null, url: null })).issues).toEqual([]);
    const { issues } = check(source({ licence: 'CC-BY-4.0', author: null, url: null }));
    expect(issues).toEqual([
      { source: 'manifest.json', path: 'sources[0].author', message: 'CC-BY-4.0 needs an author' },
      { source: 'manifest.json', path: 'sources[0].url', message: 'CC-BY-4.0 needs a link to the source' },
    ]);
  });

  it('lists each file once, under assets/', () => {
    const { issues } = check(source(), source({ files: ['assets/models/flashlight.glb', 'models/x.glb'] }));
    expect(issues.map((i) => i.path).sort()).toEqual(['sources[1].files[1]']);
    const dup = check(source(), source());
    expect(dup.issues).toEqual([
      {
        source: 'manifest.json',
        path: 'sources[1].files[0]',
        message: '"assets/models/flashlight.glb" is already listed by sources[0]',
      },
    ]);
  });

  it('refuses unknown fields and missing ones', () => {
    const { issues, manifest } = check({ title: 'Torch', licence: 'CC0-1.0', files: ['assets/a.glb'], extra: 1 });
    expect(manifest.sources).toEqual([]);
    expect(issues.map((i) => `${i.path}: ${i.message}`)).toContain('sources[0].extra: unknown field "extra"');
    expect(issues.map((i) => `${i.path}: ${i.message}`)).toContain('sources[0].author: missing');
  });
});

describe('asset files', () => {
  const { manifest } = check(source());

  it('passes when the listed files and the pack agree', () => {
    expect(assetFileIssues('m', manifest, ['assets/manifest.json', 'assets/models/flashlight.glb'])).toEqual([]);
  });

  it('refuses a listed file that is missing, and a file no source lists', () => {
    expect(assetFileIssues('m', manifest, ['assets/models/stray.glb'])).toEqual([
      { source: 'm', path: 'sources[0].files[0]', message: '"assets/models/flashlight.glb" is not in the pack' },
      { source: 'm', path: 'sources', message: '"assets/models/stray.glb" is in the pack but no source lists it' },
    ]);
  });

  it("finds each model's file next to the content file that defines it", () => {
    const { registry } = buildRegistry([
      { source: 'pack/models.json', data: { models: [{ id: 'lamp', file: 'assets/models/lamp.glb' }] } },
    ]);
    const asked: string[] = [];
    const issues = modelFileIssues(registry, (contentFile, file) => {
      asked.push(`${contentFile} ${file}`);
      return false;
    });
    expect(asked).toEqual(['pack/models.json assets/models/lamp.glb']);
    expect(issues).toEqual([
      { source: 'pack/models.json', path: 'models[0].file', message: '"assets/models/lamp.glb" is not in the pack' },
    ]);
    expect(modelFileIssues(registry, () => true)).toEqual([]);
  });
});
