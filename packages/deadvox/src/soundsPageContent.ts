import bodyFile from './content/base/body.json' with { type: 'json' };
import sensesFile from './content/base/senses.json' with { type: 'json' };
import uiFile from './content/base/ui.json' with { type: 'json' };
import { buildRegistry } from './core/content.ts';

const soundFiles = import.meta.glob<unknown>('./content/base/sounds*.json', { eager: true, import: 'default' });

/**
 * The listening sheet's content: every sound file, the UI tokens its style sheet is measured in, the default
 * volumes and the player's senses the audio previews with, and the body whose heartbeat it previews.
 */
export const buildSoundsPageContent = () =>
  buildRegistry([
    ...Object.entries(soundFiles)
      .sort(([a], [b]) => a.localeCompare(b))
      // Named as the game names them from src/game, so audio finds each sound's files beside its source.
      .map(([path, data]) => ({ source: `.${path}`, data })),
    { source: '../content/base/ui.json', data: uiFile },
    { source: '../content/base/body.json', data: bodyFile },
    { source: '../content/base/senses.json', data: sensesFile },
  ]);
