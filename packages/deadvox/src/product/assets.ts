import { bundledAssetFiles, type PresentationAssets } from '../presentation/bundledAssets.ts';
import { bundledPacks } from './packs.ts';

const owned = (files: Readonly<Record<string, string>>) => bundledAssetFiles(files, bundledPacks);

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
  }),
  cursors: owned({
    ...import.meta.glob<string>('../../mods/*/assets/cursors/*.png', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob<string>('../../../mods/*/assets/cursors/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  }),
};
