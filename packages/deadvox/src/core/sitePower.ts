import type { ClockSettings } from './clock.ts';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import type { DayCycle } from './dayPhase.ts';
import { PowerNetwork, type PowerState } from './power.ts';
import { exactUnits, POWER_UNITS } from './powerContent.ts';
import type { FurnitureDef } from './schema.ts';
import { type Placement, placedPieces } from './templates.ts';
import { type SimTimestamp, simTimestamp } from './time.ts';

export interface PlacedPowerDevice {
  readonly type: string;
  readonly pos: Vec3;
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
    .map(({ furniture, pos }) => ({ type: furniture, pos }));

/** Authored building wiring does not depend on which columns have streamed in. */
export class SitePower {
  readonly network: PowerNetwork;
  private readonly lamps: { id: string; pos: Vec3; light: NonNullable<NonNullable<FurnitureDef['power']>['light']> }[] =
    [];

  constructor({
    registry,
    devices,
    clock,
    cycle,
    saved,
  }: {
    registry: Registry;
    devices: readonly PlacedPowerDevice[];
    clock: ClockSettings;
    cycle: DayCycle;
    saved?: PowerState;
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
    this.network = new PowerNetwork(
      {
        registry,
        clock,
        cycle,
        tuning: registry.powerTuning.get(CORE_CONTENT_IDS.powerTuning)!,
      },
      saved ?? initial,
    );
    if (!saved) {
      this.network.advance(simTimestamp(0));
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
