import { BatteryChargers, type ChargerEndpoint } from './batteryChargers.ts';
import type { BlockEntity, EntitySpec } from './blockEntities.ts';
import { claimed } from './capabilities.ts';
import type { ClockSettings } from './clock.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { DayCycle } from './dayPhase.ts';
import type { Inventory } from './inventory.ts';
import { rotatedPoint, rotatedSize, rotationOf } from './orientation.ts';
import { PowerNetwork, type PowerState } from './power.ts';
import { exactUnits, POWER_UNITS } from './powerContent.ts';
import { type Placement, placedPieces } from './templates.ts';
import { type SimTimestamp, simTimestamp } from './time.ts';

export interface PlacedPowerDevice {
  readonly type: string;
  readonly pos: Vec3;
  readonly entitySpec?: EntitySpec;
}

export interface PoweredLight {
  readonly pos: Vec3;
  readonly color: string;
  readonly intensity: number;
  readonly radius: number;
  /** The cells of the fixture's own body, which never stop its light (`illumination.ts`, `reaches`). */
  readonly body?: { readonly min: Vec3; readonly max: Vec3 };
}

const identity = ({ type, pos }: PlacedPowerDevice): string => `${type}:${pos.join(',')}`;

/** The one place a fixture's light position is worked out, so the renderer and the rules cannot disagree on it. */
const emitterOf = (device: PlacedPowerDevice, size: Readonly<Vec3>, [x, y, z]: Readonly<Vec3> = [0, 0, 0]): Vec3 => {
  const local: Vec3 = [x + 0.5, y + 0.5, z + 0.5];
  const turned = rotatedPoint(local, size, rotationOf(device.entitySpec ?? { facing: 'n' }));
  return turned.map((value, axis) => value + device.pos[axis]!) as Vec3;
};

export const placedPowerDevices = (registry: Registry, placements: readonly Placement[]): PlacedPowerDevice[] =>
  placements
    .flatMap(placedPieces)
    .filter(({ furniture }) => registry.furniture.get(furniture)?.power !== undefined)
    .map(({ furniture, pos, size, facing, fixed }) => ({
      type: furniture,
      pos,
      entitySpec: { type: furniture, pos, size, facing, ...(fixed ? { fixed } : {}) },
    }));

/** Authored building wiring does not depend on which columns have streamed in. */
export class SitePower {
  private readonly registry: Registry;
  readonly network: PowerNetwork;
  readonly chargers: BatteryChargers | undefined;
  private readonly chargerIds = new Map<number, string>();
  private readonly lamps: { id: string; light: PoweredLight }[] = [];

  constructor({
    registry,
    devices,
    clock,
    cycle,
    saved,
    inventory,
  }: {
    registry: Registry;
    devices: readonly PlacedPowerDevice[];
    clock: ClockSettings;
    cycle: DayCycle;
    saved?: PowerState;
    inventory?: Inventory;
  }) {
    this.registry = registry;
    const states = devices.map((device) => {
      const def = registry.furniture.get(device.type)!;
      const spec = def.power!;
      const id = identity(device);
      if (spec.light) {
        const { offset, ...shine } = spec.light;
        const size = rotatedSize(def.size, rotationOf(device.entitySpec ?? { facing: 'n' }));
        const body = { min: device.pos, max: device.pos.map((value, axis) => value + size[axis]!) as Vec3 };
        this.lamps.push({ id, light: { pos: emitterOf(device, def.size, offset), body, ...shine } });
      }
      return {
        id,
        type: spec.device,
        enabled: spec.enabled,
        fuelUnits: exactUnits(spec.fuelLitres, POWER_UNITS.amount),
        storedMicrojoules: 0,
        powered: false,
        restartBlocked: false,
      };
    });
    const kind = (device: (typeof states)[number]) => registry.powerDevices.get(device.type)!.kind;
    const sources = states.filter((device) => !['consumer', 'switch'].includes(kind(device)));
    const switches = states.filter((device) => kind(device) === 'switch');
    const consumers = states.filter((device) => kind(device) === 'consumer');
    const wires: [string, string][] = [];
    const [source] = sources;
    if (source) {
      wires.push(...sources.slice(1).map((device): [string, string] => [source.id, device.id]));
      let bus = source.id;
      for (const control of switches) {
        wires.push([bus, control.id]);
        bus = control.id;
      }
      wires.push(...consumers.map((device): [string, string] => [bus, device.id]));
    }
    const initial: PowerState = {
      atGameMilliseconds: 0,
      devices: states,
      links: wires.map(([from, to], index) => ({ from, to, itemUid: index + 1 })),
    };
    const state = saved ?? initial;
    const endpoints = devices
      .filter((device) => registry.furniture.get(device.type)!.charger)
      .flatMap((device) => this.bindCharger(device, inventory, state, saved !== undefined));
    const environment = { registry, clock, cycle, tuning: claimed(registry.powerTuning, 'power')! };
    this.chargers = inventory ? new BatteryChargers(inventory, environment, state, endpoints) : undefined;
    this.network = this.chargers?.network ?? new PowerNetwork(environment, state);
    if (!saved) {
      this.network.advance(simTimestamp(0));
    }
  }

  private bindCharger(
    device: PlacedPowerDevice,
    inventory: Inventory | undefined,
    state: PowerState,
    restoring: boolean,
  ): ChargerEndpoint[] {
    if (!inventory) {
      throw new Error('Placed chargers require inventory ownership');
    }
    const id = identity(device);
    let entity = [...inventory.entities.records].find(
      (piece) => piece.type === device.type && piece.origin.every((value, axis) => value === device.pos[axis]),
    );
    if (!(restoring || entity)) {
      if (!device.entitySpec) {
        throw new Error('Placed charger requires authored geometry');
      }
      entity = inventory.entities.add(device.entitySpec);
    }
    if (!state.devices.some((entry) => entry.id === id)) {
      return [];
    }
    if (!entity || entity.carried) {
      throw new Error('Placed charger endpoint has no standing entity');
    }
    this.chargerIds.set(entity.uid, id);
    return [{ consumerId: id, entityUid: entity.uid }];
  }

  control(entity: BlockEntity): { id: string; enabled: boolean } | undefined {
    if (entity.carried) {
      return undefined;
    }
    const id = identity({ type: entity.type, pos: entity.origin });
    const power = this.registry.furniture.get(entity.type)?.power;
    const kind = power && this.registry.powerDevices.get(power.device)!.kind;
    const enabled = this.network.enabled(id);
    return enabled !== undefined && (kind === 'generator' || kind === 'switch') ? { id, enabled } : undefined;
  }

  chargerId(entity: BlockEntity): string | undefined {
    return this.chargerIds.get(entity.uid);
  }

  beforeRemove(at: SimTimestamp, entity: BlockEntity): void {
    const id = this.chargerIds.get(entity.uid);
    if (id !== undefined) {
      this.chargers!.beforeRemove(at, id);
      this.chargerIds.delete(entity.uid);
      return;
    }
    const deviceId = identity({ type: entity.type, pos: entity.origin });
    if (this.network.enabled(deviceId) !== undefined) {
      this.network.setEnabled(at, deviceId, false);
    }
  }

  advance(at: SimTimestamp): void {
    this.network.advance(at);
  }

  isPowered(device: PlacedPowerDevice): boolean {
    return this.network.isPowered(identity(device));
  }

  lights(): PoweredLight[] {
    return this.lamps.filter(({ id }) => this.network.isPowered(id)).map(({ light }) => light);
  }
}
