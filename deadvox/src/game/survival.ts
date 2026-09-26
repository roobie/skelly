// Using what's in your hands (DESIGN.md, "Hands"): eating and drinking are short
// actions in the handling queue, a light switches on and off, and a battery goes into
// the light you're holding. Only a light in your hands shines; one put away goes off.
// The needs themselves are in the simulation (core/needs.ts).

import { gameHours } from '../core/clock.ts';
import { freshnessWord, isRotten } from '../core/food.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { HandSide, Inventory, Target } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import {
  BATTERY_SWAP,
  chargeOf,
  chargeShare,
  drainLight,
  fitsLight,
  swapBattery,
  toggleLight,
} from '../core/lights.ts';
import { consume, FOOD_POISONING } from '../core/needs.ts';
import type { Simulation } from '../core/sim.ts';

/** Seconds to eat or drink something. */
export const EAT_TIME = 3;
export const DRINK_TIME = 2;

export interface SurvivalHooks {
  /** Where a spent battery with charge left is dropped. */
  feet: () => Target;
  notice: (text: string) => void;
}

export class Survival {
  /** The light that's on, if any. */
  lit: Item | undefined;
  private readonly sim: Simulation;
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly hooks: SurvivalHooks;

  constructor(sim: Simulation, inventory: Inventory, queue: HandlingQueue, hooks: SurvivalHooks) {
    this.sim = sim;
    this.inventory = inventory;
    this.queue = queue;
    this.hooks = hooks;
    sim.scheduler.register({ id: 'lights', rate: 1, maxStep: 30, tick: (dt) => this.tickLights(dt) });
  }

  /** The hand holding `item`, if one is. */
  handOf(item: Item): HandSide | undefined {
    const at = this.inventory.locate(item);
    return at?.kind === 'hand' ? at.side : undefined;
  }

  /** Uses an item: it has to be in your hands, except a battery for the light you're holding. Says why not. */
  use(item: Item): string | undefined {
    const def = defOf(this.inventory.registry, item.type);
    const name = def.name.toLowerCase();
    if (def.battery) {
      return this.loadBattery(item);
    }
    if (this.handOf(item) === undefined) {
      return `Take the ${name} in your hands first`;
    }
    if (def.food) {
      return this.eat(item);
    }
    if (def.light) {
      return this.switchLight(item);
    }
    return `Nothing to do with the ${name} yet`;
  }

  /** Lines for the inventory's details panel: freshness, charge, whether it's on. */
  describe(item: Item): string[] {
    const { registry } = this.inventory;
    const def = defOf(registry, item.type);
    const lines: string[] = [];
    const fresh = freshnessWord(def, item, this.sim.calendar);
    if (fresh) {
      lines.push(`It's ${fresh}`);
    }
    const share = chargeShare(registry, item);
    if (share !== undefined) {
      const state = item.on ? 'on' : 'off';
      lines.push(`Battery ${Math.round(share * 100)}%${def.light ? ` · ${state}` : ''}`);
    }
    if (def.food || def.light || def.battery) {
      lines.push('U or its quickbar key: use');
    }
    return lines;
  }

  private eat(item: Item): string | undefined {
    const { registry } = this.inventory;
    const def = defOf(registry, item.type);
    const drink = def.category === 'drink';
    const name = def.name.toLowerCase();
    this.queue.enqueueAction(`${drink ? 'Drink' : 'Eat'} the ${name}`, drink ? DRINK_TIME : EAT_TIME, () =>
      this.handOf(item) === undefined ? "It isn't in your hands" : this.finishEating(item),
    );
    return undefined;
  }

  /** Eats or drinks what's in your hand; rotten food makes you sick instead. */
  private finishEating(item: Item): undefined {
    const def = defOf(this.inventory.registry, item.type);
    const rotten = isRotten(def, item, this.sim.calendar);
    this.inventory.consume(item);
    if (rotten) {
      this.hooks.notice(`The ${def.name.toLowerCase()} was rotten`);
      this.sim.hurt(FOOD_POISONING, 'food poisoning');
    } else {
      consume(this.sim.needs, def.food!);
    }
  }

  private switchLight(light: Item): string | undefined {
    const { registry } = this.inventory;
    if (!light.on && chargeOf(registry, light) === 0) {
      const battery = this.findBattery(light);
      return battery ? this.loadBattery(battery) : 'The battery is dead, and you have no spare';
    }
    const reason = toggleLight(registry, light);
    if (reason === undefined) {
      if (light.on && this.lit && this.lit !== light) {
        this.lit.on = false;
      }
      this.lit = light.on ? light : undefined;
    }
    return reason;
  }

  /** A battery you're carrying that fits the light, fullest first. */
  private findBattery(light: Item): Item | undefined {
    const { registry } = this.inventory;
    const all: Item[] = [];
    const walk = (items: readonly Item[]) => {
      for (const item of items) {
        if (fitsLight(registry, light, item) && (chargeOf(registry, item) ?? 0) > 0) {
          all.push(item);
        }
        for (const grid of item.pockets ?? []) {
          walk(grid.map((p) => p.item));
        }
      }
    };
    walk(this.inventory.carried());
    return all.sort((a, b) => (chargeOf(registry, b) ?? 0) - (chargeOf(registry, a) ?? 0))[0];
  }

  /** Queues swapping a battery into the light in your hands. */
  private loadBattery(battery: Item): string | undefined {
    const { registry, hands } = this.inventory;
    const light = [hands.right, hands.left].find((held) => held && fitsLight(registry, held, battery));
    if (!light) {
      return 'Hold the light it goes in first';
    }
    const name = defOf(registry, light.type).name.toLowerCase();
    this.queue.enqueueAction(`Put a battery in the ${name}`, BATTERY_SWAP, () =>
      this.handOf(light) === undefined
        ? "The light isn't in your hands"
        : swapBattery(this.inventory, light, battery, this.hooks.feet()),
    );
    return undefined;
  }

  /** Drains the light that's on; one that left your hands goes off. */
  private tickLights(dt: number): void {
    const light = this.lit;
    if (!light) {
      return;
    }
    if (!light.on || this.handOf(light) === undefined) {
      light.on = false;
      this.lit = undefined;
      return;
    }
    if (drainLight(this.inventory.registry, light, gameHours(this.sim.clock, dt)) !== undefined) {
      this.lit = undefined;
      this.inventory.version += 1;
      const reason = `The ${defOf(this.inventory.registry, light.type).name.toLowerCase()} died`;
      this.hooks.notice(reason);
      this.sim.emit({ kind: 'interrupt', reason });
    }
  }
}
