import { bundledAssetFiles, type PresentationAssets } from '../presentation/bundledAssets.ts';

// Only the product names its mod roots; presentation code receives these maps from the product entry. Glob keys
// are relative to this file, so it sits at the depth of the pack-manifest glob whose roots key the assets.
export const productAssets: PresentationAssets = {
  audio: bundledAssetFiles({
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
  models: bundledAssetFiles({
    ...import.meta.glob<string>('../../mods/*/assets/**/*.glb', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob<string>('../../../mods/*/assets/**/*.glb', { eager: true, query: '?url', import: 'default' }),
  }),
  cursors: bundledAssetFiles({
    ...import.meta.glob<string>('../../mods/*/assets/cursors/*.png', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob<string>('../../../mods/*/assets/cursors/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  }),
};
