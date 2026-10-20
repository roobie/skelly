// A rifle readied the way a player does it: cartridges loaded into a magazine one by one, the magazine fitted
// with hold R, the charging handle worked with a double press. Tests that need a chambered rifle start here.
import { dominantSide } from '../src/core/character.ts';
import type { Registry } from '../src/core/content.ts';
import type { HandlingQueue } from '../src/core/handling.ts';
import type { HandSide, Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { magazineSpec, magazineWellCalibre } from '../src/core/magazine.ts';
import type { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { MagazineHandling } from '../src/game/magazineHandling.ts';

export interface ChargedRifle {
  readonly rifle: Item;
  readonly magazine: Item;
  readonly bag: Item;
  readonly magazines: MagazineHandling;
}

const must = (refusal: string | undefined): void => {
  if (refusal) {
    throw new Error(refusal);
  }
};

/**
 * Runs the queue's jobs to completion on simulation time, one `step` at a time (a queue tick unless the caller
 * frames a whole session); a wedged queue fails instead of hanging the worker.
 */
export const settle = (queue: HandlingQueue, step: () => void = () => queue.tick(0.05)): void => {
  for (let steps = 0; queue.busy; steps += 1) {
    if (steps > 600) {
      throw new Error('Handling did not finish');
    }
    step();
  }
};

/** The first magazine and cartridge types, by id, that fit the rifle's calibre. */
export const rifleAmmunition = (registry: Registry, type: string): { magazine: string; cartridge: string } => {
  const calibre = magazineWellCalibre(registry, type);
  const ids = [...registry.items.keys()].sort();
  const magazine = ids.find((id) => calibre !== undefined && magazineSpec(registry, id)?.calibre === calibre);
  const cartridge = ids.find((id) => calibre !== undefined && registry.items.get(id)?.ammo?.calibre === calibre);
  if (!(magazine && cartridge)) {
    throw new Error(`No magazine and cartridge fit ${type}`);
  }
  return { magazine, cartridge };
};

interface RifleOptions {
  type?: string;
  rounds?: number;
  side?: HandSide;
  magazines?: MagazineHandling;
}

/**
 * Holds an empty rifle on an otherwise empty-handed character, with a magazine loaded with `rounds` cartridges in
 * a worn bag. Without `magazines` it registers the magazine actions on `queue`, so call it once per queue.
 */
export const rifleInHand = (
  inventory: Inventory,
  queue: HandlingQueue,
  {
    type = 'rifle_assault',
    rounds = 3,
    side = dominantSide(inventory.character),
    magazines = new MagazineHandling(inventory, queue, { feet: () => [0, 1, 0], reloadFactor: () => 1 }),
  }: RifleOptions = {},
): ChargedRifle => {
  const { magazine: magazineType, cartridge } = rifleAmmunition(inventory.registry, type);
  const hand = { kind: 'hand', side } as const;
  const bag = inventory.create('hiking_backpack');
  const magazine = inventory.create(magazineType);
  const rifle = inventory.create(type);
  const pocket = { kind: 'pocket', owner: bag, pocket: 0 } as const;
  if (
    !(
      inventory.add(bag, { kind: 'worn' }) &&
      inventory.add(inventory.create(cartridge, rounds), pocket) &&
      inventory.add(magazine, hand)
    )
  ) {
    throw new Error('Rifle fixture does not fit');
  }
  for (let round = 0; round < rounds; round++) {
    must(magazines.loadNext(magazine.uid, 0));
    settle(queue);
  }
  if (!(inventory.move(magazine, pocket).ok && inventory.add(rifle, hand))) {
    throw new Error('Rifle fixture cannot swap the magazine for the rifle');
  }
  return { rifle, magazine, bag, magazines };
};

/** `rifleInHand`, then the magazine fitted with R and the charging handle worked. */
export const chargedRifle = (
  inventory: Inventory,
  queue: HandlingQueue,
  mechanics: FirearmMechanics,
  options: RifleOptions = {},
): ChargedRifle => {
  const held = rifleInHand(inventory, queue, options);
  must(mechanics.loadNext(held.rifle.uid, 0));
  settle(queue);
  must(mechanics.cock(held.rifle.uid, 0));
  settle(queue);
  return held;
};
