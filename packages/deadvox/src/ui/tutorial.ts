import { html, render } from 'lit-html';
import { dominantSide } from '../core/character.ts';
import type { Inventory } from '../core/inventory.ts';
import type { ScreenText } from '../core/schema.ts';
import { showControlsTopic } from '../game/controls.ts';
import type { Tutorial } from '../game/tutorial.ts';
import { keyCap } from './keyCap.ts';

export interface TutorialPresentation {
  readonly inventory: Inventory;
  readonly inventoryOpen: boolean;
  readonly lightOn: boolean;
}

// The actions each stage's hint names: ids, not search words, so a topic cannot match an unrelated row by wording.
const wieldTopic = ['ui.inventory-toggle', 'inventory.hands'];
const handTopic = [...wieldTopic, 'hand.use-dominant', 'hand.use-off'];
const menuTopic = ['ui.main-menu-toggle'];
const gunTopic = [
  ...handTopic,
  'inventory.best-pocket',
  'inventory.wear',
  'firearm.reload',
  'stance.ready',
  'aim.ads-toggle',
];
export const stageTopics: Record<Tutorial['stage'], readonly string[]> = {
  move: ['movement.forward', 'movement.back', 'movement.left', 'movement.right', 'pointer.look'],
  door: ['world.interact'],
  loot: [
    'ui.inventory-toggle',
    'inventory.previous',
    'inventory.next',
    'inventory.best-pocket',
    'inventory.hands',
    'inventory.wear',
    'inventory.search',
    'inventory.quick-action-gate',
    'hand.use-dominant',
  ],
  hands: wieldTopic,
  open: handTopic,
  eat: handTopic,
  drink: handTopic,
  light: handTopic,
  escape: ['player.crouch-toggle'],
  pause: menuTopic,
  finish: menuTopic,
  'light-on': handTopic,
  'light-swap': [...wieldTopic, 'quickbar.assign.1', 'quickbar.use.1'],
  'light-relight': handTopic,
  revolver: gunTopic,
  pump: gunTopic,
  melee: ['ui.inventory-toggle', 'inventory.drop', 'inventory.best-pocket', 'stance.ready', 'hand.use-dominant'],
  complete: menuTopic,
};

const stageHint = (
  tutorial: Tutorial,
  { inventory, inventoryOpen, lightOn }: TutorialPresentation,
  text: ScreenText['tutorial'],
) => {
  const { stage, lightKit: kit } = tutorial;
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
  const gunHint = (kind: 'revolver' | 'pump') => {
    const lesson = tutorial.weapons.lesson(kind);
    const gun = kind === 'revolver' ? text.revolver : text.pumpShotgun;
    if (inventoryOpen) {
      return html`${gun} — ${text.ammunitionDetails} · ${action('inventory.hands', lesson === 'unpack' ? text.wieldAmmunitionBox : text.wieldSelectedItem)} · ${action('inventory.best-pocket', text.carryLooseAmmunition)} · ${action('inventory.wear', text.wearBackpack)} · ${inventoryAction}`;
    }
    const fire = html`${action('stance.ready', text.ready)} · ${action('hand.use-dominant', text.fireDominant)} · ${action('hand.use-off', text.fireOff)}`;
    const load = action('firearm.reload', text.load);
    const rack = action('firearm.reload', kind === 'pump' ? text.pump : text.closeCylinder);
    const lessons = {
      unpack: html`${wield(text.boxedAmmunition)} · ${action('hand.use-dominant', text.unpackDominant)} · ${action('hand.use-off', text.unpackOff)}`,
      wield: wield(gun),
      inspect: html`${gun} — ${text.ammunitionDetails} · ${inventoryAction}`,
      partial: html`${gun} — ${text.partialLoad} · ${inventoryAction} · ${load} · ${rack}`,
      ready: html`${gun} — ${text.readyFire} · ${fire} · ${action('aim.ads-toggle', text.sightsOff)}`,
      reload: html`${gun} — ${text.reloadAfterFiring} · ${load} · ${rack} · ${fire}`,
      sighted: html`${gun} — ${text.sightedFire} · ${action('aim.ads-toggle', text.sights)} · ${rack} · ${fire}`,
      unload: html`${gun} — ${text.unloadLiveRounds} · ${load} · ${action('firearm.reload', text.unload)} · ${rack}`,
    };
    return lesson ? lessons[lesson] : '';
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
    revolver: gunHint('revolver'),
    pump: gunHint('pump'),
    melee: inventoryOpen
      ? html`${text.emptyHands} · ${action('inventory.drop', text.putDownSelected)} · ${action('inventory.best-pocket', text.stowSelected)} · ${inventoryAction}`
      : html`${text.emptyHands} · ${inventoryAction} · ${action('stance.ready', text.enGarde)} · ${action('hand.use-dominant', text.punch)}`,
    complete: html`${text.weaponsComplete} · ${action('ui.main-menu-toggle', text.mainMenu)}`,
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
    showControlsTopic(search, stageTopics[tutorial.stage]);
    search.focus();
    search.scrollIntoView({ block: 'center' });
  };
  return (state: TutorialPresentation) => {
    render(
      html`
      <p class="tutorial-copy" data-tutorial-stage=${tutorial.stage}>${stageHint(tutorial, state, text)}</p>
      <p class="tutorial-copy tutorial-note">${text.unsaved}</p>
    `,
      box,
    );
    render(
      html`
      <div class="tutorial-action-buttons">
        ${tutorial.stage === 'finish' ? html`<button type="button" data-tutorial-choice="weapons" @click=${() => tutorial.chooseWeapons()}>${text.weaponsPractice}</button>` : ''}
        ${tutorial.stage === 'finish' || tutorial.stage === 'complete' ? html`<button type="button" data-tutorial-choice="finish" @click=${exit}>${text.finishPractice}</button>` : ''}
        ${
          tutorial.canStartLight
            ? html`<button type="button" data-tutorial-light @click=${() => tutorial.startLight()}>${tutorial.lightKit.labels.start}</button>`
            : ''
        }
        <button type="button" @click=${openControls}>${text.practiceControls}</button>
        <button type="button" @click=${restart}>${text.restart}</button>
        <button type="button" @click=${exit}>${text.exit}</button>
      </div>
      ${
        tutorial.stage === 'revolver' || tutorial.stage === 'pump'
          ? html`<p class="tutorial-action-note">${text.rangeSupplies}</p>
            <p class="tutorial-action-note">${text.loadingDetail}</p>
            <p class="tutorial-action-note">${text.pumpingDetail}</p>`
          : ''
      }
    `,
      document.getElementById('tutorial-actions')!,
    );
  };
};
