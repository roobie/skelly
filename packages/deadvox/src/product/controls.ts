import controlsFile from '../../../mods/skelly.controls/controls.json' with { type: 'json' };
import type { Binding } from '../../../engine/src/input.ts';
import { bindingsFromControls, type ControlsFile } from '../game/bindingRegistry.ts';

/** The game's bindings with the shipped default keys. */
export const INPUT_BINDINGS: readonly Binding[] = bindingsFromControls(controlsFile as ControlsFile);
