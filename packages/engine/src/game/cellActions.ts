import { claimed } from '../core/capabilities.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import { repairCeiling } from '../core/items.ts';
import type { ItemAction } from './itemActions.ts';

export const cellActionsFor = (inventory: Inventory, cell: Vec3, knownRecipes: ReadonlySet<string>): ItemAction[] => {
  const { registry } = inventory;
  const text = claimed(registry.ui, 'interface')!.screenText.worldService;
  if (inventory.rubble?.standing(cell)) {
    return [{ id: 'take_apart', label: text.takeApart }];
  }
  const state = inventory.cellRepair?.state(cell);
  return state &&
    [...knownRecipes].some((id) => {
      const recipe = registry.recipes.get(id);
      return (
        recipe?.repair?.block === state.block && 1 - state.damage / state.durability < repairCeiling(registry, recipe)
      );
    })
    ? [{ id: 'repair', label: text.repair }]
    : [];
};
