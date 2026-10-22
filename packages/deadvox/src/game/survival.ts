// Using what's in your hands (`DESIGN.md`, "Hands"): eating, drinking and taking a painkiller
// are short actions in the handling queue, a light switches on and off, and a battery goes into
// the light you're holding. A light whose content sets `wornSwitch` also stays lit while worn and answers the
// worn-light control (`toggleWornLights`).
// The needs themselves are in the simulation (core/needs.ts).

import { type ActionText, actionText, fillText } from '../core/actionText.ts';
import { canonicalJson } from '../core/canonicalJson.ts';
import { dominantSide } from '../core/character.ts';
import { freshnessWord, isRotten } from '../core/food.ts';
import type { HandlingQueue, JobParams, JobValue } from '../core/handling.ts';
import type { HandSide, Inventory, Target, TargetState } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { isInHeldItemSlotTree } from '../core/itemTree.ts';
import { chargeOf, chargeShare, drainBurnLight, drainLight, swapBattery, toggleLight } from '../core/lights.ts';
import { consume } from '../core/needs.ts';
import { consumption, useOption } from '../core/options.ts';
import type { ReachSnapshot } from '../core/reach.ts';
import type { Readable } from '../core/readable.ts';
import type { Simulation } from '../core/sim.ts';
import { simSeconds, simToGameSeconds } from '../core/time.ts';
import { swapCanister } from '../core/torch.ts';
import { queueTrapAction } from './bearTrapActions.ts';
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
const shouldDouse = (spec: LightSpec, location: LightLocation, path: string, sprinting: boolean): boolean => {
  const { burning } = spec;
  const wornSwitch = location.kind === 'worn' && spec.wornSwitch === true;
  const inHeldItemSlotTree = location.kind === 'slot' && isInHeldItemSlotTree(path);
  const movedOutOfHand = location.kind !== 'hand' && !wornSwitch && !inHeldItemSlotTree;
  const dropped = location.kind === 'pile';
  return (
    (dropped ? burning?.drop !== 'stay' : movedOutOfHand && burning?.stow !== 'stay') ||
    (sprinting && burning?.sprint === 'douse')
  );
};

export interface SurvivalHooks {
  /** Where a spent battery with charge left, or a spent canister, is dropped; undefined with no ground nearby. */
  feet: (item: Item) => Target | undefined;
  notice: (text: string) => void;
  reach: () => ReachSnapshot;
  /** Presents validated authored text and, for books, its action owner. */
  /** `itemType` names the read item; a readable fixture has none. */
  read: (readable: Readonly<Readable>, bookUid?: number, itemType?: string) => void;
  /** Whether the book has already taught every recipe it owns. */
  bookRead?: (bookUid: number) => boolean;
  consumed?: ((type: string) => void) | undefined;
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
  private readonly text: ActionText;
  private readonly itemActionSelection: ItemActionSelection;
  private sprinting = false;

