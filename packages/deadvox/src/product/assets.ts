import { bundledAssetFiles, type PresentationAssets } from '../presentation/bundledAssets.ts';
import { bundledPacks } from './content.ts';

const owned = (files: Readonly<Record<string, string>>) => bundledAssetFiles(files, bundledPacks);

// Only the product names its mod roots; presentation code receives these maps from the product entry. Glob keys
// are relative to this file, so they share a base with the pack roots of `src/product/content.ts`, `productContent`.
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
