// Item-driven left-click dispatch (issue #27, BR ruling). Keep capability selection
// pure so two-hand precedence and unsupported items can be tested without the game loop.

import type { Registry } from '../core/content.ts';
import type { HandSide } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { ItemDef } from '../core/schema.ts';

export type PrimaryItemAction = 'melee' | 'light' | 'firearm' | 'none';

export type PrimaryActionSelection =
  | { kind: 'melee' | 'light' | 'firearm'; hand: HandSide; item: Item }
  | { kind: 'fists' }
  | { kind: 'none'; item: Item };

interface CapabilityDispatch {
  readonly kind: Exclude<PrimaryItemAction, 'none'>;
  readonly supports: (definition: ItemDef) => boolean;
}

const CAPABILITY_DISPATCH: readonly CapabilityDispatch[] = [
  { kind: 'melee', supports: (definition) => definition.weapon?.melee !== undefined },
  { kind: 'light', supports: (definition) => definition.light !== undefined },
  // Add the firearm capability predicate here once ranged weapons enter ItemDef/content.
];

export const primaryActionForDefinition = (definition: ItemDef): PrimaryItemAction =>
  CAPABILITY_DISPATCH.find(({ supports }) => supports(definition))?.kind ?? 'none';

/** Right hand wins when actionable; otherwise try left. Fists are only the empty-hands fallback. */
export const selectPrimaryAction = (
  registry: Registry,
  hands: Readonly<{ right?: Item; left?: Item }>,
): PrimaryActionSelection => {
  for (const hand of ['right', 'left'] as const) {
    const item = hands[hand];
    if (!item) {
      continue;
    }
    const kind = primaryActionForDefinition(defOf(registry, item.type));
    if (kind !== 'none') {
      return { kind, hand, item };
    }
  }
  const heldItem = hands.right ?? hands.left;
  return heldItem ? { kind: 'none', item: heldItem } : { kind: 'fists' };
};

export const primaryActionHint = (registry: Registry, item: Item): string =>
  `Nothing to do with ${defOf(registry, item.type).name.toLowerCase()}`;
