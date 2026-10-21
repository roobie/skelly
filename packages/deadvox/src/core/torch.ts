import type { Inventory, Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { chargeOf } from './lights.ts';

/** Whether a canister fits a fuelled tool. */
export const fitsFuelledTool = (inventory: Inventory, tool: Item, canister: Item): boolean =>
  defOf(inventory.registry, tool.type).tool?.fuel?.canister === canister.type;

/**
 * Puts one of `canister` into `tool`, in place. The old canister comes out to `spent` whatever
 * its fill, since an empty one can be refilled later. Returns why it couldn't, or undefined.
 */
export const swapCanister = (
  inventory: Inventory,
  tool: Item,
  canister: Item,
  spent: (item: Item) => Target,
): string | undefined => {
  if (!fitsFuelledTool(inventory, tool, canister)) {
    return "It doesn't take that cartridge";
  }
  const replacement = canister.count > 1 ? inventory.create(canister.type, 1, canister.condition) : canister;
  if (canister.charges !== undefined) {
    replacement.charges = canister.charges;
  }
  if (!inventory.consume(canister)) {
    return 'The cartridge is gone';
  }
  const old = inventory.fitSlot(tool, 'canister', replacement);
  if (old) {
    old.charges = chargeOf(inventory.registry, old) ?? 0;
    inventory.add(old, spent(old));
  }
  return undefined;
};

/** Takes `amount` of fill from the tool's canister; the caller has already checked the fill covers it. */
export const spendFuel = (inventory: Inventory, tool: Item, amount: number): void => {
  const canister = tool.slots?.canister;
  const fill = chargeOf(inventory.registry, tool) ?? 0;
  if (!canister || fill < amount) {
    throw new Error('The canister cannot cover this spend');
  }
  canister.charges = fill - amount;
};
