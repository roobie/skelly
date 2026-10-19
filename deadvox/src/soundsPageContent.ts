import uiFile from './content/base/ui.json' with { type: 'json' };
import { buildRegistry } from './core/content.ts';

const soundFiles = import.meta.glob<unknown>('./content/base/sounds*.json', { eager: true, import: 'default' });

/** The listening sheet's content: every sound file, plus the UI tokens its style sheet is measured in. */
export const buildSoundsPageContent = () =>
  buildRegistry([
    ...Object.entries(soundFiles)
      .sort(([a], [b]) => a.localeCompare(b))
      // Named as the game names them from src/game, so audio finds each sound's files beside its source.
      .map(([path, data]) => ({ source: `.${path}`, data })),
    { source: '../content/base/ui.json', data: uiFile },
  ]);
