import type { Registry } from '../core/content.ts';
import type { Inventory } from '../core/inventory.ts';
import type { ItemDef } from '../core/schema.ts';

export type IncludeDebugWeapon = (item: ItemDef) => boolean;

/** Explicit fresh-game firearm preview, never a replacement for restored hands. */
export const equipDebugFirearms = (
  inventory: Inventory,
  debugMode: boolean,
  newGame: boolean,
  search: string,
): boolean => {
  const choice = new URLSearchParams(search).get('loadout');
  if (
    !((choice === 'ar' || choice === 'ak' || choice === 'pump') && debugMode && newGame) ||
    inventory.hands.left ||
    inventory.hands.right
  ) {
    return false;
  }
  const backpack = inventory.worn.back ?? inventory.create('hiking_backpack');
  if (!(inventory.worn.back || inventory.add(backpack, { kind: 'worn' }))) {
    throw new Error('Could not equip firearm preview backpack');
  }
  if (choice === 'pump') {
    const box = inventory.create('shotshell_box');
    if (
      !(
        inventory.add(inventory.create('pump_shotgun'), { kind: 'hand', side: 'right' }) &&
        inventory.add(box, { kind: 'pocket', owner: backpack, pocket: 0 })
      )
    ) {
      throw new Error('Could not equip pump preview loadout');
    }
    return true;
  }
  const held = choice === 'ar' ? 'debug_rifle_assault' : 'debug_rifle_ak';
  const other = choice === 'ar' ? 'debug_rifle_ak' : 'debug_rifle_assault';
  if (
    !(
      inventory.add(inventory.create(held), { kind: 'hand', side: 'right' }) &&
      inventory.add(inventory.create(other), { kind: 'pocket', owner: backpack, pocket: 0 })
    )
  ) {
    throw new Error('Could not equip firearm preview loadout');
  }
  return true;
};

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
