import { dominantSide } from '../core/character.ts';
import type { Registry } from '../core/content.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { magazineSpec } from '../core/magazine.ts';
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
        inventory.add(inventory.create('pump_shotgun'), { kind: 'hand', side: dominantSide(inventory.character) }) &&
        inventory.add(box, { kind: 'pocket', owner: backpack, pocket: 0 })
      )
    ) {
      throw new Error('Could not equip pump preview loadout');
    }
    return true;
  }
  equipRifles(inventory, backpack, choice);
  return true;
};

/**
 * The chosen rifle in hand with a full magazine fitted and an empty chamber, to charge first; the other rifle,
 * a spare full magazine to change to, and a box of the held rifle's cartridges for loading packed.
 */
const equipRifles = (inventory: Inventory, backpack: Item, choice: 'ar' | 'ak'): void => {
  const rifles = { ar: 'rifle_assault', ak: 'rifle_ak' } as const;
  const ammunition = {
    ar: { magazine: 'magazine_stanag_30', cartridge: 'cartridge_5_d_56x45', box: 'cartridge_box_5_d_56x45' },
    ak: { magazine: 'magazine_akm_30', cartridge: 'cartridge_7_d_62x39', box: 'cartridge_box_7_d_62x39' },
  } as const;
  const { magazine, cartridge, box } = ammunition[choice];
  const full = (): Item => {
    const loaded = inventory.create(magazine);
    loaded.cartridges = Array.from({ length: magazineSpec(inventory.registry, magazine)!.capacity }, () => cartridge);
    return loaded;
  };
  const rifle = inventory.create(rifles[choice]);
  inventory.fitSlot(rifle, 'magazine', full());
  const pocket = { kind: 'pocket', owner: backpack, pocket: 0 } as const;
  const packed = [inventory.create(rifles[choice === 'ar' ? 'ak' : 'ar']), full(), inventory.create(box)];
  if (
    !(
      inventory.add(rifle, { kind: 'hand', side: dominantSide(inventory.character) }) &&
      packed.every((item) => inventory.add(item, pocket))
    )
  ) {
    throw new Error('Could not equip firearm preview loadout');
  }
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
