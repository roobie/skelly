// Using what's in your hands (DESIGN.md, "Hands"): eating and drinking are short
// actions in the handling queue, a light switches on and off, and a battery goes into
// the light you're holding. Only a light in your hands shines; one put away goes off.
// The needs themselves are in the simulation (core/needs.ts).

import { canonicalJson } from '../core/canonicalJson.ts';
import { gameHours } from '../core/clock.ts';
import { freshnessWord, isRotten } from '../core/food.ts';
import type { HandlingQueue, JobParams, JobValue } from '../core/handling.ts';
import type { HandSide, Inventory, Target, TargetState } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { chargeShare, drainLight, swapBattery, toggleLight } from '../core/lights.ts';
import { consume, FOOD_POISONING } from '../core/needs.ts';
import { DRINK_TIME, EAT_TIME, useOption } from '../core/options.ts';
import type { ReachSnapshot } from '../core/reach.ts';
import type { Readable } from '../core/readable.ts';
import type { Simulation } from '../core/sim.ts';

const numberParam = (params: JobParams, key: string): number => {
  const value = params[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Invalid action parameter ${key}`);
  }
  return value;
};

export interface SurvivalHooks {
  /** Where a spent battery with charge left is dropped. */
  feet: () => Target;
  notice: (text: string) => void;
  reach: () => ReachSnapshot;
  /** Presents validated authored text; no time, consumption or save-state mutation. */
  read: (readable: Readonly<Readable>) => void;
}

export class Survival {
  /** Selection is non-owning; a removed light resolves to empty immediately. */
  private litUid: number | undefined;

  get lit(): Item | undefined {
    if (this.litUid === undefined) {
      return undefined;
    }
    const light = this.inventory.itemByUid(this.litUid);
    if (!light) {
      this.litUid = undefined;
    }
    return light;
  }

  set lit(item: Item | undefined) {
    this.litUid = item?.uid;
  }
  private readonly sim: Simulation;
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly hooks: SurvivalHooks;

  constructor(sim: Simulation, inventory: Inventory, queue: HandlingQueue, hooks: SurvivalHooks) {
    this.sim = sim;
    this.inventory = inventory;
    this.queue = queue;
    this.hooks = hooks;
    this.queue.registerAction('survival.eat', (params) => {
      const item = this.inventory.itemByUid(numberParam(params, 'itemUid'));
      if (!item || this.handOf(item) === undefined) {
        return "It isn't in your hands";
      }
      return this.finishEating(item);
    });
    this.queue.registerAction('survival.quickbarEat', (params) => {
      const { source } = params;
      const item = this.inventory.itemByUid(numberParam(params, 'itemUid'));
      if (!(item && source) || typeof source !== 'object' || Array.isArray(source)) {
        return "The food isn't there any more";
      }
      const at = this.inventory.locate(item);
      const targetState = source as unknown as TargetState;
      const target = this.inventory.resolveTarget(targetState);
      if (
        at?.kind !== 'pocket' ||
        !target ||
        canonicalJson(this.inventory.targetState(this.inventory.targetForLocation(at))) !== canonicalJson(targetState)
      ) {
        return 'The food moved before you could use it';
      }
      const plan = this.inventory.plan(item, target);
      if (!plan.ok) {
        return plan.reason;
      }
      if (!this.hooks.reach().entries.some((entry) => entry.item === item)) {
        return 'The food is no longer in reach';
      }
      return this.finishEating(item);
    });
    this.queue.registerAction('survival.battery', (params) => {
      const light = this.inventory.itemByUid(numberParam(params, 'lightUid'));
      const battery = this.inventory.itemByUid(numberParam(params, 'batteryUid'));
      if (!light || this.handOf(light) === undefined) {
        return "The light isn't in your hands";
      }
      if (!battery) {
        return "The battery isn't there any more";
      }
      if (!this.hooks.reach().entries.some((entry) => entry.item === battery)) {
        return 'The battery is no longer in reach';
      }
      return swapBattery(this.inventory, light, battery, this.hooks.feet());
    });
    sim.scheduler.register({ id: 'lights', rate: 1, maxStep: 30, tick: (dt) => this.tickLights(dt) });
  }

  snapshotState(): Readonly<{ litUid?: number }> {
    const light = this.lit;
    return Object.freeze(light === undefined ? {} : { litUid: light.uid });
  }

  restoreState(state: { litUid?: number }): void {
    this.lit = state.litUid === undefined ? undefined : this.inventory.itemByUid(state.litUid);
    if (state.litUid !== undefined && !this.lit) {
      throw new Error(`Missing saved light item ${state.litUid}`);
    }
  }

  /** The hand holding `item`, if one is. */
  handOf(item: Item): HandSide | undefined {
    const at = this.inventory.locate(item);
    return at?.kind === 'hand' ? at.side : undefined;
  }

  /** Executes the live core option; this owner retains effects and serializable queue actions. */
  use(item: Item): string | undefined {
    const option = useOption(item, this.hooks.reach());
    if (!option.plan.ok) {
      return option.plan.reason;
    }
    switch (option.operation) {
      case 'eat':
        this.queue.enqueueAction('survival.eat', option.label, option.plan.time, { itemUid: item.uid });
        return undefined;
      case 'battery':
        this.queue.enqueueAction('survival.battery', option.label, option.plan.time, {
          lightUid: option.light!.uid,
          batteryUid: option.battery!.uid,
        });
        return undefined;
      case 'switch':
        return this.switchLight(item);
      case 'read': {
        const definition = defOf(this.inventory.registry, item.type);
        if (definition.book) {
          const reason = this.sim.actions.beginReading(item.uid);
          if (reason) {
            return reason;
          }
        }
        if (option.readable) {
          this.hooks.read(option.readable);
        }
        return undefined;
      }
      default:
        throw new Error('Invalid usable core option');
    }
  }

  /** Quickbar hold uses pocket food as one action, without displacing either hand. */
  useFromQuickbar(item: Item): string | undefined {
    const def = defOf(this.inventory.registry, item.type);
    const at = this.inventory.locate(item);
    if (!at) {
      return `The ${def.name.toLowerCase()} isn't there any more`;
    }
    if (def.firearm) {
      return 'Use R to work the firearm';
    }
    if (def.weapon || def.key || (def.category === 'tool' && !def.light)) {
      return `Nothing to do with the ${def.name.toLowerCase()} from here`;
    }
    if (at.kind === 'hand' || def.battery) {
      return this.use(item);
    }
    if (def.food && at.kind === 'pocket') {
      if (!this.hooks.reach().entries.some((entry) => entry.item === item)) {
        return 'Too far away';
      }
      const target = this.inventory.targetForLocation(at);
      const hand = { kind: 'hand', side: 'right' } as const;
      const isDrink = def.category === 'drink';
      const useTime = isDrink ? DRINK_TIME : EAT_TIME;
      const duration =
        this.inventory.handlingTime(item, at, hand) + useTime + this.inventory.handlingTime(item, hand, target);
      this.queue.enqueueAction(
        'survival.quickbarEat',
        `${isDrink ? 'Drink' : 'Eat'} the ${def.name.toLowerCase()}`,
        duration,
        {
          itemUid: item.uid,
          source: JSON.parse(canonicalJson(this.inventory.targetState(target))) as JobValue,
        },
      );
      return undefined;
    }
    return `Take the ${def.name.toLowerCase()} in your hands first`;
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
    if (def.food || def.battery) {
      lines.push('U: use in hand · hold its quickbar key: use from its current location');
    } else if (def.light || def.readable || def.book) {
      lines.push('U: use in hand · hold its quickbar key: use in hand');
    }
    return lines;
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
    const reason = toggleLight(registry, light);
    if (reason === undefined) {
      if (light.on && this.lit && this.lit !== light) {
        this.lit.on = false;
      }
      this.lit = light.on ? light : undefined;
      this.inventory.version += 1;
    }
    return reason;
  }

  /** Drains the light that's on; one that left your hands goes off. */
  private tickLights(dt: number): void {
    const light = this.lit;
    if (!light) {
      return;
    }
    if (!light.on || this.handOf(light) === undefined) {
      if (light.on) {
        light.on = false;
        this.inventory.version += 1;
      }
      this.lit = undefined;
      return;
    }
    const beforeCharge = light.charges;
    const beforeOn = light.on;
    const expired = drainLight(this.inventory.registry, light, gameHours(this.sim.clock, dt));
    if (light.charges !== beforeCharge || light.on !== beforeOn) {
      this.inventory.version += 1;
    }
    if (expired !== undefined) {
      this.lit = undefined;
      const reason = `The ${defOf(this.inventory.registry, light.type).name.toLowerCase()} died`;
      this.hooks.notice(reason);
      this.sim.emit({ kind: 'interrupt', reason });
    }
  }
}
