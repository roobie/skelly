import type { Binding } from '@skelly/engine/input';
import { bindingsFromControls, type ControlsFile } from '../../../engine/src/game/entries/input.ts';
import controlsFile from '../../../mods/skelly.controls/controls.json' with { type: 'json' };

/** The game's bindings with the shipped default keys. */
export const INPUT_BINDINGS: readonly Binding[] = bindingsFromControls(controlsFile as ControlsFile);
