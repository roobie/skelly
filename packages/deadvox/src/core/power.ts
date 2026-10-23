import {
  array,
  boolean,
  type InferOutput,
  minValue,
  nonEmpty,
  number,
  parse,
  pipe,
  safeInteger,
  strictObject,
  string,
} from 'valibot';
import { type ClockSettings, SECONDS_PER_DAY } from './clock.ts';
import type { Registry } from './content.ts';
import { type DayCycle, type DayPhase, dayPhaseAt } from './dayPhase.ts';
import {
  exactUnits,
  POWER_UNITS,
  type PowerDeviceDef,
  PowerDeviceSchema,
  type PowerTuningDef,
  PowerTuningSchema,
  unitCount,
} from './powerContent.ts';
import { PowerGraph } from './powerGraph.ts';
import { type SimTimestamp, simTimestamp } from './time.ts';

const Units = pipe(number(), safeInteger(), minValue(0));
const Identity = pipe(string(), nonEmpty());
const DeviceStateSchema = strictObject({
  id: Identity,
  type: Identity,
  enabled: boolean(),
  fuelUnits: Units,
  storedMicrojoules: Units,
  powered: boolean(),
  restartBlocked: boolean(),
});
const LinkSchema = strictObject({
  from: Identity,
  to: Identity,
  itemUid: pipe(number(), safeInteger(), minValue(1)),
});
const PowerStateSchema = strictObject({
  /** Game milliseconds since simulation time 0. */
  atGameMilliseconds: Units,
  devices: array(DeviceStateSchema),
  links: array(LinkSchema),
});
export type PowerDeviceState = InferOutput<typeof DeviceStateSchema>;
export type PowerLink = InferOutput<typeof LinkSchema>;
export type PowerState = InferOutput<typeof PowerStateSchema>;

export interface PowerTransition {
  readonly at: SimTimestamp;
  readonly consumerId: string;
  readonly powered: boolean;
}

/** Appliance-owned work: zero is idle; undefined leaves an ordinary consumer unmanaged. */
export interface PowerWork {
  remainingGameMilliseconds: (consumerId: string) => number | undefined;
  /** Settle every owner over the same interval, applying tied completions together before returning. */
  settle: (elapsedGameMilliseconds: number, servedConsumerIds: readonly string[]) => void;
}

interface PowerEnvironment {
  readonly registry: Pick<Registry, 'powerDevices'>;
  readonly tuning: PowerTuningDef;
  readonly cycle: DayCycle;
  readonly clock: ClockSettings;
}

/** A device definition in integer units: power per game millisecond, stored amounts, parts per million. */
type Spec = { readonly priority: number } & (
  | { readonly kind: 'generator'; readonly output: number; readonly burn: number }
  | { readonly kind: 'solar'; readonly output: Readonly<Record<DayPhase, number>> }
  | { readonly kind: 'battery'; readonly capacity: number; readonly charge: number; readonly discharge: number }
  | { readonly kind: 'consumer'; readonly demand: number }
);
type Device = PowerDeviceState & { readonly spec: Spec };
interface Store {
  readonly device: Device;
  readonly spec: Extract<Spec, { kind: 'battery' }>;
}
interface Transfer {
  readonly device: Device;
  readonly perGameMillisecond: number;
  readonly limit: number;
}

const DAY_MILLISECONDS = SECONDS_PER_DAY * POWER_UNITS.gameMillisecondsPerGameSecond;

/** The game millisecond since simulation time 0 nearest a simulation time. */
export const gameMillisecondsAt = (clock: ClockSettings, at: number): number =>
  Math.round(at * clock.ratio * POWER_UNITS.gameMillisecondsPerGameSecond);

const specOf = (def: PowerDeviceDef): Spec => {
  const { rate, amount, efficiency } = POWER_UNITS;
  switch (def.kind) {
    case 'generator':
      return {
        kind: def.kind,
        priority: def.priority,
        output: exactUnits(def.outputWatts, rate),
        burn: exactUnits(def.burnLitresPerGameHour, rate),
      };
    case 'solar': {
      const { night, dawn, day, dusk } = def.outputWatts;
      const output = { night, dawn, day, dusk };
      for (const phase of Object.keys(output) as DayPhase[]) {
        output[phase] = exactUnits(output[phase], rate);
      }
      return { kind: def.kind, priority: def.priority, output };
    }
    case 'battery':
      return {
        kind: def.kind,
        priority: def.priority,
        capacity: exactUnits(def.capacityWh, amount),
        charge: exactUnits(def.chargeEfficiency, efficiency),
        discharge: exactUnits(def.dischargeEfficiency, efficiency),
      };
    case 'consumer':
      return { kind: def.kind, priority: def.priority, demand: exactUnits(def.demandWatts, rate) };
    default:
      throw new Error('Unknown power device kind');
  }
};

