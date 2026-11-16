import { bundledAssetFiles, type PresentationAssets } from '@skelly/presentation/play';
import { markLoad, measureLoad } from '../loadTiming.ts';
import { EXTERNAL_ASSET_ROOT } from './externalRoot.ts';
import { bundledPacks } from './packs.ts';

const assetManifestStart = markLoad('asset manifest build start');
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
    ...import.meta.glob<string>(['./@skelly/released-audio/*.ogg'], { eager: true, query: '?url', import: 'default' }),
  }),
  models: owned({
    ...import.meta.glob<string>('../../mods/*/assets/**/*.glb', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob<string>('../../../mods/*/assets/**/*.glb', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob<string>(['./@skelly/released-models/*.glb'], { eager: true, query: '?url', import: 'default' }),
  }),
  // URLs only: the bytes are fetched at session start, so a changed figure is read fresh by the next session.
  figures: owned(
    import.meta.glob<string>(['./@skelly/released-figures/*.{glb,json}'], {
      eager: true,
      query: '?url',
      import: 'default',
    }),
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
measureLoad('asset manifest build', assetManifestStart, markLoad('asset manifest build end'));
