// Bear traps (`SLICE-5.md`, "Settled bear-trap rules — issue #107"). A trap is an ordinary item: set, it lies
// in a ground pile with its state on the item, so the pile's save keeps it armed or shut, and recovering it moves
// that same item. It springs by mechanism on whatever stands in its cell; nothing about it is known to zombies.

import type { Vec3 } from './coords.ts';
import type { EntityId } from './entities.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { ItemDef } from './schema.ts';
import { inPlayerBlock } from './worldRegion.ts';

type TrapDef = NonNullable<ItemDef['trap']>;

export interface LyingTrap {
  readonly item: Item;
  /** The pile's cell, in blocks. */
  readonly pos: Readonly<Vec3>;
  readonly def: TrapDef;
}

export interface TrapContacts {
  /** The player's feet, in blocks. */
  player: Readonly<Vec3>;
  /** Zombies' feet, in blocks, in the store's order. */
  zombies: Iterable<readonly [EntityId, Readonly<Vec3>]>;
  blockSize: number;
  alive: (id: EntityId) => boolean;
  hurtPlayer: (injury: TrapDef['playerInjury']) => void;
  injureZombie: (id: EntityId, damage: number) => void;
}

/** A trap that sprung this step: on the player when `zombie` is absent. */
export interface Sprung {
  readonly item: Item;
  readonly pos: Readonly<Vec3>;
  readonly zombie?: EntityId;
}

/** The cell a body's feet stand in, as the player's drop cell is found. */
const cellOf = (pos: Readonly<Vec3>): Vec3 => [Math.floor(pos[0]), Math.floor(pos[1] + 0.01), Math.floor(pos[2])];

const sameCell = (a: Readonly<Vec3>, b: Readonly<Vec3>): boolean => a.every((value, axis) => value === b[axis]);

export class BearTraps {
  private readonly inventory: Pick<Inventory, 'piles' | 'registry'>;

  constructor(inventory: Pick<Inventory, 'piles' | 'registry'>) {
    this.inventory = inventory;
  }

  /** Every trap lying set or shut, in pile order. */
  *lying(): Generator<LyingTrap> {
    for (const pile of this.inventory.piles.values()) {
      for (const { item } of pile.items) {
        if (item.trap) {
          yield { item, pos: pile.pos, def: defOf(this.inventory.registry, item.type).trap! };
        }
      }
    }
  }

  /** Whether a shut trap holds the zombie with this id, or the player without one. */
  holds(zombie?: EntityId): boolean {
    for (const { item } of this.lying()) {
      if (item.trap?.state === 'holding' && item.trap.zombie === zombie) {
        return true;
      }
    }
    return false;
  }

  /**
   * Lets go of victims whose hold is over, then springs armed traps on whoever stands in their cell. Only traps
   * in the block around the player spring, and nothing here asks whether a column is loaded, so residency never
   * decides firing; beyond the block a trap stays armed, with no coarse encounter in its place.
   */
  step(dt: number, contacts: TrapContacts): Sprung[] {
    const traps = [...this.lying()];
    for (const { item } of traps) {
      const trap = item.trap!;
      if (trap.state !== 'holding') {
        continue;
      }
      trap.remainingSimSeconds -= dt;
      if (trap.remainingSimSeconds <= 0 || (trap.zombie !== undefined && !contacts.alive(trap.zombie))) {
        item.trap = undefined;
      }
    }
    const player = cellOf(contacts.player);
    const zombies = [...contacts.zombies].map(([id, pos]) => [id, cellOf(pos)] as const);
    const sprung: Sprung[] = [];
    for (const { item, pos, def } of traps) {
      if (item.trap?.state !== 'armed' || !inPlayerBlock(pos, contacts.player, contacts.blockSize)) {
        continue;
      }
      if (sameCell(player, pos)) {
        item.trap = { state: 'holding', remainingSimSeconds: def.holdSimSeconds };
        sprung.push({ item, pos });
        contacts.hurtPlayer(def.playerInjury);
        continue;
      }
      const caught = zombies.find(([, cell]) => sameCell(cell, pos));
      if (caught) {
        const [zombie] = caught;
        item.trap = { state: 'holding', zombie, remainingSimSeconds: def.holdSimSeconds };
        sprung.push({ item, pos, zombie });
        contacts.injureZombie(zombie, def.zombieLegDamage);
      }
    }
    return sprung;
  }
}
