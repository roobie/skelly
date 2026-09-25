// What the player starts with: jeans and a hoodie, and a little in their pockets.
// Everything else is in the hamlet's furniture.

import type { Inventory } from '../core/inventory.ts';

export const startingLoadout = (inv: Inventory): void => {
  const jeans = inv.create('jeans', 1, 0.7);
  const hoodie = inv.create('hoodie', 1, 0.8);
  inv.add(jeans, { kind: 'worn' });
  inv.add(hoodie, { kind: 'worn' });
  inv.add(inv.create('canned_beans'), { kind: 'pocket', owner: hoodie, pocket: 0 });
  inv.add(inv.create('matches'), { kind: 'pocket', owner: hoodie, pocket: 0 });
  inv.add(inv.create('bandage', 2), { kind: 'pocket', owner: jeans, pocket: 2 });
};
