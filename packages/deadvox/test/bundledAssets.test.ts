import { expect, it } from 'vitest';
import type { PackManifest } from '../src/core/packAdmission.ts';
import { bundledAssetFiles, bundledOriginAssetKey } from '../src/game/bundledAssets.ts';

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
      const key = bundledOriginAssetKey(`${root}/nested/rows.json`, file, packs)!;
      expect(key).toBe(`fixture.pack${index}/${file}`);
      expect(files[key]).toBe(`url${index}`);
    });
    expect(bundledOriginAssetKey('../../mods/fixture.absent/rows.json', file, packs)).toBeUndefined();
  }
});
