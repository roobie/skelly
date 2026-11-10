import { createKeyboardInput } from '../presentation/entries/input.ts';
import { INPUT_BINDINGS } from './controls.ts';

/** The page's keyboard and key bindings; each entry passes them to the modules that read keys. */
export const keyboardInput = createKeyboardInput(INPUT_BINDINGS);
export const inputBindings = keyboardInput.registry;
