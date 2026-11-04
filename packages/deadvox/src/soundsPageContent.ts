import bodyFile from '../mods/skelly.deadvox.residual/body.json' with { type: 'json' };
import damageKindsFile from '../mods/skelly.deadvox.residual/damage-kinds.json' with { type: 'json' };
import sensesFile from '../mods/skelly.deadvox.residual/senses.json' with { type: 'json' };
import uiFile from '../mods/skelly.deadvox.residual/ui.json' with { type: 'json' };
import { buildRegistry } from './core/content.ts';

const soundFiles = import.meta.glob<unknown>('../mods/skelly.deadvox.residual/sounds*.json', { eager: true, import: 'default' });

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
    { source: '../../mods/skelly.deadvox.residual/ui.json', data: uiFile },
    { source: '../../mods/skelly.deadvox.residual/body.json', data: bodyFile },
    { source: '../../mods/skelly.deadvox.residual/damage-kinds.json', data: damageKindsFile },
    { source: '../../mods/skelly.deadvox.residual/senses.json', data: sensesFile },
  ]);
