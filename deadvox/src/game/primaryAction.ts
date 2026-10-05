// Item-driven hand-action dispatch (issue #27, BR ruling). Keep capability selection
// pure so hand bindings, unsupported items, and empty-hand fists are testable without the game loop.

import type { Registry } from '../core/content.ts';
import type { HandSide } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { ItemDef } from '../core/schema.ts';

export type PrimaryItemAction = 'melee' | 'light' | 'firearm' | 'key' | 'unpack' | 'none';

export const ACTION_HAND_BINDINGS = {
  primaryClick: 'right',
  leftHandKey: 'left',
} as const satisfies Readonly<Record<'primaryClick' | 'leftHandKey', HandSide>>;

export type PrimaryActionSelection =
  | { kind: 'melee' | 'light' | 'firearm' | 'key' | 'unpack'; hand: HandSide; item: Item }
  | { kind: 'fists'; hand?: HandSide }
  | { kind: 'none'; item: Item }
  | { kind: 'noop' };

interface CapabilityDispatch {
  readonly kind: Exclude<PrimaryItemAction, 'none'>;
  readonly supports: (definition: ItemDef) => boolean;
}

/** Add a new action capability here when its item data enters the content schema. */
const CAPABILITY_DISPATCH: readonly CapabilityDispatch[] = [
  { kind: 'melee', supports: (definition) => definition.weapon?.melee !== undefined },
  { kind: 'light', supports: (definition) => definition.light !== undefined },
  { kind: 'firearm', supports: (definition) => definition.firearm !== undefined },
  { kind: 'key', supports: (definition) => definition.key !== undefined },
  { kind: 'unpack', supports: (definition) => definition.unpack !== undefined },
];

export const primaryActionForDefinition = (definition: ItemDef): PrimaryItemAction =>
  CAPABILITY_DISPATCH.find(({ supports }) => supports(definition))?.kind ?? 'none';

/** Left-click is right-hand-only; `=` is left-hand-only. Empty right fists alternate only when both hands are free. */
export const selectPrimaryAction = (
  registry: Registry,
  hands: Readonly<{ right?: Item; left?: Item }>,
  hand: HandSide = ACTION_HAND_BINDINGS.primaryClick,
): PrimaryActionSelection => {
  const item = hands[hand];
  if (!item) {
    if (hand === 'left') {
      return { kind: 'noop' };
    }
    return hands.left ? { kind: 'fists', hand: 'right' } : { kind: 'fists' };
  }

  const definition = defOf(registry, item.type);
  const kind = primaryActionForDefinition(definition);
  if (kind === 'melee' && item.condition <= 0) {
    return { kind: 'none', item };
  }
  return kind === 'none' ? { kind: 'none', item } : { kind, hand, item };
};
