import type { BlockEntity } from '../core/blockEntities.ts';
import { dominantSide } from '../core/character.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { coreLabel } from '../core/coreText.ts';
import { liftableFurniture, slidableFurniture } from '../core/furnitureMove.ts';
import type { Inventory } from '../core/inventory.ts';
import { fillText } from '../core/textTemplate.ts';
import { type ItemAction, ItemActionSelection } from './itemActions.ts';

export interface RadialAction extends ItemAction {
  readonly angleRadians: number;
}

export const radialEntries = (
  actions: readonly ItemAction[],
  slots: Readonly<Record<string, number>>,
): RadialAction[] =>
  actions.map((action) => {
    const degrees = slots[action.id];
    if (degrees === undefined) {
      throw new Error(`No radial slot for action "${action.id}"`);
    }
    return { ...action, angleRadians: (degrees * Math.PI) / 180 };
  });

export const heldMenuActions = (actions: readonly ItemAction[], treatLabel: string): readonly ItemAction[] => {
  const direct = actions.filter((action) => !action.treatment);
  return actions.some((action) => action.treatment) ? [...direct, { id: 'treat', label: treatLabel }] : direct;
};

export const radialEntryIndex = (
  x: number,
  y: number,
  actions: readonly RadialAction[],
  deadZone: number,
): number | undefined => {
  if (Math.hypot(x, y) <= deadZone) {
    return undefined;
  }
  const angle = Math.atan2(x, -y);
  let nearest: number | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  actions.forEach((action, index) => {
    const delta = angle - action.angleRadians;
    const distance = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
};

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
  } else if (liftableFurniture(inventory.entities.defOf(entity)) || entity.bar) {
    actions.push({ id: 'lift', label: entity.bar ? text.interaction.liftBar : text.worldService.lift });
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
  private x = 0;
  private y = 0;
  private armed = false;
  source: 'furniture' | 'held' = 'furniture';
  regionsOpen = false;

  choice(entity: { uid: number }, actions: readonly ItemAction[]): ItemAction | undefined {
    return this.isOpen(entity) && this.armed ? this.forItem(entity, actions) : undefined;
  }

  override step(entity: { uid: number }, actions: readonly ItemAction[], direction: number): boolean {
    if (!this.isOpen(entity) || direction === 0 || actions.length === 0) {
      return false;
    }
    super.step(entity, actions, direction);
    this.armed = true;
    return true;
  }

  get openedUid(): number | undefined {
    return this.uid;
  }

  point(
    entity: { uid: number },
    actions: readonly RadialAction[],
    movement: { x: number; y: number },
    tuning: { radiusPixels: number; deadZonePixels: number; entryCap: number },
  ): void {
    this.x += movement.x;
    this.y += movement.y;
    const length = Math.hypot(this.x, this.y);
    if (length > tuning.radiusPixels) {
      this.x *= tuning.radiusPixels / length;
      this.y *= tuning.radiusPixels / length;
    }
    const index = radialEntryIndex(this.x, this.y, actions, tuning.deadZonePixels);
    this.armed = index !== undefined;
    if (index !== undefined) {
      this.selected.set(entity.uid, actions[index]!.id);
    }
  }

  open(entity: { uid: number }, actions: readonly ItemAction[], source: 'furniture' | 'held' = 'furniture'): void {
    this.source = source;
    this.regionsOpen = false;
    this.uid = entity.uid;
    this.x = 0;
    this.y = 0;
    this.armed = false;
    this.forItem(entity, actions);
  }

  showRegions(): void {
    this.regionsOpen = true;
    this.armed = false;
  }

  isOpen(entity: { uid: number }): boolean {
    return this.uid === entity.uid;
  }

  sync(targetUid: number | undefined, paused = false): void {
    if (paused || targetUid !== this.uid) {
      this.uid = undefined;
      this.regionsOpen = false;
    }
  }

  confirm(entity: { uid: number }, actions: readonly ItemAction[]): ItemAction | undefined {
    const action = this.choice(entity, actions);
    this.uid = undefined;
    return action;
  }
}
