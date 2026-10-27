import { html, render } from 'lit-html';
import {
  type BindingRegistry,
  bindingIsDebugOnly,
  contextsForRun,
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

export const controlsCardRows = (registry: BindingRegistry = inputBindings, debugRun = false): ControlsCardRow[] => [
  ...registry.bindings
    .filter((binding) => debugRun || !bindingIsDebugOnly(binding))
    .map((binding) => {
      const contexts = contextsForRun(binding, debugRun);
      return {
        id: binding.id,
        keys: registry.label(binding.id),
        action: `${binding.description} (${contexts.join(', ')})`,
        description: binding.description,
      };
    }),
  ...POINTER_ACTIONS.map((action) => ({
    id: action.id,
    keys: registry.label(action.id),
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

/** A typed search matches descriptions and key labels; a topic is a list of action ids, so it never matches by wording. */
export type ControlsQuery = string | readonly string[];

export const filterControlsCardRows = (
  rows: readonly ControlsCardRow[],
  query: ControlsQuery,
): readonly ControlsCardRow[] => {
  if (typeof query !== 'string') {
    return rows.filter(({ id }) => query.includes(id));
  }
  const needle = query.trim().toLowerCase();
  return needle === ''
    ? rows
    : rows.filter(({ description, keys }) => `${description} ${keys}`.toLowerCase().includes(needle));
};

const TOPIC_EVENT = 'controls-topic';

/** Shows only the rows of these actions until the player types a search. */
export const showControlsTopic = (search: HTMLInputElement, actions: readonly string[]): void => {
  search.value = '';
  search.dispatchEvent(new CustomEvent<readonly string[]>(TOPIC_EVENT, { detail: actions }));
};

export const mountControlsCard = (root: HTMLElement, search: HTMLInputElement, debugRun: () => boolean): void => {
  let topic: readonly string[] | undefined;
  const draw = () => {
    const rows = filterControlsCardRows(controlsCardRows(inputBindings, debugRun()), topic ?? search.value);
    render(
      html`${rows.map(({ id, keys, action }) => html`<dt data-input-action=${id}>${keys}</dt><dd>${action}</dd>`)}`,
      root,
    );
  };
  search.addEventListener(TOPIC_EVENT, (event) => {
    topic = (event as CustomEvent<readonly string[]>).detail;
    draw();
  });
  search.addEventListener('input', () => {
    topic = undefined;
    draw();
  });
  inputBindings.subscribe(draw);
  draw();
};
