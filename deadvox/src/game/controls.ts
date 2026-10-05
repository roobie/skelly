import { html, render } from 'lit-html';
import { type BindingRegistry, inputBindings, NATIVE_INPUTS, POINTER_ACTIONS } from './inputBindings.ts';

export const controlsCardRows = (registry: BindingRegistry = inputBindings) => [
  ...registry.bindings
    .filter((binding) => !binding.debug)
    .map((binding) => ({
      id: binding.id,
      keys: registry.label(binding.id),
      action: `${binding.description} (${binding.contexts.join(', ')})`,
    })),
  ...POINTER_ACTIONS.map((action) => ({ id: action.id, keys: action.label, action: action.description })),
  ...NATIVE_INPUTS.map((native) => ({
    id: `browser.${native.code}`,
    keys: native.code,
    action: `${native.description} (fixed)`,
  })),
];
export const mountControlsCard = (root: HTMLElement): void => {
  const draw = () =>
    render(
      html`${controlsCardRows().map(({ id, keys, action }) => html`<dt data-input-action=${id}>${keys}</dt><dd>${action}</dd>`)}`,
      root,
    );
  inputBindings.subscribe(draw);
  draw();
};
