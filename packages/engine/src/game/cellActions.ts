import { claimed } from '../core/capabilities.ts';
import { type CutWorld, cellCutPlan } from '../core/cellCutting.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import { repairCeiling } from '../core/items.ts';
import type { ItemAction } from './itemActions.ts';

export const cellActionsFor = (
  inventory: Inventory,
  world: CutWorld,
  cell: Vec3,
  knownRecipes: ReadonlySet<string>,
): ItemAction[] => {
  const { registry } = inventory;
  const text = claimed(registry.ui, 'interface')!.screenText.worldService;
  if (inventory.rubble?.standing(cell)) {
    return [{ id: 'take_apart', label: text.takeApart }];
  }
  const actions: ItemAction[] = [];
  const state = inventory.cellRepair?.state(cell);
  if (
    state &&
    [...knownRecipes].some((id) => {
      const recipe = registry.recipes.get(id);
      return (
        recipe?.repair?.block === state.block && 1 - state.damage / state.durability < repairCeiling(registry, recipe)
      );
    })
  ) {
    actions.push({ id: 'repair', label: text.repair });
  }
  // A dry cutter still offers the cut, so choosing it says why it can't start.
  const cut = cellCutPlan(inventory, world, cell);
  if (cut.ok || cut.dry) {
    actions.push({ id: 'cut', label: text.cut });
  }
  return actions;
};
