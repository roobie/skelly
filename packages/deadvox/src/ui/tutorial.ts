import { html, render } from 'lit-html';
import { dominantSide } from '../core/character.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Tutorial } from '../game/tutorial.ts';
import { keyCap } from './keyCap.ts';

export interface TutorialPresentation {
  readonly inventory: Inventory;
  readonly inventoryOpen: boolean;
  readonly lightOn: boolean;
}

const stageTopics: Record<Tutorial['stage'], string> = {
  move: 'move',
  door: 'interact',
  loot: 'inventory',
  hands: 'wield',
  eat: 'hand',
  drink: 'hand',
  light: 'hand',
  escape: 'crouch',
  pause: 'main menu',
};

const stageHint = (stage: Tutorial['stage'], { inventory, inventoryOpen, lightOn }: TutorialPresentation) => {
  const action = (id: string, label: string) => html`<span data-tutorial-action=${id}>${label} ${keyCap(id)}</span>`;
  const inventoryAction = action('ui.inventory-toggle', inventoryOpen ? 'Close inventory' : 'Inventory');
  const wield = (label: string) =>
    inventoryOpen
      ? html`${label}: ${action('inventory.hands', 'Wield selected item')}`
      : html`${label}: ${inventoryAction}`;
  const held = (type: string) => Object.values(inventory.hands).some((item) => item?.type === type);
  const use = (type: string, label: string) =>
    inventoryOpen
      ? inventoryAction
      : action(
          inventory.hands[dominantSide(inventory.character)]?.type === type ? 'hand.use-dominant' : 'hand.use-off',
          label,
        );
  const eatHint = () => {
    if (held('beans')) {
      return use('beans', 'Eat beans');
    }
    if ([...inventory.items()].some(({ item }) => item.type === 'beans')) {
      return wield('Opened beans — Take / wield');
    }
    return held('canned_beans') ? use('canned_beans', 'Open can') : wield('Can of beans');
  };
  const hints = {
    move: html`${action('movement.forward', 'Forward')} · ${action('movement.back', 'Back')} · ${action('movement.left', 'Left')} · ${action('movement.right', 'Right')} · ${action('pointer.look', 'Look')}`,
    door: action('world.interact', 'Open station door'),
    loot: inventoryOpen
      ? html`${action('inventory.search', 'Search supplies')} · ${action('inventory.best-pocket', 'Take selected item')}`
      : inventoryAction,
    hands: wield('Can of beans'),
    eat: stage === 'eat' ? eatHint() : '',
    drink: held('water_bottle') ? use('water_bottle', 'Drink') : wield('Water bottle'),
    light: held('flashlight')
      ? use('flashlight', lightOn ? 'Switch off' : 'Switch on')
      : wield('Flashlight — On / off'),
    escape: html`${action('player.crouch-toggle', 'Crouch')} · Exit path`,
    pause: action('ui.main-menu-toggle', 'Main menu'),
  };
  return hints[stage];
};

export const mountTutorial = (tutorial: Tutorial, exit: () => void, restart: () => void) => {
  const box = document.getElementById('tutorial-objective')!;
  box.hidden = false;
  const openControls = () => {
    const search = document.getElementById('controls-search') as HTMLInputElement;
    search.value = stageTopics[tutorial.stage];
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.focus();
    search.scrollIntoView({ block: 'center' });
  };
  return (state: TutorialPresentation) => {
    render(
      html`
      <p class="tutorial-copy" data-tutorial-stage=${tutorial.stage}>${stageHint(tutorial.stage, state)}</p>
      <p class="tutorial-copy tutorial-note">Unsaved practice</p>
    `,
      box,
    );
    render(
      html`
      <button type="button" @click=${openControls}>Practice controls</button>
      ${tutorial.stage === 'eat' || tutorial.stage === 'hands' ? html`<p>A carried can opener enables opening a sealed can in hand. Opened food goes to a pocket or the ground, not into the hand.</p>` : ''}
      <button type="button" @click=${restart}>Restart practice</button>
      <button type="button" @click=${exit}>Exit practice</button>
    `,
      document.getElementById('tutorial-actions')!,
    );
  };
};