const safe = (value: number): number => {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Power units out of range');
  }
  return value;
};
// Float division can land one off the exact quotient of large integers.
const floorDiv = (dividend: number, divisor: number): number => {
  const quotient = Math.floor(dividend / divisor);
  if (quotient * divisor > dividend) {
    return quotient - 1;
  }
  return (quotient + 1) * divisor <= dividend ? quotient + 1 : quotient;
};
const ceilDiv = (dividend: number, divisor: number): number => -floorDiv(-dividend, divisor);

const compareId = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
};
const priorityOrder = (a: Device, b: Device): number => a.spec.priority - b.spec.priority || compareId(a.id, b.id);
const resource = (device: Device): number =>
  device.spec.kind === 'generator' ? device.fuelUnits : device.storedMicrojoules;
const transferDuration = (transfer: Transfer): number =>
  ceilDiv(Math.abs(transfer.limit - resource(transfer.device)), Math.abs(transfer.perGameMillisecond));
const storesOf = (devices: readonly Device[]): Store[] =>
  devices.flatMap((device) =>
    device.enabled && device.spec.kind === 'battery' ? [{ device, spec: device.spec }] : [],
  );

const validateResources = (entry: PowerDeviceState, spec: Spec): void => {
  if (
    (spec.kind !== 'generator' && entry.fuelUnits !== 0) ||
    (spec.kind !== 'battery' && entry.storedMicrojoules !== 0) ||
    (spec.kind === 'battery' && entry.storedMicrojoules > spec.capacity) ||
    (spec.kind !== 'consumer' && (entry.powered || entry.restartBlocked))
  ) {
    throw new Error('Invalid power device resources');
  }
};

const production = (devices: readonly Device[], phase: DayPhase, transfers: Transfer[]): number => {
  let supply = 0;
  for (const device of devices) {
    const { spec } = device;
    if (!device.enabled) {
      continue;
    }
    if (spec.kind === 'generator' && device.fuelUnits > 0) {
      supply += spec.output;
      transfers.push({ device, perGameMillisecond: -spec.burn, limit: 0 });
    } else if (spec.kind === 'solar') {
      supply += spec.output[phase];
    }
  }
  return supply;
};

// Rates round once per balance, always the same way, so a split at a tick cannot change them.
const storageTransfer = (stores: readonly Store[], remaining: number): Transfer[] => {
  const { efficiency } = POWER_UNITS;
  for (const { device, spec } of stores) {
    if (remaining > 0 && device.storedMicrojoules < spec.capacity) {
      const perGameMillisecond = floorDiv(safe(remaining * spec.charge), efficiency);
      return perGameMillisecond > 0 ? [{ device, perGameMillisecond, limit: spec.capacity }] : [];
    }
    if (remaining < 0 && device.storedMicrojoules > 0) {
      return [{ device, perGameMillisecond: -ceilDiv(safe(-remaining * efficiency), spec.discharge), limit: 0 }];
    }
  }
  return [];
};

export class PowerNetwork {
  private readonly devices = new Map<string, Device>();
  private links: PowerLink[];
  private readonly graph: PowerGraph;
  private atGameMilliseconds: number;
  private readonly phases: readonly { readonly gameMilliseconds: number; readonly phase: DayPhase }[];
  private readonly tickGameMilliseconds: number;
  private readonly startGameMilliseconds: number;
  private readonly clock: ClockSettings;
  private readonly work: PowerWork | undefined;

