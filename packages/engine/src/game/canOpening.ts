import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';

export const unpackingTool = (inventory: Inventory, target: Item): Item | undefined => {
  const at = inventory.locate(target);
  if (at?.kind !== 'hand') {
    return undefined;
  }
  const tool = inventory.hands[at.side === 'right' ? 'left' : 'right'];
  const qualities = defOf(inventory.registry, target.type).unpack?.qualities;
  return tool &&
    qualities &&
    Object.entries(qualities).every(
      ([quality, level]) => (defOf(inventory.registry, tool.type).tool?.qualities[quality] ?? 0) >= level,
    )
    ? tool
    : undefined;
};

export const openingTargetForHand = (inventory: Inventory, hand: HandSide): Item | undefined => {
  const tool = inventory.hands[hand];
  const target = inventory.hands[hand === 'right' ? 'left' : 'right'];
  if (!(tool && target && defOf(inventory.registry, target.type).unpack?.qualities?.opening)) {
    return undefined;
  }
  return unpackingTool(inventory, target) === tool ? target : undefined;
};
