import { coreMessage } from './coreText.ts';
import type { Inventory, Target } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { putDownRefusal } from './itemThrow.ts';
import { chargeOf } from './lights.ts';

/** Whether a canister fits a fuelled tool. */
export const fitsFuelledTool = (inventory: Inventory, tool: Item, canister: Item): boolean =>
  defOf(inventory.registry, tool.type).tool?.fuel?.canister === canister.type;

/** Plans where the old cartridge lands; a refusal leaves its fill as it was. */
const planOldLanding = (
  inventory: Inventory,
  old: Item,
  spent: (item: Item) => Target | undefined,
): { target: Target | undefined; refusal: string | undefined } => {
  const before = old.charges;
  // Written before planning because the fill decides whether the old cartridge can merge where it lands.
  old.charges = chargeOf(inventory.registry, old) ?? 0;
  const target = spent(old);
  const refusal = putDownRefusal(inventory, old, target);
  if (refusal) {
    if (before === undefined) {
      Reflect.deleteProperty(old, 'charges');
    } else {
      old.charges = before;
    }
  }
  return { target, refusal };
};

/**
 * Puts one of `canister` into `tool`, in place. The old canister comes out to `spent` whatever
 * its fill, since an empty one can be refilled later. Returns why it couldn't, or undefined;
 * a refused swap changes nothing.
 */
export const swapCanister = (
  inventory: Inventory,
  tool: Item,
  canister: Item,
  spent: (item: Item) => Target | undefined,
): string | undefined => {
  if (!fitsFuelledTool(inventory, tool, canister)) {
    return coreMessage(inventory.registry, 'wrongCartridge');
  }
  const old = tool.slots?.canister;
  const landing = old && planOldLanding(inventory, old, spent);
  if (landing?.refusal) {
    return landing.refusal;
  }
  const target = landing?.target;
  const replacement = canister.count > 1 ? inventory.create(canister.type, 1, canister.condition) : canister;
  if (canister.charges !== undefined) {
    replacement.charges = canister.charges;
  }
  if (!inventory.consume(canister)) {
    return coreMessage(inventory.registry, 'cartridgeGone');
  }
  inventory.fitSlot(tool, 'canister', replacement);
  if (old && target) {
    inventory.add(old, target);
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
