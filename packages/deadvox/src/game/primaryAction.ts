// Item-driven hand-action dispatch (issue #27, BR ruling). Keep capability selection
// pure so hand bindings, unsupported items, and empty-hand fists are testable without the game loop.

import { dominantSide, offSide } from '../core/character.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { magazineSpec } from '../core/magazine.ts';
import { isReadableItem } from '../core/options.ts';
import type { PlayerCombat } from '../core/playerCombat.ts';
import type { ItemDef } from '../core/schema.ts';
import { openingTargetForHand } from './canOpening.ts';
import { type MeleeReadinessInput, shouldEnterMeleeReady } from './melee.ts';

type PrimaryItemAction =
  | 'melee'
  | 'light'
  | 'ignite'
  | 'firearm'
  | 'key'
  | 'bar'
  | 'unpack'
  | 'open-can'
  | 'sharpen'
  | 'continue-work'
  | 'pin'
  | 'read'
  | 'use'
  | 'magazine'
  | 'none';

export type PrimaryActionSelection =
  | {
      kind:
        | 'melee'
        | 'light'
        | 'ignite'
        | 'firearm'
        | 'key'
        | 'bar'
        | 'unpack'
        | 'open-can'
        | 'sharpen'
        | 'continue-work'
        | 'pin'
        | 'read'
        | 'use'
        | 'magazine';
      hand: HandSide;
      item: Item;
    }
  | { kind: 'fists'; hand?: HandSide }
  | { kind: 'none'; item: Item }
  | { kind: 'noop' };

export const repeatSingleAction = (
  definition: Pick<ItemDef, 'holdRepeat'>,
  action: Pick<PrimaryActionSelection, 'kind'>,
  combat: Pick<PlayerCombat, 'activeMeleeAction'>,
  dispatch: () => void,
): void => {
  if (definition.holdRepeat === false || (action.kind === 'melee' && combat.activeMeleeAction)) {
    return;
  }
  dispatch();
};

export interface PrimaryMeleeDispatch {
  readonly kind: 'swing';
  readonly hand?: HandSide;
}

/** The selected primary action dispatches a swing only from en-garde. */
export const primaryMeleeAction = (
  action: PrimaryActionSelection,
  readiness: MeleeReadinessInput,
): PrimaryMeleeDispatch | undefined =>
  (action.kind === 'melee' || action.kind === 'fists') && shouldEnterMeleeReady(readiness)
    ? { kind: 'swing', ...(action.hand === undefined ? {} : { hand: action.hand }) }
    : undefined;

interface CapabilityDispatch {
  readonly kind: Exclude<PrimaryItemAction, 'none'>;
  readonly supports: (definition: ItemDef) => boolean;
}

/** Add a new action capability here when its item data enters the content schema. */
const CAPABILITY_DISPATCH: readonly CapabilityDispatch[] = [
  { kind: 'melee', supports: (definition) => definition.weapon?.melee !== undefined },
  { kind: 'sharpen', supports: (definition) => definition.tool?.qualities.sharpening !== undefined },
  { kind: 'ignite', supports: (definition) => definition.igniter !== undefined },
  { kind: 'light', supports: (definition) => definition.light !== undefined },
  { kind: 'firearm', supports: (definition) => definition.firearm !== undefined },
  { kind: 'key', supports: (definition) => definition.key !== undefined },
  { kind: 'bar', supports: (definition) => definition.doorBar !== undefined },
  { kind: 'unpack', supports: (definition) => definition.unpack !== undefined },
  { kind: 'pin', supports: (definition) => definition.explosive !== undefined },
  { kind: 'read', supports: isReadableItem },
  {
    kind: 'use',
    supports: (definition) =>
      definition.serving !== undefined ||
      definition.food !== undefined ||
      definition.analgesic !== undefined ||
      definition.category === 'medical' ||
      definition.treatment !== undefined ||
      definition.battery !== undefined,
  },
];

const primaryActionForDefinition = (definition: ItemDef): PrimaryItemAction =>
  CAPABILITY_DISPATCH.find(({ supports }) => supports(definition))?.kind ?? 'none';

export const ignitionTargetForHand = (inventory: Inventory, hand: HandSide): Item | undefined => {
  const otherHand: HandSide = hand === 'right' ? 'left' : 'right';
  const target = inventory.hands[otherHand];
  if (!target || target.on) {
    return undefined;
  }
  return defOf(inventory.registry, target.type).light?.burning?.ignition === 'firestarter' ? target : undefined;
};

const pairedAction = (
  own: PrimaryItemAction,
  inventory: Inventory,
  hand: HandSide,
  selectedAction?: string,
): PrimaryItemAction => {
  if (selectedAction === 'sharpen') {
    return 'sharpen';
  }
  if (selectedAction === 'continue-work') {
    return 'continue-work';
  }
  return selectedAction === 'open-can' || (own === 'none' && openingTargetForHand(inventory, hand)) ? 'open-can' : own;
};

/** Empty dominant fists alternate only with both hands free; a reserved support slot never punches. */
export const selectPrimaryAction = (
  inventory: Inventory,
  hand: HandSide = dominantSide(inventory.character),
  selectedAction?: string,
): PrimaryActionSelection => {
  const { registry, hands, character } = inventory;
  const item = hands[hand];
  if (!item) {
    if (hand !== dominantSide(character)) {
      return { kind: 'noop' };
    }
    const otherHeld = hands[offSide(character)];
    if (otherHeld && defOf(registry, otherHeld.type).twoHanded) {
      return { kind: 'noop' };
    }
    return otherHeld ? { kind: 'fists', hand } : { kind: 'fists' };
  }

  const definition = defOf(registry, item.type);
  // A magazine's capacity lives in its model, so its item actions are found through the registry.
  const own = magazineSpec(registry, item.type) ? 'magazine' : primaryActionForDefinition(definition);
  const kind = pairedAction(own, inventory, hand, selectedAction);
  if (kind === 'melee' && item.condition <= 0) {
    return { kind: 'none', item };
  }
  return kind === 'none' ? { kind: 'none', item } : { kind, hand, item };
};