  constructor(sim: Simulation, inventory: Inventory, queue: HandlingQueue, hooks: SurvivalHooks) {
    this.sim = sim;
    this.inventory = inventory;
    this.queue = queue;
    this.hooks = hooks;
    const text = actionText(inventory.registry);
    this.text = text;
    this.itemActionSelection = new ItemActionSelection(text.itemActions.openCan);
    this.queue.registerAction('survival.consume', (params) => {
      const item = this.inventory.itemByUid(numberParam(params, 'itemUid'));
      if (!item || this.handOf(item) === undefined) {
        return text.survival.notInHands;
      }
      return this.finishConsuming(item);
    });
    this.queue.registerAction('survival.quickbarConsume', (params) => {
      const { source } = params;
      const item = this.inventory.itemByUid(numberParam(params, 'itemUid'));
      if (!(item && source) || typeof source !== 'object' || Array.isArray(source)) {
        return text.common.gone;
      }
      const name = defOf(this.inventory.registry, item.type).name.toLowerCase();
      const at = this.inventory.locate(item);
      const targetState = source as unknown as TargetState;
      const target = this.inventory.resolveTarget(targetState);
      if (
        at?.kind !== 'pocket' ||
        !target ||
        canonicalJson(this.inventory.targetState(this.inventory.targetForLocation(at))) !== canonicalJson(targetState)
      ) {
        return fillText(text.survival.itemMoved, { item: name });
      }
      const plan = this.inventory.plan(item, target);
      if (!plan.ok) {
        return plan.reason;
      }
      if (!this.hooks.reach().entries.some((entry) => entry.item === item)) {
        return fillText(text.survival.itemOutOfReach, { item: name });
      }
      return this.finishConsuming(item);
    });
    this.queue.registerAction('survival.battery', (params) => {
      const light = this.inventory.itemByUid(numberParam(params, 'lightUid'));
      const battery = this.inventory.itemByUid(numberParam(params, 'batteryUid'));
      if (!light || this.handOf(light) === undefined) {
        return text.survival.lightNotInHands;
      }
      if (!battery) {
        return text.survival.batteryGone;
      }
      if (!this.hooks.reach().entries.some((entry) => entry.item === battery)) {
        return text.survival.batteryOutOfReach;
      }
      return swapBattery(this.inventory, light, battery, this.hooks.feet);
    });
    this.queue.registerAction('survival.canister', (params) => {
      const tool = this.inventory.itemByUid(numberParam(params, 'toolUid'));
      const canister = this.inventory.itemByUid(numberParam(params, 'canisterUid'));
      if (!tool || this.handOf(tool) === undefined) {
        return text.survival.toolNotInHands;
      }
      if (!canister) {
        return text.survival.cartridgeGone;
      }
      if (!this.hooks.reach().entries.some((entry) => entry.item === canister)) {
        return text.survival.cartridgeOutOfReach;
      }
      return swapCanister(this.inventory, tool, canister, this.hooks.feet);
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
    if (actions.length === 0 || (actions.length < 2 && (actions[0]!.opening || actions[0]!.id === 'own'))) {
      return undefined;
    }
    const selectedId = this.selectedItemAction(item)?.id;
    const { name } = defOf(this.inventory.registry, item.type);
    return [
      fillText(this.text.survival.actionListHeading, { item: name }),
      ...actions.map((action) => `${action.id === selectedId ? '›' : ' '} ${action.label}`),
    ].join('\n');
  }

  private applyItemAction(item: Item, action: ItemAction | undefined): string | undefined {
    const treatment = action?.treatment;
    if (!treatment) {
      return fillText(this.text.survival.noWound, {
        item: defOf(this.inventory.registry, item.type).name.toLowerCase(),
      });
    }
    return this.sim.actions.beginTreatment(
      treatment.region,
      item.uid,
      treatment.itemType,
      this.sim.body.tuning.treatmentSimSeconds,
    );
  }

  private readItem(item: Item, readable: Readonly<Readable> | undefined): string | undefined {
    const hasBook = defOf(this.inventory.registry, item.type).book !== undefined;
    if (hasBook && this.hooks.bookRead?.(item.uid) !== true) {
      const reason = this.sim.actions.beginReading(item.uid);
      if (reason) {
        return reason;
      }
    }
    if (readable) {
      this.hooks.read(readable, hasBook ? item.uid : undefined, item.type);
    }
    return undefined;
  }

  /** Executes the live core option; this owner retains effects and serializable queue actions. */
  use(item: Item): string | undefined {
    if (this.sim.body.actionRefusal) {
      return this.sim.body.actionRefusal;
    }
    const definition = defOf(this.inventory.registry, item.type);
    if (definition.treatment) {
      if (this.handOf(item) === undefined) {
        return fillText(this.text.survival.itemNotInHands, { item: definition.name.toLowerCase() });
      }
      return this.applyItemAction(item, this.selectedItemAction(item));
    }
    const option = useOption(item, this.hooks.reach());
    if (!option.plan.ok) {
      return option.plan.reason;
    }
    switch (option.operation) {
      case 'consume':
        this.queue.enqueueAction('survival.consume', option.label, option.plan.time, { itemUid: item.uid });
        return undefined;
      case 'battery':
        this.queue.enqueueAction('survival.battery', option.label, option.plan.time, {
          lightUid: option.light!.uid,
          batteryUid: option.battery!.uid,
        });
        return undefined;
      case 'canister':
        this.queue.enqueueAction('survival.canister', option.label, option.plan.time, {
          toolUid: option.tool!.uid,
          canisterUid: option.canister!.uid,
        });
        return undefined;
      case 'switch':
        return this.switchLight(item);
      case 'read':
        return this.readItem(item, option.readable);
      case 'trap':
        queueTrapAction(this.queue, item, option.label, option.plan.time);
        return undefined;
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
    return fillText(this.text.survival.itemNotInHands, { item: name.toLowerCase() });
  }

  private useQuickbarConsumable(
    item: Item,
    use: NonNullable<ReturnType<typeof consumption>>,
    at: LightLocation,
  ): string | undefined {
    if (!this.hooks.reach().entries.some((entry) => entry.item === item)) {
      return this.text.common.tooFar;
    }
    const target = this.inventory.targetForLocation(at);
    const hand = { kind: 'hand', side: 'right' } as const;
    const duration =
      this.inventory.handlingTime(item, at, hand) + use.simSeconds + this.inventory.handlingTime(item, hand, target);
    this.queue.enqueueAction('survival.quickbarConsume', use.label, duration, {
      itemUid: item.uid,
      source: JSON.parse(canonicalJson(this.inventory.targetState(target))) as JobValue,
    });
    return undefined;
  }

  /** Quickbar hold uses pocket food or a painkiller as one action, without displacing either hand. */
  useFromQuickbar(item: Item): string | undefined {
    if (this.sim.body.actionRefusal) {
      return this.sim.body.actionRefusal;
    }
    const def = defOf(this.inventory.registry, item.type);
    const name = { item: def.name.toLowerCase() };
    const at = this.inventory.locate(item);
    if (!at) {
      return fillText(this.text.survival.itemGone, name);
    }
    if (def.treatment) {
      return this.useTreatmentFromQuickbar(item, at);
    }
    // A firearm, weapon or key keeps its own action; a tool's category refuses only when nothing in it can be consumed.
    const use = consumption(def, this.inventory.registry);
    if (def.firearm || def.weapon || def.key || (!use && def.category === 'tool' && !def.light)) {
      return fillText(this.text.survival.cantUseFromHere, name);
    }
    if (at.kind === 'hand' || def.battery) {
      return this.use(item);
    }
    if (use && at.kind === 'pocket') {
      return this.useQuickbarConsumable(item, use, at);
    }
    return fillText(this.text.survival.itemNotInHands, name);
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
    const text = this.text.survival;
    const lines: string[] = [];
    const fresh = freshnessWord(def, item, this.sim.calendar);
    if (fresh) {
      lines.push(fillText(text.freshnessDetail, { freshness: fresh }));
    }
    const share = chargeShare(registry, item);
    if (share !== undefined) {
      const charge = fillText(def.igniter ? text.fuelDetail : text.batteryDetail, { percent: Math.round(share * 100) });
      lines.push(def.light ? fillText(item.on ? text.lightOnDetail : text.lightOffDetail, { charge }) : charge);
    }
    if (def.igniter) {
      lines.push(text.igniterDetail);
    }
    return lines;
  }

  /** Eats, drinks or takes one of `item`; rotten food makes you sick instead. */
  private finishConsuming(item: Item): string | undefined {
    const vessel = defOf(this.inventory.registry, item.type);
    if (!consumption(vessel, this.inventory.registry)) {
      return this.text.survival.nothingLeft;
    }
    const foodType = vessel.serving?.food ?? item.type;
    const def = defOf(this.inventory.registry, foodType);
    const rotten = isRotten(def, item, this.sim.calendar);
    if (vessel.serving) {
      this.inventory.transform(item, vessel.serving.empty);
    } else {
      this.inventory.consume(item);
    }
    if (def.analgesic) {
      this.sim.body.takeAnalgesic(item.type);
    } else if (rotten) {
      this.hooks.notice(fillText(this.text.survival.rotten, { item: def.name.toLowerCase() }));
      this.sim.hurt(def.food!.poisonHealth!, this.text.causes.foodPoisoning);
    } else {
      consume(this.sim.needs, def.food!, this.sim.body.nourishmentScale);
    }
    this.hooks.consumed?.(foodType);
    return undefined;
  }

  private heldFirestarterFor(light: Item): Item | string {
    const text = this.text.survival;
    const hand = this.handOf(light);
    if (!hand) {
      return text.lightNotInHands;
    }
    const igniter = this.inventory.hands[hand === 'right' ? 'left' : 'right'];
    if (!igniter) {
      return text.needFirestarter;
    }
    const spec = defOf(this.inventory.registry, igniter.type).igniter;
    if (!spec) {
      return text.needFirestarter;
    }
    if ((chargeOf(this.inventory.registry, igniter) ?? 0) < spec.perIgnition) {
      return text.outOfFuel;
    }
    return igniter;
  }

  /**
   * The worn-light control: if any worn switchable light is off, every one comes on, otherwise every one goes off.
   * Returns why none could change, or undefined.
   */
  toggleWornLights(): string | undefined {
    const { registry } = this.inventory;
    const worn: Item[] = [];
    for (const { item, location } of this.inventory.items()) {
      if (location.kind === 'worn' && defOf(registry, item.type).light?.wornSwitch === true) {
        worn.push(item);
      }
    }
    if (worn.length === 0) {
      return undefined;
    }
    const turnOn = worn.some((light) => !light.on);
    const heldBeam = this.lit && !worn.includes(this.lit) && this.lit.on ? this.lit : undefined;
    let reason: string | undefined;
    let changed = false;
    for (const light of worn) {
      if (light.on === turnOn) {
        continue;
      }
      const refusal = this.switchLight(light);
      if (refusal === undefined) {
        changed = true;
      } else {
        reason ??= refusal;
      }
    }
    if (heldBeam) {
      this.lit = heldBeam;
    }
    return changed ? undefined : reason;
  }

  private switchLight(light: Item): string | undefined {
    const { registry } = this.inventory;
    const spec = defOf(registry, light.type).light!;
    if (light.on && spec.burnTimeGameHours !== undefined && drainBurnLight(light, this.sim.calendar)) {
      this.inventory.version += 1;
      return this.text.survival.burnedOut;
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
      this.fallBackToWornBeam();
      this.inventory.version += 1;
    }
    return reason;
  }

  /** An on worn light must not stay dark because the active light went out, so it takes over. */
  private fallBackToWornBeam(): void {
    if (this.lit) {
      return;
    }
    const { registry } = this.inventory;
    for (const { item, location } of this.inventory.items()) {
      const spec = defOf(registry, item.type).light;
      if (item.on && location.kind === 'worn' && spec?.wornSwitch === true && spec.beam !== undefined) {
        this.lit = item;
        return;
      }
    }
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
      this.fallBackToWornBeam();
    }
  }

  /** Applies owner rules and burns every active item source, including pocketed and dropped lights. */
  private tickLights(dt: number): void {
    for (const { item, location, path } of this.inventory.items()) {
      this.tickLight(item, location, path, dt);
    }
  }

  private tickLight(item: Item, location: LightLocation, path: string, dt: number): void {
    const { registry } = this.inventory;
    const spec = defOf(registry, item.type).light;
    if (!(spec && item.on)) {
      return;
    }
    if (shouldDouse(spec, location, path, this.sprinting)) {
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
      this.fallBackToWornBeam();
    }
    const reason = fillText(this.text.survival.lightDied, { item: defOf(registry, item.type).name.toLowerCase() });
    this.hooks.notice(reason);
    this.sim.emit({ kind: 'interrupt', reason });
  }
}
