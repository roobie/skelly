import bodyFile from '../../mods/skelly.body/body.json' with { type: 'json' };
import damageKindsFile from '../../mods/skelly.melee-classes/damage-kinds.json' with { type: 'json' };
import sensesFile from '../../mods/skelly.senses/senses.json' with { type: 'json' };
import soundFamiliesFile from '../../mods/skelly.sound-families/sound-families.json' with { type: 'json' };
import cursorFile from '../../mods/skelly.ui/cursor.json' with { type: 'json' };
import uiFile from '../../mods/skelly.ui/ui.json' with { type: 'json' };
import { buildRegistry } from './core/content.ts';

const soundFiles = import.meta.glob<unknown>(
  [
    '../mods/skelly.deadvox.residual/sounds*.json',
    '../../mods/skelly.ui/ui-sounds.json',
    '../../mods/skelly.melee-classes/melee-sounds.json',
    '../../mods/skelly.body/body-sounds.json',
    '../../mods/skelly.body/body-synth-sounds.json',
    '../../mods/skelly.natural-world/natural-sounds.json',
    '../../mods/skelly.natural-world/sounds-furniture.json',
  ],
  { eager: true, import: 'default' },
);

/**
 * The listening sheet's content: every sound file, the UI tokens its style sheet is measured in, the default
 * volumes and the player's senses the audio previews with, and the body whose heartbeat it previews.
 */
export const buildSoundsPageContent = () =>
  buildRegistry([
    ...Object.entries(soundFiles)
      .sort(([a], [b]) => a.localeCompare(b))
      // Named as the game names them from src/game, so audio finds each sound's files beside its source.
      .map(([path, data]) => ({ source: `../${path}`, data })),
    { source: '../../../mods/skelly.ui/ui.json', data: uiFile },
    { source: '../../../mods/skelly.ui/cursor.json', data: cursorFile },
    { source: '../../../mods/skelly.body/body.json', data: bodyFile },
    { source: '../../../mods/skelly.melee-classes/damage-kinds.json', data: damageKindsFile },
    { source: '../../../mods/skelly.sound-families/sound-families.json', data: soundFamiliesFile },
    { source: '../../../mods/skelly.senses/senses.json', data: sensesFile },
  ]);
