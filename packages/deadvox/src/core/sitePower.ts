import { BatteryChargers, type ChargerEndpoint } from './batteryChargers.ts';
import type { BlockEntity, EntitySpec } from './blockEntities.ts';
import type { ClockSettings } from './clock.ts';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import type { DayCycle } from './dayPhase.ts';
import type { Inventory } from './inventory.ts';
import { PowerNetwork, type PowerState } from './power.ts';
import { exactUnits, POWER_UNITS } from './powerContent.ts';
import type { FurnitureDef } from './schema.ts';
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
}

const identity = ({ type, pos }: PlacedPowerDevice): string => `${type}:${pos.join(',')}`;

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
  readonly network: PowerNetwork;
  readonly chargers: BatteryChargers | undefined;
  private readonly chargerIds = new Map<number, string>();
  private readonly lamps: { id: string; pos: Vec3; light: NonNullable<NonNullable<FurnitureDef['power']>['light']> }[] =
    [];

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
    const states = devices.map((device) => {
      const spec = registry.furniture.get(device.type)!.power!;
      const id = identity(device);
      if (spec.light) {
        this.lamps.push({ id, pos: device.pos, light: spec.light });
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
    const [first] = states;
    const initial: PowerState = {
      atGameMilliseconds: 0,
      devices: states,
      links: first
        ? states.slice(1).map((device, index) => ({ from: first.id, to: device.id, itemUid: index + 1 }))
        : [],
    };
    const state = saved ?? initial;
    const endpoints = devices
      .filter((device) => registry.furniture.get(device.type)!.charger)
      .flatMap((device) => this.bindCharger(device, inventory, state, saved !== undefined));
    const environment = { registry, clock, cycle, tuning: registry.powerTuning.get(CORE_CONTENT_IDS.powerTuning)! };
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

  chargerId(entity: BlockEntity): string | undefined {
    return this.chargerIds.get(entity.uid);
  }

  beforeRemove(at: SimTimestamp, entity: BlockEntity): void {
    const id = this.chargerIds.get(entity.uid);
    if (id !== undefined) {
      this.chargers!.beforeRemove(at, id);
      this.chargerIds.delete(entity.uid);
    }
  }

  advance(at: SimTimestamp): void {
    this.network.advance(at);
  }

  isPowered(device: PlacedPowerDevice): boolean {
    return this.network.isPowered(identity(device));
  }

  lights(): PoweredLight[] {
    return this.lamps.filter(({ id }) => this.network.isPowered(id)).map(({ pos, light }) => ({ pos, ...light }));
  }
}
