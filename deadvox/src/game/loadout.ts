// What the player starts with, and a pile of things to try the inventory on until
// the hamlet's furniture has loot (milestone 1.5).

import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';

export const startingLoadout = (inv: Inventory, pileAt: Vec3): void => {
  const jeans = inv.create('jeans', 1, 0.7);
  const hoodie = inv.create('hoodie', 1, 0.8);
  inv.add(jeans, { kind: 'worn' });
  inv.add(hoodie, { kind: 'worn' });
  inv.add(inv.create('canned_beans'), { kind: 'pocket', owner: hoodie, pocket: 0 });
  inv.add(inv.create('matches'), { kind: 'pocket', owner: hoodie, pocket: 0 });
  inv.add(inv.create('bandage', 2), { kind: 'pocket', owner: jeans, pocket: 2 });

  const floor = [
    inv.create('school_backpack', 1, 0.75),
    inv.create('crowbar', 1, 0.85),
    inv.create('jacket', 1, 0.6),
    inv.create('water_bottle'),
    inv.create('flashlight', 1, 0.9),
    inv.create('aa_battery', 4),
    inv.create('canned_soup'),
    inv.create('crackers'),
    inv.create('kitchen_knife', 1, 0.7),
    inv.create('baseball_bat', 1, 0.5),
  ];
  // Anything that doesn't fit on one block of floor goes on the next one.
  for (const item of floor) {
    for (let dx = 0; dx < 4; dx++) {
      if (inv.add(item, { kind: 'pile', pos: [pileAt[0] + dx, pileAt[1], pileAt[2]] })) {
        break;
      }
    }
  }
};
