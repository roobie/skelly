import { bundledAssetFiles, type PresentationAssets } from '../presentation/bundledAssets.ts';
import { EXTERNAL_ASSET_ROOT } from './externalRoot.ts';
import { bundledPacks } from './packs.ts';

const owned = (files: Readonly<Record<string, string>>) => bundledAssetFiles(files, bundledPacks, EXTERNAL_ASSET_ROOT);

// Presentation code receives these maps from the product entry. Glob keys are relative to this directory, as the
// pack roots of `src/product/packs.ts`, `bundledPacks`, are.
export const productAssets: PresentationAssets = {
  audio: owned({
    ...import.meta.glob<string>('../../mods/*/assets/audio/**/*.ogg', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
    ...import.meta.glob<string>('../../../mods/*/assets/audio/**/*.ogg', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  }),
  models: owned({
    ...import.meta.glob<string>('../../mods/*/assets/**/*.glb', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob<string>('../../../mods/*/assets/**/*.glb', { eager: true, query: '?url', import: 'default' }),
    // The built namespaces, without those of packs only other products bundle, so their files never ship here.
    ...import.meta.glob<string>(
      [
        '../../../skelly-assets/built/*/assets/**/*.glb',
        '!../../../skelly-assets/built/skelly.armour/**',
        '!../../../skelly-assets/built/skelly.bestiary/**',
        '!../../../skelly-assets/built/skelly.bolt-guns/**',
      ],
      { eager: true, query: '?url', import: 'default' },
    ),
  }),
  // URLs only: the bytes are fetched at session start, so a changed figure is read fresh by the next session.
  figures: owned(
    import.meta.glob<string>(
      [
        '../../../skelly-assets/built/*/actors/*.json',
        '!../../../skelly-assets/built/skelly.armour/**',
        '!../../../skelly-assets/built/skelly.bestiary/**',
        '!../../../skelly-assets/built/skelly.bolt-guns/**',
      ],
      { eager: true, query: '?url', import: 'default' },
    ),
  ),
  cursors: owned({
    ...import.meta.glob<string>('../../mods/*/assets/cursors/*.png', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob<string>('../../../mods/*/assets/cursors/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  }),
};