  constructor(environment: PowerEnvironment, state: unknown, work?: PowerWork) {
    this.work = work;
    const { registry, tuning, cycle, clock } = environment;
    const start = unitCount(clock.start, POWER_UNITS.gameMillisecondsPerGameSecond);
    if (!(Number.isFinite(clock.ratio) && clock.ratio > 0 && start !== undefined && start >= 0)) {
      throw new Error('Invalid power clock');
    }
    this.clock = { ...clock };
    this.startGameMilliseconds = start;
    const tick = unitCount(
      parse(PowerTuningSchema, tuning).tickSimSeconds,
      clock.ratio * POWER_UNITS.gameMillisecondsPerGameSecond,
    );
    if (!tick) {
      throw new Error('Invalid power tuning');
    }
    this.tickGameMilliseconds = tick;
    const saved = parse(PowerStateSchema, state);
    this.atGameMilliseconds = saved.atGameMilliseconds;
    for (const entry of saved.devices) {
      const definition = registry.powerDevices.get(entry.type);
      if (!definition || this.devices.has(entry.id)) {
        throw new Error('Unknown power device type or duplicate identity');
      }
      const spec = specOf(parse(PowerDeviceSchema, definition));
      validateResources(entry, spec);
      this.devices.set(entry.id, { ...entry, spec });
    }
    this.links = this.validateLinks(saved.links);
    this.graph = new PowerGraph(this.wiring(this.links));
    const day = dayPhaseAt(cycle, 0);
    const boundaries = new Map<number, DayPhase>();
    for (const timeOfDay of [0, day.dawn, day.sunrise, day.sunset, day.nightfall].sort((a, b) => a - b)) {
      boundaries.set(
        Math.round(timeOfDay * POWER_UNITS.gameMillisecondsPerGameSecond),
        dayPhaseAt(cycle, timeOfDay).phase,
      );
    }
    this.phases = [...boundaries].map(([gameMilliseconds, phase]) => ({ gameMilliseconds, phase }));
  }

  private validateLinks(links: readonly PowerLink[]): PowerLink[] {
    const usedItems = new Set<number>();
    return links
      .map((link) => {
        if (!(this.devices.has(link.from) && this.devices.has(link.to)) || usedItems.has(link.itemUid)) {
          throw new Error('Invalid power link endpoint or duplicate cable item');
        }
        usedItems.add(link.itemUid);
        return { ...link };
      })
      .sort((a, b) => a.itemUid - b.itemUid);
  }

  private wiring(links: readonly PowerLink[]) {
    return { nodes: [...this.devices.keys()], wires: links.map(({ from, to }) => [from, to] as const) };
  }

  snapshot(): PowerState {
    return {
      atGameMilliseconds: this.atGameMilliseconds,
      devices: [...this.devices.values()]
        .sort((a, b) => compareId(a.id, b.id))
        .map(({ spec: _, ...entry }) => ({ ...entry })),
      links: this.links.map((link) => ({ ...link })),
    };
  }

  tick(): readonly PowerTransition[] {
    return this.run(safe(this.atGameMilliseconds + this.tickGameMilliseconds));
  }

  setEnabled(at: SimTimestamp, id: string, enabled: boolean): readonly PowerTransition[] {
    const device = this.device(id);
    const changes = [...this.advance(at)];
    device.enabled = enabled;
    changes.push(...this.advance(at));
    return changes;
  }

  refuel(at: SimTimestamp, id: string, litres: number): readonly PowerTransition[] {
    const device = this.device(id);
    const units = unitCount(litres, POWER_UNITS.amount);
    if (
      device.spec.kind !== 'generator' ||
      units === undefined ||
      units < 0 ||
      !Number.isSafeInteger(device.fuelUnits + units)
    ) {
      throw new Error('Invalid generator refuelling');
    }
    const changes = [...this.advance(at)];
    device.fuelUnits += units;
    changes.push(...this.advance(at));
    return changes;
  }

  rewire(at: SimTimestamp, links: readonly PowerLink[]): readonly PowerTransition[] {
    const next = this.validateLinks(links.map((link) => parse(LinkSchema, link)));
    const changes = [...this.advance(at)];
    this.graph.replaceWiring(this.wiring(next));
    this.links = next;
    changes.push(...this.advance(at));
    return changes;
  }

  advance(to: SimTimestamp): readonly PowerTransition[] {
    const target = gameMillisecondsAt(this.clock, to);
    if (!Number.isSafeInteger(target) || target < this.atGameMilliseconds) {
      throw new Error('Power time must be finite and monotonic');
    }
    return this.run(target);
  }

  private device(id: string): Device {
    const device = this.devices.get(id);
    if (!device) {
      throw new Error('Unknown power device');
    }
    return device;
  }

