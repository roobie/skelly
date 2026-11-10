import type { PackManifest } from '@skelly/engine/packs';
import { expect, it } from 'vitest';
import { bundledAssetFiles } from '../src/play.ts';
import { bundledAssetUrl } from '../src/presentation/bundledAssets.ts';

it('isolates identical asset paths by owning pack across roots for models and audio', () => {
  const packs = ['../../mods/fixture.product', '../../../mods/fixture.shared'].map((root, index) => ({
    root,
    manifest: { id: `fixture.pack${index}` } as PackManifest,
  }));
  for (const file of ['assets/models/same.glb', 'assets/audio/same.ogg']) {
    const files = bundledAssetFiles(
      Object.fromEntries(packs.map(({ root }, index) => [`${root}/${file}`, `url${index}`])),
      packs,
    );
    packs.forEach(({ root }, index) => {
      expect(bundledAssetUrl(files, `${root}/nested/rows.json`, file)).toBe(`url${index}`);
    });
    expect(bundledAssetUrl(files, '../../mods/fixture.absent/rows.json', file)).toBeUndefined();
  }
});

const EXTERNAL = '../../../skelly-assets/built';
const externalPack = {
  root: '../../../mods/fixture.built',
  manifest: {
    id: 'fixture.built',
    files: [
      { path: 'rows.json', kind: 'content' },
      { path: 'assets/models/built.glb', kind: 'asset' },
      { path: 'assets/models/unsupplied.glb', kind: 'asset' },
    ],
  } as PackManifest,
};

it('a model row under the mod root finds its external GLB', () => {
  const files = bundledAssetFiles(
    { [`${EXTERNAL}/fixture.built/assets/models/built.glb`]: 'url' },
    [externalPack],
    EXTERNAL,
  );
  expect(bundledAssetUrl(files, `${externalPack.root}/rows.json`, 'assets/models/built.glb')).toBe('url');
});

it('an asset the manifest declares but no glob supplies looks up as undefined', () => {
  const files = bundledAssetFiles({}, [externalPack], EXTERNAL);
  expect(bundledAssetUrl(files, `${externalPack.root}/rows.json`, 'assets/models/unsupplied.glb')).toBeUndefined();
});

it('an external file inside a bundled namespace that no manifest declares is rejected', () => {
  expect(() =>
    bundledAssetFiles({ [`${EXTERNAL}/fixture.built/assets/models/stray.glb`]: 'url' }, [externalPack], EXTERNAL),
  ).toThrow('No bundled pack for asset');
});

it('an external key outside every bundled namespace is ignored', () => {
  const files = bundledAssetFiles(
    { [`${EXTERNAL}/fixture.other/assets/models/built.glb`]: 'url' },
    [externalPack],
    EXTERNAL,
  );
  expect(files.urls).toEqual({});
});

it('a declared asset present under both roots is rejected', () => {
  expect(() =>
    bundledAssetFiles(
      {
        [`${externalPack.root}/assets/models/built.glb`]: 'local',
        [`${EXTERNAL}/fixture.built/assets/models/built.glb`]: 'external',
      },
      [externalPack],
      EXTERNAL,
    ),
  ).toThrow('file found in both roots');
});
