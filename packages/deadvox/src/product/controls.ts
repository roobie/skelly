import type { Binding } from '@skelly/engine/input';
import { bindingsFromControls, type ControlsFile } from '@skelly/engine/input';
import controlsFile from '../../../mods/skelly.controls/controls.json' with { type: 'json' };
import actorControlsFile from '../../mods/skelly.deadvox.actors/controls-actors.json' with { type: 'json' };

/** The game's bindings with the shipped default keys. */
export const INPUT_BINDINGS: readonly Binding[] = bindingsFromControls({
  controls: [...(controlsFile as ControlsFile).controls, ...(actorControlsFile as ControlsFile).controls],
});