  private simAt(gameMilliseconds: number): SimTimestamp {
    return simTimestamp(gameMilliseconds / (this.clock.ratio * POWER_UNITS.gameMillisecondsPerGameSecond));
  }

  private solar(): { phase: DayPhase; next: number } {
    const start = this.startGameMilliseconds;
    const day = floorDiv(start + this.atGameMilliseconds, DAY_MILLISECONDS);
    let phase: DayPhase = 'night';
    let previous = Number.NEGATIVE_INFINITY;
    let next = Number.POSITIVE_INFINITY;
    for (let offset = -1; offset <= 1; offset++) {
      for (const event of this.phases) {
        const at = (day + offset) * DAY_MILLISECONDS + event.gameMilliseconds - start;
        if (at <= this.atGameMilliseconds && at > previous) {
          previous = at;
          ({ phase } = event);
        } else if (at > this.atGameMilliseconds) {
          next = Math.min(next, at);
        }
      }
    }
    return { phase, next };
  }

  private storageAllowed(consumer: Device, stores: readonly Store[]): boolean {
    if (!stores.some(({ device }) => device.storedMicrojoules > 0)) {
      return false;
    }
    return !consumer.restartBlocked || stores.every(({ device, spec }) => device.storedMicrojoules === spec.capacity);
  }

  private remainingWork(id: string): number | undefined {
    const remaining = this.work?.remainingGameMilliseconds(id);
    if (remaining !== undefined && (!Number.isSafeInteger(remaining) || remaining < 0)) {
      throw new Error('Power work must have a nonnegative safe integer remaining duration');
    }
    return remaining;
  }

  private admit(
    devices: readonly Device[],
    stores: readonly Store[],
    supply: number,
    changes: PowerTransition[],
  ): number {
    let remaining = supply;
    for (const consumer of devices) {
      if (consumer.spec.kind !== 'consumer') {
        continue;
      }
      const { demand } = consumer.spec;
      const active = this.remainingWork(consumer.id) !== 0;
      const powered = consumer.enabled && active && (demand <= remaining || this.storageAllowed(consumer, stores));
      if (powered) {
        remaining -= demand;
        consumer.restartBlocked = false;
      } else if (consumer.enabled && active) {
        consumer.restartBlocked = true;
      }
      if (powered !== consumer.powered) {
        consumer.powered = powered;
        changes.push({ at: this.simAt(this.atGameMilliseconds), consumerId: consumer.id, powered });
      }
    }
    return remaining;
  }

  private balance(phase: DayPhase, changes: PowerTransition[]): Transfer[] {
    const transfers: Transfer[] = [];
    for (const component of this.graph.components) {
      const devices = component.map((id) => this.device(id)).sort(priorityOrder);
      const stores = storesOf(devices);
      const supply = production(devices, phase, transfers);
      const remaining = this.admit(devices, stores, supply, changes);
      transfers.push(...storageTransfer(stores, remaining));
    }
    return transfers;
  }

  private integrate(transfers: readonly Transfer[], elapsed: number): void {
    for (const transfer of transfers) {
      const { device } = transfer;
      const value =
        transferDuration(transfer) <= elapsed
          ? transfer.limit
          : resource(device) + transfer.perGameMillisecond * elapsed;
      if (device.spec.kind === 'generator') {
        device.fuelUnits = value;
      } else {
        device.storedMicrojoules = value;
      }
    }
  }

  private run(to: number): readonly PowerTransition[] {
    const changes: PowerTransition[] = [];
    for (;;) {
      const solar = this.solar();
      const transfers = this.balance(solar.phase, changes);
      if (this.atGameMilliseconds === to) {
        return changes;
      }
      let elapsed = Math.min(to, solar.next) - this.atGameMilliseconds;
      for (const transfer of transfers) {
        elapsed = Math.min(elapsed, transferDuration(transfer));
      }
      const served = [...this.devices.values()]
        .filter((device) => device.powered)
        .map((device) => device.id)
        .sort(compareId);
      for (const id of served) {
        const remaining = this.remainingWork(id);
        if (remaining !== undefined) {
          elapsed = Math.min(elapsed, remaining);
        }
      }
      this.integrate(transfers, elapsed);
      this.atGameMilliseconds += elapsed;
      this.work?.settle(elapsed, served);
    }
  }
}
