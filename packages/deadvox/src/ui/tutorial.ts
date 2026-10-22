import { html, render } from 'lit-html';
import { dominantSide } from '../core/character.ts';
import type { Inventory } from '../core/inventory.ts';
import type { ScreenText } from '../core/schema.ts';
import type { Tutorial } from '../game/tutorial.ts';
import { keyCap } from './keyCap.ts';

export interface TutorialPresentation {
  readonly inventory: Inventory;
  readonly inventoryOpen: boolean;
  readonly lightOn: boolean;
}

// Search terms matched against the controls card's binding descriptions, which code owns, so they stay with it.
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
  'light-on': 'hand',
  'light-swap': 'quickbar',
  'light-relight': 'hand',
};

const stageHint = (
  stage: Tutorial['stage'],
  kit: Tutorial['lightKit'],
  { inventory, inventoryOpen, lightOn }: TutorialPresentation,
  text: ScreenText['tutorial'],
) => {
  const action = (id: string, label: string) => html`<span data-tutorial-action=${id}>${label} ${keyCap(id)}</span>`;
  const inventoryAction = action('ui.inventory-toggle', inventoryOpen ? text.closeInventory : text.inventory);
  const quickAction = html`
    <span data-tutorial-action="inventory.quick-action-gate">
      ${text.quickAction} ${keyCap('inventory.quick-action-gate')} +
      <span data-tutorial-action="hand.use-dominant">${keyCap('hand.use-dominant')}</span>
    </span>
  `;
  const wield = (label: string) =>
    inventoryOpen
      ? html`${label}: ${action('inventory.hands', text.wieldSelectedItem)}`
      : html`${label}: ${inventoryAction}`;
  const held = (type: string) => Object.values(inventory.hands).some((item) => item?.type === type);
  const nameOf = (type: string) => inventory.registry.items.get(type)?.name ?? type;
  const use = (type: string, label: string) =>
    inventoryOpen
      ? inventoryAction
      : action(
          inventory.hands[dominantSide(inventory.character)]?.type === type ? 'hand.use-dominant' : 'hand.use-off',
          label,
        );
  const eatHint = () => {
    if (held('opened_beans')) {
      return use('opened_beans', text.eatBeans);
    }
    if ([...inventory.items()].some(({ item }) => item.type === 'opened_beans')) {
      return wield(text.openedBeans);
    }
    return held('canned_beans') ? use('canned_beans', text.openCan) : wield(text.canOfBeans);
  };
  const swapHint = () =>
    inventoryOpen
      ? html`${nameOf(kit.battery)}: ${action('quickbar.assign.1', kit.labels.assign)}`
      : html`${inventoryAction} · ${action('quickbar.use.1', kit.labels.swap)}`;
  const hints = {
    move: html`${action('movement.forward', text.forward)} · ${action('movement.back', text.back)} · ${action('movement.left', text.left)} · ${action('movement.right', text.right)} · ${action('pointer.look', text.look)}`,
    door: action('world.interact', text.openDoor),
    loot: inventoryOpen
      ? html`
          ${action('inventory.previous', text.selectPrevious)} · ${action('inventory.next', text.selectNext)} ·
          ${action('inventory.best-pocket', text.takeSelected)} · ${action('inventory.hands', text.wieldSelected)} ·
          ${action('inventory.wear', text.wearOrRemove)}
          <br />
          ${action('inventory.search', text.searchSupplies)} · ${quickAction}
        `
      : inventoryAction,
    hands: wield(text.beansAndOpener),
    open: held('canned_beans') && held('can_opener') ? use('can_opener', text.openCan) : wield(text.beansAndOpener),
    eat: stage === 'eat' ? eatHint() : '',
    drink: held('water_bottle') ? use('water_bottle', text.drink) : wield(text.waterBottle),
    light: held('flashlight') ? use('flashlight', lightOn ? text.switchOff : text.switchOn) : wield(text.flashlight),
    escape: html`${action('player.crouch-toggle', text.crouch)} · ${text.exitPath}`,
    pause: action('ui.main-menu-toggle', text.mainMenu),
    finish: action('ui.main-menu-toggle', text.mainMenu),
    'light-on': held(kit.light) ? use(kit.light, kit.labels.on) : wield(nameOf(kit.light)),
    'light-swap': held(kit.light) ? swapHint() : wield(nameOf(kit.light)),
    'light-relight': held(kit.light) ? use(kit.light, kit.labels.relight) : wield(nameOf(kit.light)),
  };
  return hints[stage];
};

export const mountTutorial = (
  tutorial: Tutorial,
  text: ScreenText['tutorial'],
  exit: () => void,
  restart: () => void,
) => {
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
      <p class="tutorial-copy" data-tutorial-stage=${tutorial.stage}>${stageHint(tutorial.stage, tutorial.lightKit, state, text)}</p>
      <p class="tutorial-copy tutorial-note">${text.unsaved}</p>
    `,
      box,
    );
    render(
      html`
      <div class="tutorial-action-buttons">
        ${
          tutorial.canStartLight
            ? html`<button type="button" data-tutorial-light @click=${() => tutorial.startLight()}>${tutorial.lightKit.labels.start}</button>`
            : ''
        }
        <button type="button" @click=${openControls}>${text.practiceControls}</button>
        <button type="button" @click=${restart}>${text.restart}</button>
        <button type="button" @click=${exit}>${text.exit}</button>
      </div>

    `,
      document.getElementById('tutorial-actions')!,
    );
  };
};
