import { html, render } from 'lit-html';
import { dominantSide } from '../core/character.ts';
import type { Inventory } from '../core/inventory.ts';
import { COMBAT_REVOLVER, COMBAT_SHOTGUN, type Tutorial } from '../game/tutorial.ts';
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
  open: 'hand',
  eat: 'hand',
  drink: 'hand',
  light: 'hand',
  escape: 'crouch',
  pause: 'main menu',
  finish: 'main menu',
  'revolver-wield': 'wield',
  'revolver-load': 'firearm',
  'revolver-aim': 'ready',
  'revolver-fire': 'firearm',
  'pump-wield': 'wield',
  'pump-load': 'firearm',
  'pump-rack': 'firearm',
  'pump-fire': 'firearm',
  down: 'ready',
  ammo: 'inventory',
};

const stageHint = (stage: Tutorial['stage'], { inventory, inventoryOpen, lightOn }: TutorialPresentation) => {
  const action = (id: string, label: string) => html`<span data-tutorial-action=${id}>${label} ${keyCap(id)}</span>`;
  const inventoryAction = action('ui.inventory-toggle', inventoryOpen ? 'Close inventory' : 'Inventory');
  const quickAction = html`
    <span data-tutorial-action="inventory.quick-action-gate">
      Quick action ${keyCap('inventory.quick-action-gate')} +
      <span data-tutorial-action="hand.use-dominant">${keyCap('hand.use-dominant')}</span>
    </span>
  `;
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
    if (held('opened_beans')) {
      return use('opened_beans', 'Eat beans');
    }
    if ([...inventory.items()].some(({ item }) => item.type === 'opened_beans')) {
      return wield('Opened beans — Take / wield');
    }
    return held('canned_beans') ? use('canned_beans', 'Open can') : wield('Can of beans');
  };
  const hints = {
    move: html`${action('movement.forward', 'Forward')} · ${action('movement.back', 'Back')} · ${action('movement.left', 'Left')} · ${action('movement.right', 'Right')} · ${action('pointer.look', 'Look')}`,
    door: action('world.interact', 'Open station door'),
    loot: inventoryOpen
      ? html`
          ${action('inventory.previous', 'Select previous')} · ${action('inventory.next', 'Select next')} ·
          ${action('inventory.best-pocket', 'Take selected')} · ${action('inventory.hands', 'Wield selected')} ·
          ${action('inventory.wear', 'Wear or remove')}
          <br />
          ${action('inventory.search', 'Search supplies')} · ${quickAction}
        `
      : inventoryAction,
    hands: wield('Can of beans · Can opener'),
    open:
      held('canned_beans') && held('can_opener') ? use('can_opener', 'Open can') : wield('Can of beans · Can opener'),
    eat: stage === 'eat' ? eatHint() : '',
    drink: held('water_bottle') ? use('water_bottle', 'Drink') : wield('Water bottle'),
    light: held('flashlight')
      ? use('flashlight', lightOn ? 'Switch off' : 'Switch on')
      : wield('Flashlight — On / off'),
    escape: html`${action('player.crouch-toggle', 'Crouch')} · Exit path`,
    pause: action('ui.main-menu-toggle', 'Main menu'),
    finish: action('ui.main-menu-toggle', 'Main menu — Exit practice, or try combat practice'),
    'revolver-wield': wield('Revolver · rounds in the supply cabinet'),
    'revolver-load': held(COMBAT_REVOLVER)
      ? html`${action('firearm.reload', 'Hold to load rounds')} · Release to close`
      : wield('Revolver'),
    'revolver-aim': action('stance.ready', 'Hold to ready the revolver'),
    'revolver-fire': html`${action('stance.ready', 'Ready')} · ${action('hand.use-dominant', 'Fire')}`,
    'pump-wield': wield('Pump shotgun · shells in the supply cabinet'),
    'pump-load': held(COMBAT_SHOTGUN)
      ? html`${action('firearm.reload', 'Hold to load shells')} · Release to stop`
      : wield('Pump shotgun'),
    'pump-rack': action('firearm.reload', 'Double-press to pump a shell in'),
    'pump-fire': html`${action('stance.ready', 'Ready')} · ${action('hand.use-dominant', 'Fire')} ·
      ${action('firearm.reload', 'Double-press to pump')}`,
    down: html`${action('stance.ready', 'Ready')} · ${action('hand.use-dominant', 'Down the shambler')}`,
    ammo: inventoryOpen ? 'Read the rounds on the held gun' : inventoryAction,
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
      <div class="tutorial-action-buttons">
        ${
          tutorial.canStartCombat
            ? html`<button type="button" data-tutorial-combat @click=${() => tutorial.startCombat()}>Combat practice (optional)</button>`
            : ''
        }
        <button type="button" @click=${openControls}>Practice controls</button>
        <button type="button" @click=${restart}>Restart practice</button>
        <button type="button" @click=${exit}>Exit practice</button>
      </div>

    `,
      document.getElementById('tutorial-actions')!,
    );
  };
};
