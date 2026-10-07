// Using what's in your hands (DESIGN.md, "Hands"): eating and drinking are short
// actions in the handling queue, a light switches on and off, and a battery goes into
// the light you're holding. Head-worn beam lights also remain usable while worn.
// The needs themselves are in the simulation (core/needs.ts).

import { canonicalJson } from '../core/canonicalJson.ts';
import { dominantSide } from '../core/character.ts';
import { freshnessWord, isRotten } from '../core/food.ts';
import type { HandlingQueue, JobParams, JobValue } from '../core/handling.ts';
import type { HandSide, Inventory, Target, TargetState } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { chargeOf, chargeShare, drainBurnLight, drainLight, swapBattery, toggleLight } from '../core/lights.ts';
import { consume, FOOD_POISONING } from '../core/needs.ts';
import { DRINK_TIME, EAT_TIME, useOption } from '../core/options.ts';
import type { ReachSnapshot } from '../core/reach.ts';
import type { Readable } from '../core/readable.ts';
import type { Simulation } from '../core/sim.ts';
import { simSeconds, simToGameSeconds } from '../core/time.ts';
import { type ItemAction, ItemActionSelection, itemActionsFor } from './itemActions.ts';

const numberParam = (params: JobParams, key: string): number => {
  const value = params[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Invalid action parameter ${key}`);
  }
  return value;
};

type LightSpec = NonNullable<ReturnType<typeof defOf>['light']>;
type LightLocation = NonNullable<ReturnType<Inventory['locate']>>;

const shouldDouse = (spec: LightSpec, location: LightLocation, sprinting: boolean): boolean => {
  const { burning } = spec;
  const wornHeadlamp = location.kind === 'worn' && location.slot === 'head' && spec.beam !== undefined;
  const movedOutOfHand = location.kind !== 'hand' && !wornHeadlamp;
  const dropped = location.kind === 'pile';
  return (
    (dropped ? burning?.drop !== 'stay' : movedOutOfHand && burning?.stow !== 'stay') ||
    (sprinting && burning?.sprint === 'douse')
  );
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
  private readonly itemActionSelection = new ItemActionSelection();
  private sprinting = false;

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

  availableItemActions(item: Item): readonly ItemAction[] {
    return itemActionsFor(item, this.inventory, this.sim.body);
  }

  selectedItemAction(item: Item): ItemAction | undefined {
    return this.itemActionSelection.forItem(item, this.availableItemActions(item));
  }

  cycleItemAction(item: Item, direction: number): boolean {
    return this.itemActionSelection.step(item, this.availableItemActions(item), direction);
  }

  wieldedItemActionHint(): string | undefined {
    const item = this.inventory.hands[dominantSide(this.inventory.character)];
    if (!item) {
      return undefined;
    }
    const actions = this.availableItemActions(item);
    if (actions.length === 0) {
      return undefined;
    }
    const selectedId = this.selectedItemAction(item)?.id;
    const { name } = defOf(this.inventory.registry, item.type);
    return [`${name}:`, ...actions.map((action) => `${action.id === selectedId ? '›' : ' '} ${action.label}`)].join(
      '\n',
    );
  }

  private applyItemAction(item: Item, action: ItemAction | undefined): string | undefined {
    const treatment = action?.treatment;
    if (!treatment) {
      return `No wound needs the ${defOf(this.inventory.registry, item.type).name.toLowerCase()}`;
    }
    return this.sim.actions.beginTreatment(
      treatment.region,
      item.uid,
      treatment.kind,
      this.sim.body.tuning.treatmentSimSeconds,
    );
  }

  /** Executes the live core option; this owner retains effects and serializable queue actions. */
  use(item: Item): string | undefined {
    if (this.sim.body.actionRefusal) {
      return this.sim.body.actionRefusal;
    }
    const definition = defOf(this.inventory.registry, item.type);
    if (definition.treatment) {
      if (this.handOf(item) === undefined) {
        return `Take the ${definition.name.toLowerCase()} in your hands first`;
      }
      return this.applyItemAction(item, this.selectedItemAction(item));
    }
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

  private useTreatmentFromQuickbar(
    item: Item,
    location: NonNullable<ReturnType<Inventory['locate']>>,
  ): string | undefined {
    const { name } = defOf(this.inventory.registry, item.type);
    if (location.kind === 'hand') {
      return this.use(item);
    }
    if (location.kind === 'pocket' && this.hooks.reach().entries.some((entry) => entry.item === item)) {
      return this.applyItemAction(item, this.selectedItemAction(item));
    }
    return `Take the ${name.toLowerCase()} in your hands first`;
  }

  private useQuickbarFood(item: Item, def: ReturnType<typeof defOf>, at: LightLocation): string | undefined {
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

  /** Quickbar hold uses pocket food as one action, without displacing either hand. */
  useFromQuickbar(item: Item): string | undefined {
    if (this.sim.body.actionRefusal) {
      return this.sim.body.actionRefusal;
    }
    const def = defOf(this.inventory.registry, item.type);
    const at = this.inventory.locate(item);
    if (!at) {
      return `The ${def.name.toLowerCase()} isn't there any more`;
    }
    if (def.treatment) {
      return this.useTreatmentFromQuickbar(item, at);
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
      return this.useQuickbarFood(item, def, at);
    }
    return `Take the ${def.name.toLowerCase()} in your hands first`;
  }

  /** Whether the player is sprinting; content can extinguish lights when this changes. */
  setSprinting(sprinting: boolean): void {
    const started = sprinting && !this.sprinting;
    this.sprinting = sprinting;
    if (!started) {
      return;
    }
    for (const { item } of this.inventory.items()) {
      const spec = defOf(this.inventory.registry, item.type).light;
      if (item.on && spec?.burning?.sprint === 'douse') {
        this.douseLight(item, spec);
      }
    }
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
      lines.push(`${def.igniter ? 'Fuel' : 'Battery'} ${Math.round(share * 100)}%${def.light ? ` · ${state}` : ''}`);
    }
    if (def.igniter) {
      lines.push('Fuel for lighting a light held in the other hand');
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

  private heldFirestarterFor(light: Item): Item | string {
    const hand = this.handOf(light);
    if (!hand) {
      return 'Take the light in your hands first';
    }
    const igniter = this.inventory.hands[hand === 'right' ? 'left' : 'right'];
    if (!igniter) {
      return 'Need a firestarter in the other hand';
    }
    const spec = defOf(this.inventory.registry, igniter.type).igniter;
    if (!spec) {
      return 'Need a firestarter in the other hand';
    }
    if ((chargeOf(this.inventory.registry, igniter) ?? 0) < spec.perIgnition) {
      return "It's out of fuel";
    }
    return igniter;
  }

  private switchLight(light: Item): string | undefined {
    const { registry } = this.inventory;
    const spec = defOf(registry, light.type).light!;
    if (light.on && spec.burnTimeGameHours !== undefined && drainBurnLight(light, this.sim.calendar)) {
      this.inventory.version += 1;
      return 'It has burned out';
    }
    let igniter: Item | undefined;
    if (!light.on && spec.burning?.ignition === 'firestarter') {
      const held = this.heldFirestarterFor(light);
      if (typeof held === 'string') {
        return held;
      }
      igniter = held;
    }
    const reason = toggleLight(registry, light, this.sim.calendar);
    if (reason === undefined) {
      if (igniter) {
        const cost = defOf(registry, igniter.type).igniter!.perIgnition;
        igniter.charges = (chargeOf(registry, igniter) ?? 0) - cost;
      }
      this.lit = light.on && defOf(registry, light.type).light!.beam !== undefined ? light : undefined;
      this.inventory.version += 1;
    }
    return reason;
  }

  /** Turns off a light without discarding its remaining burn. */
  private douseLight(item: Item, spec: LightSpec): void {
    if (spec.burnTimeGameHours !== undefined) {
      drainBurnLight(item, this.sim.calendar);
    }
    item.on = false;
    item.litAtGameTimestamp = undefined;
    this.inventory.version += 1;
    if (this.lit === item) {
      this.lit = undefined;
    }
  }

  /** Applies owner rules and burns every active item source, including pocketed and dropped lights. */
  private tickLights(dt: number): void {
    for (const { item, location } of this.inventory.items()) {
      this.tickLight(item, location, dt);
    }
  }

  private tickLight(item: Item, location: LightLocation, dt: number): void {
    const { registry } = this.inventory;
    const spec = defOf(registry, item.type).light;
    if (!(spec && item.on)) {
      return;
    }
    if (shouldDouse(spec, location, this.sprinting)) {
      this.douseLight(item, spec);
      return;
    }
    const beforeCharge = chargeOf(registry, item);
    const expired =
      spec.burnTimeGameHours === undefined
        ? drainLight(registry, item, simToGameSeconds(this.sim.clock, simSeconds(dt))) !== undefined
        : drainBurnLight(item, this.sim.calendar);
    if (chargeOf(registry, item) !== beforeCharge || expired) {
      this.inventory.version += 1;
    }
    if (!expired) {
      return;
    }
    if (this.lit === item) {
      this.lit = undefined;
    }
    const reason = `The ${defOf(registry, item.type).name.toLowerCase()} died`;
    this.hooks.notice(reason);
    this.sim.emit({ kind: 'interrupt', reason });
  }
}
