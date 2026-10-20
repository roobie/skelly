import { dominantSide } from '../core/character.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { magazineSpec } from '../core/magazine.ts';

const LOADOUTS = ['ar', 'ak', 'pump', 'magazine', 'grenade', 'revolver', 'revolver-open'] as const;
type LoadoutChoice = (typeof LOADOUTS)[number];
const isLoadoutChoice = (choice: string | null): choice is LoadoutChoice =>
  (LOADOUTS as readonly (string | null)[]).includes(choice);

/** The back's hiking backpack, worn first when the back is empty. */
const wornBackpack = (inventory: Inventory): Item | undefined => {
  if (inventory.worn.back) {
    return inventory.worn.back;
  }
  const backpack = inventory.create('hiking_backpack');
  return inventory.add(backpack, { kind: 'worn' }) ? backpack : undefined;
};

/** A fresh debug game wears an empty hiking backpack and is given nothing else. */
export const equipDebugBackpack = (inventory: Inventory, debugMode: boolean, newGame: boolean): void => {
  if (debugMode && newGame) {
    wornBackpack(inventory);
  }
};

/** Explicit fresh-game `loadout` preview, never a replacement for restored hands. */
export const equipDebugLoadout = (
  inventory: Inventory,
  debugMode: boolean,
  newGame: boolean,
  search: string,
): boolean => {
  const choice = new URLSearchParams(search).get('loadout');
  if (!(isLoadoutChoice(choice) && debugMode && newGame) || inventory.hands.left || inventory.hands.right) {
    return false;
  }
  const backpack = wornBackpack(inventory);
  if (!backpack) {
    throw new Error('Could not equip preview backpack');
  }
  if (choice === 'revolver' || choice === 'revolver-open') {
    equipRevolver(inventory, backpack, choice === 'revolver-open');
  } else if (choice === 'pump') {
    equipPump(inventory, backpack);
  } else if (choice === 'magazine') {
    equipEmptyMagazine(inventory, backpack);
  } else if (choice === 'grenade') {
    equipGrenades(inventory, backpack);
  } else {
    equipRifles(inventory, backpack, choice);
  }
  return true;
};

const equipRevolver = (inventory: Inventory, backpack: Item, open: boolean): void => {
  const definition = [...inventory.registry.items.values()].find((item) => item.firearm?.revolver);
  const model = definition?.model ? inventory.registry.models.get(definition.model) : undefined;
  const ammo = [...inventory.registry.items.values()].find((item) => item.ammo?.calibre === model?.calibre);
  if (!(definition && model?.revolver && ammo)) {
    throw new Error('No revolver preview content');
  }
  const gun = inventory.create(definition.id);
  const cylinder = gun.firearm!.cylinder!;
  cylinder.open = open;
  const loaded = open ? Math.ceil(cylinder.chambers.length / 2) : cylinder.chambers.length;
  for (let index = 0; index < loaded; index++) {
    cylinder.chambers[(cylinder.aligned + 1 + index) % cylinder.chambers.length] = {
      state: 'round',
      roundType: ammo.id,
    };
  }
  if (
    !(
      inventory.add(gun, { kind: 'hand', side: dominantSide(inventory.character) }) &&
      inventory.add(inventory.create(ammo.id, ammo.stack ?? 1), { kind: 'pocket', owner: backpack, pocket: 0 })
    )
  ) {
    throw new Error('Could not equip revolver preview loadout');
  }
};

/** A grenade in the dominant hand to throw now and a couple packed to follow it. */
const equipGrenades = (inventory: Inventory, backpack: Item): void => {
  const pocket = { kind: 'pocket', owner: backpack, pocket: 0 } as const;
  if (
    !(
      inventory.add(inventory.create('frag_grenade'), {
        kind: 'hand',
        side: dominantSide(inventory.character),
      }) &&
      inventory.add(inventory.create('frag_grenade'), pocket) &&
      inventory.add(inventory.create('frag_grenade'), pocket)
    )
  ) {
    throw new Error('Could not equip grenade preview loadout');
  }
};

/** An empty STANAG magazine in hand and loose rounds of its calibre packed, to load round by round with R. */
const equipEmptyMagazine = (inventory: Inventory, backpack: Item): void => {
  const pocket = { kind: 'pocket', owner: backpack, pocket: 0 } as const;
  const round = 'cartridge_5_d_56x45';
  const stack = inventory.registry.items.get(round)?.stack ?? 1;
  if (
    !(
      inventory.add(inventory.create('magazine_stanag_30'), {
        kind: 'hand',
        side: dominantSide(inventory.character),
      }) &&
      inventory.add(inventory.create(round, stack), pocket) &&
      inventory.add(inventory.create(round, stack), pocket)
    )
  ) {
    throw new Error('Could not equip magazine preview loadout');
  }
};

/** The empty pump in hand; a sealed shell box and a stack of loose shells of the kind it holds packed, to load now. */
const equipPump = (inventory: Inventory, backpack: Item): void => {
  const box = inventory.create('shotshell_box');
  const shell = defOf(inventory.registry, box.type).unpack!.item;
  const pocket = { kind: 'pocket', owner: backpack, pocket: 0 } as const;
  if (
    !(
      inventory.add(inventory.create('pump_shotgun'), {
        kind: 'hand',
        side: dominantSide(inventory.character),
      }) &&
      inventory.add(box, pocket) &&
      inventory.add(inventory.create(shell, 20), pocket)
    )
  ) {
    throw new Error('Could not equip pump preview loadout');
  }
};

/**
 * The chosen rifle in hand with a full magazine fitted and an empty chamber, to charge first; a spare full magazine
 * to change to and a box of the held rifle's cartridges for loading packed.
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
  const packed = [full(), inventory.create(box)];
  if (
    !(
      inventory.add(rifle, { kind: 'hand', side: dominantSide(inventory.character) }) &&
      packed.every((item) => inventory.add(item, pocket))
    )
  ) {
    throw new Error('Could not equip firearm preview loadout');
  }
};
