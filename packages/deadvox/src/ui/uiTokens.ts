import type { Registry } from '../engine/content.ts';
import { claimed } from '../engine/inventory.ts';
import { bundledAssetUrl, type PackAssetFiles } from '../presentation/bundledAssets.ts';

/** Installs the stack's UI tuning and cursor once, before game startup. */
export const applyUiTokens = (
  registry: Pick<Registry, 'ui' | 'cursors' | 'cursorStack'>,
  root: HTMLElement,
  {
    report,
    files,
  }: {
    report: (message: string) => void;
    /** Cursor images; see `PresentationAssets`, `cursors`. */
    files: PackAssetFiles;
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
    const image = bundledAssetUrl(files, source, cursor.image);
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
