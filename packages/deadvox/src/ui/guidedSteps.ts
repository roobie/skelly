import { html, render } from 'lit-html';
import { dominantSide } from '../core/character.ts';
import type { Inventory } from '../core/inventory.ts';
import type { GuidanceDef } from '../core/schema/guidance.ts';
import { showControlsTopic } from '../game/controls.ts';
import type { GuidedSteps } from '../game/guidedSteps.ts';
import { keyCap } from './keyCap.ts';

export interface GuidancePresentation {
  readonly inventory: Inventory;
  readonly inventoryOpen: boolean;
  readonly lightOn: boolean;
}

export const selectedGuidanceHint = (guide: GuidedSteps, state: GuidancePresentation) => {
  const held = (type: string) => Object.values(state.inventory.hands).some((item) => item?.type === type);
  const hint = guide.step.hints.find(
    ({ when }) =>
      (when.inventoryOpen === undefined || when.inventoryOpen === state.inventoryOpen) &&
      (when.lightOn === undefined || when.lightOn === state.lightOn) &&
      (when.held === undefined || when.held.every(held)) &&
      (when.carried === undefined || [...state.inventory.items()].some(({ item }) => item.type === when.carried)) &&
      (when.lesson === undefined || guide.weapons.lesson(when.lesson.track) === when.lesson.id),
  );
  if (!hint) {
    throw new Error(`Guidance step "${guide.stage}" has no matching hint`);
  }
  return hint.parts;
};

const stageHint = (guide: GuidedSteps, state: GuidancePresentation) => {
  const { inventory, inventoryOpen } = state;
  const text = guide.definition.chrome;
  const action = (id: string, label: string) => html`<span data-tutorial-action=${id}>${label} ${keyCap(id)}</span>`;
  const inventoryAction = action('ui.inventory-toggle', inventoryOpen ? text.closeInventory : text.inventory);
  const wield = (label: string) =>
    inventoryOpen
      ? html`${label}: ${action('inventory.hands', text.wieldSelectedItem)}`
      : html`${label}: ${inventoryAction}`;
  const nameOf = (type: string) => inventory.registry.items.get(type)!.name;
  const use = (type: string, label: string) =>
    inventoryOpen
      ? action('inventory.activate', label)
      : action(
          inventory.hands[dominantSide(inventory.character)]?.type === type ? 'hand.use-dominant' : 'hand.use-off',
          label,
        );
  const part = (node: GuidanceDef['steps'][number]['hints'][number]['parts'][number]) => {
    if ('text' in node) {
      return node.text;
    }
    if ('action' in node) {
      return action(node.action, node.label);
    }
    if ('wield' in node) {
      return wield(node.wield);
    }
    if ('wieldItem' in node) {
      return wield(nameOf(node.wieldItem));
    }
    if ('itemName' in node) {
      return nameOf(node.itemName);
    }
    if ('inventory' in node) {
      return inventoryAction;
    }
    if ('lineBreak' in node) {
      return html`<br />`;
    }
    return use(node.use, node.label);
  };
  return selectedGuidanceHint(guide, state).map(part);
};

export const mountGuidance = (guide: GuidedSteps, exit: () => void, restart: () => void) => {
  const box = document.getElementById('tutorial-objective')!;
  box.hidden = false;
  const text = guide.definition.chrome;
  const openControls = () => {
    const search = document.getElementById('controls-search') as HTMLInputElement;
    showControlsTopic(search, guide.step.topics);
    search.focus();
    search.scrollIntoView({ block: 'center' });
  };
  return (state: GuidancePresentation) => {
    render(
      html`
      <p class="tutorial-copy" data-tutorial-stage=${guide.stage}>${stageHint(guide, state)}</p>
      <p class="tutorial-copy tutorial-note">${text.unsaved}</p>
    `,
      box,
    );
    render(
      html`
      <div class="tutorial-action-buttons">
        ${guide.definition.choices
          .filter(({ id }) => guide.canChoose(id))
          .map(
            (choice) => html`
            <button type="button" data-tutorial-choice=${choice.id}
              @click=${() => (choice.action === 'exit' ? exit() : guide.choose(choice.id))}>${choice.label}</button>
          `,
          )}
        <button type="button" @click=${openControls}>${text.controls}</button>
        <button type="button" @click=${restart}>${text.restart}</button>
        <button type="button" @click=${exit}>${text.exit}</button>
      </div>
      ${guide.step.notes.map((note) => html`<p class="tutorial-action-note">${note}</p>`)}
    `,
      document.getElementById('tutorial-actions')!,
    );
  };
};
