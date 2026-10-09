import { html, render } from 'lit-html';
import {
  type Binding,
  type BindingRegistry,
  DEBUG_ONLY_CONTEXTS,
  inputBindings,
  NATIVE_INPUTS,
  POINTER_ACTIONS,
} from './inputBindings.ts';

export interface ControlsCardRow {
  readonly id: string;
  readonly keys: string;
  readonly action: string;
  readonly description: string;
}

const debugOnly = (binding: Binding): boolean =>
  binding.debug === true || binding.contexts.every((context) => DEBUG_ONLY_CONTEXTS.has(context));

export const controlsCardRows = (registry: BindingRegistry = inputBindings, debugRun = false): ControlsCardRow[] => [
  ...registry.bindings
    .filter((binding) => debugRun || !debugOnly(binding))
    .map((binding) => ({
      id: binding.id,
      keys: registry.label(binding.id),
      action: `${binding.description} (${binding.contexts.join(', ')})`,
      description: binding.description,
    })),
  ...POINTER_ACTIONS.map((action) => ({
    id: action.id,
    keys: registry.binding(action.id) ? registry.label(action.id) : action.label,
    action: action.description,
    description: action.description,
  })),
  ...NATIVE_INPUTS.map((native) => ({
    id: `browser.${native.code}`,
    keys: native.code,
    action: `${native.description} (fixed)`,
    description: native.description,
  })),
];

export const filterControlsCardRows = (rows: readonly ControlsCardRow[], query: string): readonly ControlsCardRow[] => {
  const needle = query.trim().toLowerCase();
  return needle === ''
    ? rows
    : rows.filter(({ description, keys }) => `${description} ${keys}`.toLowerCase().includes(needle));
};

export const mountControlsCard = (root: HTMLElement, search: HTMLInputElement, debugRun: () => boolean): void => {
  const draw = () => {
    const rows = filterControlsCardRows(controlsCardRows(inputBindings, debugRun()), search.value);
    render(
      html`${rows.map(({ id, keys, action }) => html`<dt data-input-action=${id}>${keys}</dt><dd>${action}</dd>`)}`,
      root,
    );
  };
  search.addEventListener('input', draw);
  inputBindings.subscribe(draw);
  draw();
};
