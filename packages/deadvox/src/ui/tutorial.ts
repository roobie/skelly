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
  revolver: 'reload',
  pump: 'reload',
  melee: 'ready',
  complete: 'main menu',
};

const stageHint = (tutorial: Tutorial, { inventory, inventoryOpen, lightOn }: TutorialPresentation) => {
  const { stage } = tutorial;
  const kit = tutorial.lightKit;
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
      return use('opened_beans', 'Eat beans');
    }
    if ([...inventory.items()].some(({ item }) => item.type === 'opened_beans')) {
      return wield('Opened beans — Take / wield');
    }
    return held('canned_beans') ? use('canned_beans', 'Open can') : wield('Can of beans');
  };
  const gunHint = (kind: 'revolver' | 'pump') => {
    const lesson = tutorial.weapons.lesson(kind);
    const gun = kind === 'revolver' ? 'Revolver' : 'Pump shotgun';
    if (inventoryOpen) {
      return html`${gun} — Ammunition details · ${action('inventory.hands', lesson === 'unpack' ? 'Wield ammunition box' : 'Wield selected item')} · ${action('inventory.best-pocket', 'Carry loose ammunition')} · ${action('inventory.wear', 'Wear backpack')} · ${inventoryAction}`;
    }
    const fire = html`${action('stance.ready', 'Ready')} · ${action('hand.use-dominant', 'Fire dominant hand')} · ${action('hand.use-off', 'Fire off hand')}`;
    const load = action('firearm.reload', 'Load — hold / stop — release');
    const rack = action('firearm.reload', kind === 'pump' ? 'Pump — double press' : 'Close cylinder — double press');
    const lessons = {
      unpack: html`${wield('Boxed ammunition — Wield')} · ${action('hand.use-dominant', 'Unpack dominant hand')} · ${action('hand.use-off', 'Unpack off hand')}`,
      wield: wield(gun),
      inspect: html`${gun} — Ammunition details · ${inventoryAction}`,
      partial: html`${gun} — Partial load · ${inventoryAction} · ${load} · ${rack}`,
      ready: html`${gun} — Ready fire · ${fire} · ${action('aim.ads-toggle', 'Sights off')}`,
      reload: html`${gun} — Reload after firing · ${load} · ${rack} · ${fire}`,
      sighted: html`${gun} — Sighted fire · ${action('aim.ads-toggle', 'Sights')} · ${rack} · ${fire}`,
      unload: html`${gun} — Unload live rounds · ${load} · ${action('firearm.reload', 'Unload — press, then hold')} · ${rack}`,
    };
    return lesson ? lessons[lesson] : '';
  };
  const swapHint = () =>
    inventoryOpen
      ? html`${nameOf(kit.battery)}: ${action('quickbar.assign.1', kit.labels.assign)}`
      : html`${inventoryAction} · ${action('quickbar.use.1', kit.labels.swap)}`;
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

    revolver: gunHint('revolver'),
    pump: gunHint('pump'),
    melee: inventoryOpen
      ? html`Empty hands · ${action('inventory.drop', 'Put down selected item')} · ${action('inventory.best-pocket', 'Stow selected item')} · ${inventoryAction}`
      : html`Empty hands · ${inventoryAction} · ${action('stance.ready', 'En garde')} · ${action('hand.use-dominant', 'Punch')}`,
    complete: html`Weapons practice complete · ${action('ui.main-menu-toggle', 'Main menu')}`,
    finish: action('ui.main-menu-toggle', 'Main menu'),
    'light-on': held(kit.light) ? use(kit.light, kit.labels.on) : wield(nameOf(kit.light)),
    'light-swap': held(kit.light) ? swapHint() : wield(nameOf(kit.light)),
    'light-relight': held(kit.light) ? use(kit.light, kit.labels.relight) : wield(nameOf(kit.light)),
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
      <p class="tutorial-copy" data-tutorial-stage=${tutorial.stage}>${stageHint(tutorial, state)}</p>
      <p class="tutorial-copy tutorial-note">Unsaved practice</p>
    `,
      box,
    );
    render(
      html`
      <div class="tutorial-action-buttons">
        ${tutorial.stage === 'finish' ? html`<button type="button" data-tutorial-choice="weapons" @click=${() => tutorial.chooseWeapons()}>Weapons practice</button>` : ''}
        ${tutorial.stage === 'finish' || tutorial.stage === 'complete' ? html`<button type="button" data-tutorial-choice="finish" @click=${exit}>Finish practice</button>` : ''}
        ${
          tutorial.canStartLight
            ? html`<button type="button" data-tutorial-light @click=${() => tutorial.startLight()}>${tutorial.lightKit.labels.start}</button>`
            : ''
        }
        <button type="button" @click=${openControls}>Practice controls</button>
        <button type="button" @click=${restart}>Restart practice</button>
        <button type="button" @click=${exit}>Exit practice</button>
      </div>
      ${
        tutorial.stage === 'revolver' || tutorial.stage === 'pump'
          ? html`<p class="tutorial-action-note">Range — north-west dirt path · Range supplies — Backpack / boxed ammunition</p>
            <p class="tutorial-action-note">Loose ammunition must be carried; a revolver needs a free loading hand. Release loading before capacity for a partial load.</p>
            <p class="tutorial-action-note">Pumping chambers a shell from the tube; unloading ejects live rounds. Ammunition is finite; Restart practice replaces the whole attempt.</p>`
          : ''
      }
    `,
      document.getElementById('tutorial-actions')!,
    );
  };
};
