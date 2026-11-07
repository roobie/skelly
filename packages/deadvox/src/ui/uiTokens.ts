import { claimed } from '../core/capabilities.ts';
import type { Registry } from '../core/content.ts';
import type { bundledPacks } from '../game/bundledPacks.ts';
import { bundledOriginAssetKey } from '../presentation/bundledAssets.ts';

/** Installs the stack's UI tuning and cursor once, before game startup. */
export const applyUiTokens = (
  registry: Pick<Registry, 'ui' | 'cursors' | 'cursorStack'>,
  root: HTMLElement,
  {
    report,
    files,
    packs,
  }: {
    report: (message: string) => void;
    /** Cursor image URLs by bundled asset key; see `PresentationAssets`, `cursors`. */
    files: Readonly<Record<string, string>>;
    packs?: typeof bundledPacks;
  },
): void => {
  const tuning = claimed(registry.ui, 'interface');
  if (!tuning) {
    throw new Error('missing required capability "interface"');
  }
  if (!claimed(registry.cursors, 'gameCursor')) {
    throw new Error('missing required capability "gameCursor"');
  }
  root.style.setProperty('--ui-spacing', String(tuning.spacing));
  root.style.setProperty('--ui-scale', String(tuning.hudScale));
  const rows = registry.cursorStack.filter(({ cursor }) => cursor.capability === 'gameCursor').reverse();
  for (const { cursor, source } of rows) {
    const key = bundledOriginAssetKey(source, cursor.image, packs);
    const image = key ? files[key] : undefined;
    if (image) {
      root.style.setProperty('--cursor-image', `url("${image}")`);
      root.style.setProperty('--cursor-frame-width', `${cursor.frameWidthPx}px`);
      root.style.setProperty('--cursor-frame-height', `${cursor.frameHeightPx}px`);
      root.style.setProperty('--cursor-hand-offset', `${cursor.handOffsetPx}px`);
      return;
    }
    report(`cursor image "${cursor.image}" from ${source} is not bundled`);
  }
  throw new Error('no cursor row in the stack has a bundled image');
};
