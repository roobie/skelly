import { html, render } from 'lit-html';
import { PLAYER_CONTROL_BINDINGS } from './input.ts';

export const controlsCardRows = () => {
  const inventory = PLAYER_CONTROL_BINDINGS.filter(
    (binding) => 'context' in binding && binding.context === 'inventory',
  );
  return [
    ...PLAYER_CONTROL_BINDINGS.filter((binding) => !('context' in binding && binding.context === 'inventory')).map(
      ({ keys, action }) => ({ keys, action }),
    ),
    {
      keys: inventory.map(({ keys }) => keys).join(' · '),
      action: inventory.map(({ keys, action }) => `${keys}: ${action}`).join(' · '),
    },
  ];
};

export const mountControlsCard = (root: HTMLElement): void => {
  render(html`${controlsCardRows().map(({ keys, action }) => html`<dt>${keys}</dt><dd>${action}</dd>`)}`, root);
};
