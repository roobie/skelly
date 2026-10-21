import {
  array,
  boolean,
  finite,
  type InferOutput,
  integer,
  minValue,
  nonEmpty,
  number,
  parse,
  pipe,
  strictObject,
  string,
} from 'valibot';
import { type ClockSettings, calendarAt, SECONDS_PER_DAY, simToGameHours } from './clock.ts';
import type { Registry } from './content.ts';
import { type DayCycle, type DayPhase, dayPhaseAt } from './dayPhase.ts';
import { type PowerDeviceDef, PowerDeviceSchema, type PowerTuningDef, PowerTuningSchema } from './powerContent.ts';
import { PowerGraph } from './powerGraph.ts';
import { type SimTimestamp, simTimestamp } from './time.ts';

const Amount = pipe(number(), finite(), minValue(0));
const Identity = pipe(string(), nonEmpty());
const DeviceStateSchema = strictObject({
  id: Identity,
  type: Identity,
  enabled: boolean(),
  fuelLitres: Amount,
  storedWh: Amount,
  powered: boolean(),
  restartBlocked: boolean(),
});
const LinkSchema = strictObject({
  from: Identity,
  to: Identity,
  itemUid: pipe(number(), finite(), integer(), minValue(1)),
});
const PowerStateSchema = strictObject({
  atSimSeconds: Amount,
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

interface PowerEnvironment {
  readonly registry: Pick<Registry, 'powerDevices'>;
  readonly tuning: PowerTuningDef;
  readonly cycle: DayCycle;
  readonly clock: ClockSettings;
}

type Device = PowerDeviceState & { readonly definition: PowerDeviceDef };
interface Store {
  readonly device: Device;
  readonly definition: Extract<PowerDeviceDef, { kind: 'battery' }>;
}
interface Transfer {
  readonly device: Device;
  readonly perGameHour: number;
  readonly limit: number;
}

const compareId = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
};
const priorityOrder = (a: Device, b: Device): number =>
  a.definition.priority - b.definition.priority || compareId(a.id, b.id);
const resource = (device: Device): number =>
  device.definition.kind === 'generator' ? device.fuelLitres : device.storedWh;
const transferDuration = (transfer: Transfer, hoursPerSecond: number): number =>
  (transfer.limit - resource(transfer.device)) / (transfer.perGameHour * hoursPerSecond);
const storesOf = (devices: readonly Device[]): Store[] =>
  devices.flatMap((device) =>
    device.enabled && device.definition.kind === 'battery' ? [{ device, definition: device.definition }] : [],
  );

const validateResources = (entry: PowerDeviceState, definition: PowerDeviceDef): void => {
  if (
    (definition.kind !== 'generator' && entry.fuelLitres !== 0) ||
    (definition.kind !== 'battery' && entry.storedWh !== 0) ||
    (definition.kind === 'battery' && entry.storedWh > definition.capacityWh) ||
    (definition.kind !== 'consumer' && (entry.powered || entry.restartBlocked))
  ) {
    throw new Error('Invalid power device resources');
  }
};

const production = (devices: readonly Device[], phase: DayPhase, transfers: Transfer[]): number => {
  let supply = 0;
  for (const device of devices) {
    const def = device.definition;
    if (!device.enabled) {
      continue;
    }
    if (def.kind === 'generator' && device.fuelLitres > 0) {
      supply += def.outputWatts;
      transfers.push({ device, perGameHour: -def.burnLitresPerGameHour, limit: 0 });
    } else if (def.kind === 'solar') {
      supply += def.outputWatts[phase];
    }
  }
  return supply;
};

const storageTransfer = (stores: readonly Store[], remaining: number): Transfer[] => {
  for (const { device, definition } of stores) {
    if (remaining > 0 && device.storedWh < definition.capacityWh) {
      return [{ device, perGameHour: remaining * definition.chargeEfficiency, limit: definition.capacityWh }];
    }
    if (remaining < 0 && device.storedWh > 0) {
      return [{ device, perGameHour: remaining / definition.dischargeEfficiency, limit: 0 }];
    }
  }
  return [];
};

export class PowerNetwork {
  private readonly devices = new Map<string, Device>();
  private links: PowerLink[];
  private readonly graph: PowerGraph;
  private atSimSeconds: SimTimestamp;
  private readonly phases: readonly { readonly gameTimeOfDay: number; readonly phase: DayPhase }[];
  private readonly tuning: PowerTuningDef;
  private readonly clock: ClockSettings;

  constructor(environment: PowerEnvironment, state: unknown) {
    const { registry, tuning, cycle, clock } = environment;
    if (!(Number.isFinite(clock.ratio) && clock.ratio > 0 && Number.isFinite(clock.start) && clock.start >= 0)) {
      throw new Error('Invalid power clock');
    }
    this.tuning = parse(PowerTuningSchema, tuning);
    this.clock = { ...clock };
    const saved = parse(PowerStateSchema, state);
    this.atSimSeconds = simTimestamp(saved.atSimSeconds);
    for (const entry of saved.devices) {
      const definition = registry.powerDevices.get(entry.type);
      if (!definition || this.devices.has(entry.id)) {
        throw new Error('Unknown power device type or duplicate identity');
      }
      const parsed = parse(PowerDeviceSchema, definition);
      validateResources(entry, parsed);
      this.devices.set(entry.id, { ...entry, definition: parsed });
    }
    this.links = this.validateLinks(saved.links);
    this.graph = new PowerGraph(this.wiring(this.links));
    const day = dayPhaseAt(cycle, 0);
    this.phases = [...new Set([0, day.dawn, day.sunrise, day.sunset, day.nightfall])]
      .sort((a, b) => a - b)
      .map((timeOfDay) => ({ gameTimeOfDay: timeOfDay, phase: dayPhaseAt(cycle, timeOfDay).phase }));
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
      atSimSeconds: this.atSimSeconds,
      devices: [...this.devices.values()]
        .sort((a, b) => compareId(a.id, b.id))
        .map(({ definition: _, ...entry }) => ({ ...entry })),
      links: this.links.map((link) => ({ ...link })),
    };
  }

  tick(): readonly PowerTransition[] {
    return this.advance(simTimestamp(this.atSimSeconds + this.tuning.tickSimSeconds));
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
    if (
      device.definition.kind !== 'generator' ||
      !Number.isFinite(litres) ||
      litres < 0 ||
      !Number.isFinite(device.fuelLitres + litres)
    ) {
      throw new Error('Invalid generator refuelling');
    }
    const changes = [...this.advance(at)];
    device.fuelLitres += litres;
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

  private device(id: string): Device {
    const device = this.devices.get(id);
    if (!device) {
      throw new Error('Unknown power device');
    }
    return device;
  }

  private solar(): { phase: DayPhase; next: number } {
    const day = Math.floor(calendarAt(this.clock, this.atSimSeconds) / SECONDS_PER_DAY);
    let phase: DayPhase = 'night';
    let previous = Number.NEGATIVE_INFINITY;
    let next = Number.POSITIVE_INFINITY;
    // Compare in simulation time, avoiding a lossy reverse conversion at phase boundaries.
    for (let offset = -1; offset <= 1; offset++) {
      for (const event of this.phases) {
        const at = ((day + offset) * SECONDS_PER_DAY + event.gameTimeOfDay - this.clock.start) / this.clock.ratio;
        if (at <= this.atSimSeconds && at > previous) {
          previous = at;
          ({ phase } = event);
        } else if (at > this.atSimSeconds) {
          next = Math.min(next, at);
        }
      }
    }
    return { phase, next };
  }

  private storageAllowed(consumer: Device, stores: readonly Store[]): boolean {
    if (!stores.some(({ device }) => device.storedWh > 0)) {
      return false;
    }
    return (
      !consumer.restartBlocked || stores.every(({ device, definition }) => device.storedWh === definition.capacityWh)
    );
  }

  private admit(
    devices: readonly Device[],
    stores: readonly Store[],
    supply: number,
    changes: PowerTransition[],
  ): number {
    let remaining = supply;
    for (const consumer of devices) {
      if (consumer.definition.kind !== 'consumer') {
        continue;
      }
      const demand = consumer.definition.demandWatts;
      const powered = consumer.enabled && (demand <= remaining || this.storageAllowed(consumer, stores));
      if (powered) {
        remaining -= demand;
        consumer.restartBlocked = false;
      } else if (consumer.enabled) {
        consumer.restartBlocked = true;
      }
      if (powered !== consumer.powered) {
        consumer.powered = powered;
        changes.push({ at: this.atSimSeconds, consumerId: consumer.id, powered });
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

  private integrate(transfers: readonly Transfer[], elapsed: number, hoursPerSecond: number): void {
    for (const transfer of transfers) {
      const { device } = transfer;
      const value =
        transferDuration(transfer, hoursPerSecond) <= elapsed
          ? transfer.limit
          : resource(device) + transfer.perGameHour * hoursPerSecond * elapsed;
      if (device.definition.kind === 'generator') {
        device.fuelLitres = value;
      } else {
        device.storedWh = value;
      }
    }
  }

  advance(to: SimTimestamp): readonly PowerTransition[] {
    if (!Number.isFinite(to) || to < this.atSimSeconds) {
      throw new Error('Power time must be finite and monotonic');
    }
    const changes: PowerTransition[] = [];
    for (;;) {
      const solar = this.solar();
      const transfers = this.balance(solar.phase, changes);
      if (this.atSimSeconds === to) {
        return changes;
      }
      let elapsed = Math.min(to, solar.next) - this.atSimSeconds;
      const hoursPerSecond = simToGameHours(this.clock, 1);
      for (const transfer of transfers) {
        elapsed = Math.min(elapsed, transferDuration(transfer, hoursPerSecond));
      }
      // A sub-ULP resource event still settles its boundary, without inventing elapsed time.
      this.integrate(transfers, elapsed, hoursPerSecond);
      this.atSimSeconds = simTimestamp(this.atSimSeconds + elapsed);
    }
  }
}
