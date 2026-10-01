import type { Registry } from '../core/content.ts';
import type { Inventory } from '../core/inventory.ts';
import type { ItemDef } from '../core/schema.ts';

export type IncludeDebugWeapon = (item: ItemDef) => boolean;

/** Selects the melee tools at runtime; a future caller can include ranged weapons with another predicate. */
export const debugWeaponIds = (
  registry: Registry,
  include: IncludeDebugWeapon = (item) => item.weapon?.melee !== undefined,
): string[] =>
  [...registry.items.values()]
    .filter(include)
    .map(({ id }) => id)
    .sort((a, b) => a.localeCompare(b));

/** A fresh debug game gets an equipped backpack containing every selected weapon. */
export const equipDebugStartWeapons = ({
  inventory,
  debugMode,
  newGame,
  include,
}: {
  inventory: Inventory;
  debugMode: boolean;
  newGame: boolean;
  include?: IncludeDebugWeapon;
}): void => {
  if (!(debugMode && newGame) || inventory.worn.back) {
    return;
  }
  const backpack = inventory.create('hiking_backpack');
  if (!inventory.add(backpack, { kind: 'worn' })) {
    return;
  }
  for (const id of debugWeaponIds(inventory.registry, include)) {
    if (!inventory.add(inventory.create(id), { kind: 'pocket', owner: backpack, pocket: 0 })) {
      throw new Error(`Debug backpack cannot fit ${id}`);
    }
  }
};
