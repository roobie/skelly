import { html, render } from 'lit-html';
import { PLAYER_CONTROL_BINDINGS } from './input.ts';

const labelForCode = (code: string): string => {
  if (code === 'mousemove') {
    return 'Mouse';
  }
  if (code === 'Space') {
    return 'Space';
  }
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (code.startsWith('Shift')) {
    return 'Shift';
  }
  switch (code) {
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    default:
      return code;
  }
};

export const controlsCardRows = (
  bindings: readonly {
    readonly codes: readonly string[];
    readonly action: string;
    readonly context?: string;
  }[] = PLAYER_CONTROL_BINDINGS,
) => {
  const rows = bindings.map((binding) => ({
    keys: [...new Set(binding.codes.map(labelForCode))].join(' / '),
    action: binding.action,
    inventory: 'context' in binding && binding.context === 'inventory',
  }));
  const inventory = rows.filter((binding) => binding.inventory);
  return [
    ...rows.filter((binding) => !binding.inventory).map(({ keys, action }) => ({ keys, action })),
    {
      keys: inventory.map(({ keys }) => keys).join(' · '),
      action: inventory.map(({ keys, action }) => `${keys}: ${action}`).join(' · '),
    },
  ];
};

export const mountControlsCard = (root: HTMLElement): void => {
  render(html`${controlsCardRows().map(({ keys, action }) => html`<dt>${keys}</dt><dd>${action}</dd>`)}`, root);
};
