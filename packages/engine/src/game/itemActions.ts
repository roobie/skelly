import { type ActionText, actionText } from '../core/actionText.ts';
import type { Body } from '../core/body.ts';
import { BODY_REGIONS, type BodyRegion, bodyRegionLabel } from '../core/body.ts';
import { coreLabel } from '../core/coreText.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { defOf } from '../core/items.ts';
import { canUnloadBattery, chargeOf, lightInHands } from '../core/lights.ts';
import { magazineSpec } from '../core/magazine.ts';
import type { TreatmentDef } from '../core/schema.ts';
import { openingTargetForHand } from './canOpening.ts';
import { selectPrimaryAction } from './primaryAction.ts';
import { sharpeningMethods, sharpeningTargetForHand } from './sharpening.ts';

export interface ItemAction {
  readonly id: string;
  readonly label: string;
  /** `bleeding` is the wound's bleeding severity, 0 when it doesn't bleed. */
  readonly priority?: Readonly<{ bleeding: number; damage: number }>;
  readonly treatment?: Readonly<{ region: BodyRegion; itemType: string }>;
  /** Unloading a held magazine: R only loads one (`packages/deadvox/CONTROLS.md`, "Reload, rack, remove"), so stripping is an item action. */
  readonly magazine?: 'strip';
  /** Taking a held light's battery out: a swap needs a spare, so this is the way to move a cell on its own. */
  readonly battery?: 'unload';
  readonly opening?: true;
  readonly sharpening?: true;
  /** Resuming a held, paused craft: the action menu is where a paused craft's status lives. */
  readonly continuing?: true;
  readonly workUid?: number;
}

/** What the treatment treats in the wound (`Body.canTreat`): its bleeding tier, else its infection stage. */
const woundDescription = (
  body: Body,
  region: BodyRegion,
  treatment: TreatmentDef,
  infection: ActionText['infection'],
): string => {
  const tier = treatment.bleeding === undefined ? undefined : body.bleedingTier(region);
  return tier?.label ?? infection[body.wounds[region]!.infection];
};

const withSharpeningActions = (
  item: Item,
  inventory: Inventory,
  base: readonly ItemAction[],
): readonly ItemAction[] => {
  const at = inventory.locate(item);
  const sharpeningTarget = at?.kind === 'hand' && sharpeningTargetForHand(inventory, at.side);
  if (at?.kind === 'hand' && (sharpeningTarget || sharpeningMethods(inventory, item).length > 0)) {
    const own = selectPrimaryAction(inventory, at.side);
    return [
      ...base,
      ...(base.length === 0 && own.kind !== 'sharpen'
        ? [{ id: 'own', label: own.kind === 'melee' ? 'Swing' : 'Use' }]
        : []),
      ...(sharpeningTarget ? [{ id: 'sharpen', label: 'Sharpen', sharpening: true as const }] : []),
    ];
  }
  return base;
};

export const itemActionsFor = (item: Item, inventory: Inventory, body: Body): readonly ItemAction[] => {
  const at = inventory.locate(item);
  const base = withSharpeningActions(item, inventory, ordinaryItemActions(item, inventory, body));
  if (at?.kind !== 'hand' || !defOf(inventory.registry, item.type).tool?.qualities.opening) {
    return base;
  }
  const labels = actionText(inventory.registry).itemActions;
  const target = openingTargetForHand(inventory, at.side);
  const own = selectPrimaryAction(inventory, at.side);
  let actions = base;
  if (base.length === 0 && own.kind !== 'open-can' && own.kind !== 'none') {
    actions = [{ id: 'own', label: own.kind === 'melee' ? labels.swing : labels.use }];
  }
  return target ? [...actions, { id: 'open-can', label: labels.openCan, opening: true }] : actions;
};

/** The light's own click first, so the default use switches it rather than taking the battery out. */
const lightActions = (item: Item, inventory: Inventory): readonly ItemAction[] => {
  const { registry } = inventory;
  let own: 'switchOff' | 'switchOn' | 'use' = 'use';
  if (item.on) {
    own = 'switchOff';
  } else if ((chargeOf(registry, item) ?? 0) > 0) {
    own = 'switchOn';
  }
  return [
    { id: 'own', label: coreLabel(registry, own) },
    { id: 'battery:unload', label: coreLabel(registry, 'batteryOut'), battery: 'unload' },
  ];
};

const ordinaryItemActions = (item: Item, inventory: Inventory, body: Body): readonly ItemAction[] => {
  if (magazineSpec(inventory.registry, item.type)) {
    const label = actionText(inventory.registry).itemActions.stripRound;
    return (item.cartridges?.length ?? 0) > 0 ? [{ id: 'magazine:strip', label, magazine: 'strip' }] : [];
  }
  if (canUnloadBattery(inventory.registry, item) && lightInHands(inventory, item)) {
    return lightActions(item, inventory);
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
    return [
      {
        id: `${item.type}:${region}`,
        label: `${bodyRegionLabel(region)} · ${woundDescription(body, region, treatment, actionText(inventory.registry).infection)}`,
        priority: { bleeding: wound.bleeding, damage: body.regionDamage[region] },
        treatment: { region, itemType: item.type },
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
      return actionPriority.bleeding > bestPriority.bleeding ? action : best;
    }
    return actionPriority.damage > bestPriority.damage ? action : best;
  }, undefined);

/**
 * The action an item's use runs: the one the player chose for that use, else the default. A choice lasts only for
 * the use it was made for, so a later ordinary use or quickbar press never runs an action the player cannot see.
 */
export class ItemActionSelection {
  private chosen: Readonly<{ uid: number; id: string }> | undefined;

  forItem(item: Pick<Item, 'uid'>, actions: readonly ItemAction[]): ItemAction | undefined {
    const { chosen } = this;
    const current = chosen?.uid === item.uid ? actions.find((action) => action.id === chosen.id) : undefined;
    return current ?? defaultItemAction(actions);
  }

  /** Runs `use` with `action` chosen for `item`. */
  choose<T>(item: Pick<Item, 'uid'>, action: ItemAction, use: () => T): T {
    this.chosen = { uid: item.uid, id: action.id };
    try {
      return use();
    } finally {
      this.chosen = undefined;
    }
  }
}
