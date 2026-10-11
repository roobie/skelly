import type { Body } from '../core/body.ts';
import { BODY_REGIONS, type BodyRegion, type BodyTreatment, type BodyWounds, bodyRegionLabel } from '../core/body.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { defOf } from '../core/items.ts';
import { magazineSpec } from '../core/magazine.ts';

export interface ItemAction {
  readonly id: string;
  readonly label: string;
  readonly priority?: Readonly<{ bleeding: boolean; damage: number }>;
  readonly treatment?: Readonly<{ region: BodyRegion; kind: BodyTreatment }>;
  /** Unloading a held magazine: R only loads one (CONTROLS.md, "Reload, rack, remove"), so stripping is an item action. */
  readonly magazine?: 'strip';
}

const STRIP_ROUND: ItemAction = { id: 'magazine:strip', label: 'Strip a round', magazine: 'strip' };

const woundDescription = (wound: NonNullable<BodyWounds[BodyRegion]>, treatment: BodyTreatment): string =>
  treatment === 'bandage' || treatment === 'rag' ? 'bleeding' : `${wound.infection} infection`;

export const itemActionsFor = (item: Item, inventory: Inventory, body: Body): readonly ItemAction[] => {
  if (magazineSpec(inventory.registry, item.type)) {
    return (item.cartridges?.length ?? 0) > 0 ? [STRIP_ROUND] : [];
  }
  const { treatment } = defOf(inventory.registry, item.type);
  if (!treatment) {
    return [];
  }
  return BODY_REGIONS.flatMap((region) => {
    if (!body.canTreat(region, treatment)) {
      return [];
    }
    const wound = body.wounds[region]!;
    const condition = woundDescription(wound, treatment);
    return [
      {
        id: `${treatment}:${region}`,
        label: `${bodyRegionLabel(region)} · ${condition}`,
        priority: { bleeding: wound.bleeding, damage: body.regionDamage[region] },
        treatment: { region, kind: treatment },
      },
    ];
  });
};

/** The settled selection policy stays here so other item actions can join the same path. */
export const defaultItemAction = (actions: readonly ItemAction[]): ItemAction | undefined =>
  actions.reduce<ItemAction | undefined>((best, action) => {
    if (!best) {
      return action;
    }
    const actionPriority = action.priority;
    const bestPriority = best.priority;
    if (!(actionPriority && bestPriority)) {
      return best;
    }
    if (actionPriority.bleeding !== bestPriority.bleeding) {
      return actionPriority.bleeding ? action : best;
    }
    return actionPriority.damage > bestPriority.damage ? action : best;
  }, undefined);

export class ItemActionSelection {
  private readonly selected = new Map<number, string>();

  forItem(item: Pick<Item, 'uid'>, actions: readonly ItemAction[]): ItemAction | undefined {
    if (actions.length === 0) {
      this.selected.delete(item.uid);
      return undefined;
    }
    const selectedId = this.selected.get(item.uid);
    const current = selectedId === undefined ? undefined : actions.find((action) => action.id === selectedId);
    if (current) {
      return current;
    }
    const fallback = defaultItemAction(actions);
    if (fallback) {
      this.selected.set(item.uid, fallback.id);
    }
    return fallback;
  }

  step(item: Pick<Item, 'uid'>, actions: readonly ItemAction[], direction: number): boolean {
    if (actions.length < 2 || direction === 0) {
      return false;
    }
    const current = this.forItem(item, actions)!;
    const index = actions.indexOf(current);
    const next = actions[(index + (direction > 0 ? 1 : -1) + actions.length) % actions.length]!;
    this.selected.set(item.uid, next.id);
    return true;
  }
}
