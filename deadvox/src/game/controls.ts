import { html, render } from 'lit-html';
import { CONTROL_CODES, KEY_BINDINGS } from './input.ts';

export const labelForCode = (code: string): string => {
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
  if (code === KEY_BINDINGS.leftHandAction.code) {
    return '=';
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

/** One presentation-only binding table feeds the player-facing help card. */
export const PLAYER_CONTROL_BINDINGS = [
  {
    keys: 'WASD',
    codes: [CONTROL_CODES.forward, CONTROL_CODES.left, CONTROL_CODES.back, CONTROL_CODES.right],
    action: 'Move',
  },
  { keys: 'Shift', codes: [CONTROL_CODES.sprintLeft, CONTROL_CODES.sprintRight], action: 'Sprint' },
  { keys: 'Z', codes: [CONTROL_CODES.walkToggle], action: 'Walk / jog' },
  { keys: 'Space', codes: [CONTROL_CODES.jump], action: 'Jump' },
  { keys: 'Mouse', codes: ['mousemove'], action: 'Look' },
  { keys: 'Left click', codes: [], action: 'Right-hand primary action; right jab if empty' },
  {
    keys: '=',
    codes: [KEY_BINDINGS.leftHandAction.code],
    action: 'Left-hand primary action',
  },
  { keys: 'F', codes: [CONTROL_CODES.interact], action: 'Interact with a door or furniture' },
  {
    keys: 'R',
    codes: [CONTROL_CODES.reload, CONTROL_CODES.rotate],
    action: 'Hold to load loose shells; double-press to rack; tap does nothing; rotate while dragging in inventory',
  },
  { keys: 'Backspace', codes: [CONTROL_CODES.descend], action: 'Descend in debug noclip' },
  { keys: 'L', codes: [CONTROL_CODES.sleep], action: 'Sleep; better on a bed; press again to stop' },
  { keys: 'Tab', codes: [CONTROL_CODES.inventory], action: 'Open / close inventory' },
  { keys: '1–5', codes: CONTROL_CODES.quickbar, action: 'Quickbar: tap to take or put away; hold to use' },
  { keys: 'C', codes: [CONTROL_CODES.continue], action: 'Continue after an interruption' },
  { keys: 'X', codes: [CONTROL_CODES.cancel], action: 'Cancel handling; stop after an interruption' },
  { keys: 'E', codes: [CONTROL_CODES.bestPocket], action: 'Move to your best pocket', context: 'inventory' },
  { keys: 'H', codes: [CONTROL_CODES.hands], action: 'Move to hands', context: 'inventory' },
  { keys: 'W', codes: [CONTROL_CODES.wear], action: 'Wear or remove', context: 'inventory' },
  { keys: 'D', codes: [CONTROL_CODES.drop], action: 'Drop', context: 'inventory' },
  { keys: 'A', codes: [CONTROL_CODES.takeAll], action: 'Take all like this', context: 'inventory' },
  { keys: 'S', codes: [CONTROL_CODES.search], action: 'Search next container', context: 'inventory' },
  { keys: 'U', codes: [CONTROL_CODES.use], action: 'Use selected item', context: 'inventory' },
  {
    keys: '↑ / ↓ / ← / →',
    codes: [CONTROL_CODES.previous, CONTROL_CODES.next, 'ArrowLeft', 'ArrowRight'],
    action: 'Select previous / next item',
    context: 'inventory',
  },
  { keys: KEY_BINDINGS.mainMenu.label, codes: [CONTROL_CODES.menu], action: 'Main menu, HUD and audio settings' },
  {
    keys: KEY_BINDINGS.performanceOverlay.label,
    codes: [KEY_BINDINGS.performanceOverlay.code],
    action: 'Toggle performance overlay',
  },
  { keys: 'Escape', codes: ['Escape'], action: 'Release the mouse (browser control)' },
] as const;

export const controlsCardRows = (
  bindings: readonly {
    readonly codes: readonly string[];
    readonly keys?: string;
    readonly action: string;
    readonly context?: string;
  }[] = PLAYER_CONTROL_BINDINGS,
) => {
  const rows = bindings.map((binding) => ({
    keys: binding.codes.length > 0 ? [...new Set(binding.codes.map(labelForCode))].join(' / ') : (binding.keys ?? ''),
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
