// Item-driven hand-action dispatch (issue #27, BR ruling). Keep capability selection
// pure so hand bindings, unsupported items, and empty-hand fists are testable without the game loop.

import { dominantSide, offSide } from '../core/character.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { ItemDef } from '../core/schema.ts';

export type PrimaryItemAction = 'melee' | 'light' | 'firearm' | 'key' | 'unpack' | 'none';

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

/** Empty dominant fists alternate only with both hands free; a reserved support slot never punches. */
export const selectPrimaryAction = (
  inventory: Inventory,
  hand: HandSide = dominantSide(inventory.character),
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
  const kind = primaryActionForDefinition(definition);
  if (kind === 'melee' && item.condition <= 0) {
    return { kind: 'none', item };
  }
  return kind === 'none' ? { kind: 'none', item } : { kind, hand, item };
};
