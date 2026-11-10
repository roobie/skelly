import type { Binding } from '@skelly/engine/input';
import controlsFile from '../../../mods/skelly.controls/controls.json' with { type: 'json' };
import { bindingsFromControls, type ControlsFile } from '../game/bindingRegistry.ts';

/** The game's bindings with the shipped default keys. */
export const INPUT_BINDINGS: readonly Binding[] = bindingsFromControls(controlsFile as ControlsFile);
