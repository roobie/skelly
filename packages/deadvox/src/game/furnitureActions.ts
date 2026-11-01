import type { BlockEntity } from '../core/blockEntities.ts';
import { dominantSide } from '../core/character.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { coreLabel } from '../core/coreText.ts';
import { movableRefusal, slidableFurniture } from '../core/furnitureMove.ts';
import type { Inventory } from '../core/inventory.ts';
import { fillText } from '../core/textTemplate.ts';
import { type ItemAction, ItemActionSelection } from './itemActions.ts';

export const furnitureActionsFor = (
  inventory: Inventory,
  entity: BlockEntity,
  blockSize: number,
  knownRecipes?: Iterable<string>,
): ItemAction[] => {
  const text = inventory.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText;
  const hasRepair = [...(knownRecipes ?? [])].some((id) => {
    const recipe = inventory.registry.recipes.get(id);
    const repair = recipe?.kind === 'repair' ? recipe.repair : undefined;
    return repair?.entity === entity.type && inventory.entities.canRepair(entity, repair.amount);
  });
  const held = inventory.hands[dominantSide(inventory.character)];
  const target = held?.work?.repairTarget;
  const continuing = knownRecipes !== undefined && target?.kind === 'entity' && target.uid === entity.uid;
  const actions: ItemAction[] = [];
  if (slidableFurniture(inventory, entity, blockSize)) {
    actions.push({ id: 'push', label: text.worldService.push }, { id: 'drag', label: text.worldService.drag });
  } else if (movableRefusal(inventory, entity, blockSize) === undefined) {
    actions.push({ id: 'lift', label: text.worldService.lift });
  }
  if (continuing) {
    actions.push({
      id: 'continue',
      label: coreLabel(inventory.registry, 'continueWork', {
        item: inventory.entities.defOf(entity).name.toLowerCase(),
      }),
      workUid: held!.uid,
    });
  } else if (hasRepair) {
    actions.push({
      id: 'repair',
      label: fillText(text.crafting.repair, { item: inventory.entities.defOf(entity).name }),
    });
  }
  return actions;
};

export class FurnitureActionSelection extends ItemActionSelection {
  private uid: number | undefined;

  constructor(openCanLabel: string) {
    super(openCanLabel);
  }

  open(entity: { uid: number }, actions: readonly ItemAction[]): void {
    this.uid = entity.uid;
    this.forItem(entity, actions);
  }

  isOpen(entity: { uid: number }): boolean {
    return this.uid === entity.uid;
  }

  sync(targetUid: number | undefined, paused = false): void {
    if (paused || targetUid !== this.uid) {
      this.uid = undefined;
    }
  }

  confirm(entity: { uid: number }, actions: readonly ItemAction[]): ItemAction | undefined {
    const action = this.isOpen(entity) ? this.forItem(entity, actions) : undefined;
    this.uid = undefined;
    return action;
  }
}
