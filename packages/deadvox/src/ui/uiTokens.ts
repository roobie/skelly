import { claimed } from '../core/capabilities.ts';
import type { Registry } from '../core/content.ts';
import { bundledAssetFiles, bundledOriginAssetKey } from '../game/bundledAssets.ts';
import type { bundledPacks } from '../game/bundledPacks.ts';

const CURSOR_FILES = bundledAssetFiles({
  ...import.meta.glob<string>('../../mods/*/assets/cursors/*.png', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob<string>('../../../mods/*/assets/cursors/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
});

/** Installs the stack's UI tuning and cursor once, before game startup. */
export const applyUiTokens = (
  registry: Pick<Registry, 'ui' | 'cursors' | 'contentOrigins'>,
  root: HTMLElement,
  { files = CURSOR_FILES, packs }: { files?: Readonly<Record<string, string>>; packs?: typeof bundledPacks } = {},
): void => {
  const tuning = claimed(registry.ui, 'interface');
  if (!tuning) {
    throw new Error('missing required capability "interface"');
  }
  const cursor = claimed(registry.cursors, 'gameCursor');
  if (!cursor) {
    throw new Error('missing required capability "gameCursor"');
  }
  const origin = registry.contentOrigins.get(`cursors:${cursor.id}`);
  const key = bundledOriginAssetKey(origin?.source, cursor.image, packs);
  const image = key ? files[key] : undefined;
  if (!image) {
    throw new Error(`cursor image "${cursor.image}" is not bundled`);
  }
  root.style.setProperty('--ui-spacing', String(tuning.spacing));
  root.style.setProperty('--ui-scale', String(tuning.hudScale));
  root.style.setProperty('--cursor-image', `url("${image}")`);
  root.style.setProperty('--cursor-frame-width', `${cursor.frameWidthPx}px`);
  root.style.setProperty('--cursor-frame-height', `${cursor.frameHeightPx}px`);
  root.style.setProperty('--cursor-hand-offset', `${cursor.handOffsetPx}px`);
};
