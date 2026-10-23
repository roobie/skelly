import { batteryCapacityMicrojoules, batteryEnergy } from './battery.ts';
import type { BlockEntity } from './blockEntities.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory, Plan, Target } from './inventory.ts';
import type { Item } from './items.ts';
import { type PowerEnvironment, PowerNetwork, type PowerState, type PowerWork } from './power.ts';
import { exactUnits, POWER_UNITS } from './powerContent.ts';
import type { SimTimestamp } from './time.ts';

type StartResult = { ok: true } | { ok: false; reason: string };

export interface ChargerEndpoint {
  readonly consumerId: string;
  readonly entityUid: number;
}

/** Item effects belong here; dispatch and elapsed-service boundaries belong to PowerNetwork. */
export class BatteryChargers implements PowerWork {
  readonly network: PowerNetwork;
  private atGameMilliseconds: number;
  private readonly endpoints = new Map<string, number>();
  private readonly inventory: Inventory;

  constructor(
    inventory: Inventory,
    environment: PowerEnvironment,
    state: PowerState,
    endpoints: readonly ChargerEndpoint[],
  ) {
    this.inventory = inventory;
    this.atGameMilliseconds = state.atGameMilliseconds;
    const uids = new Set<number>();
    for (const { consumerId, entityUid } of endpoints) {
      const entity = inventory.entities.byUid(entityUid);
      const furniture = entity && inventory.registry.furniture.get(entity.type);
      const device = state.devices.find(({ id }) => id === consumerId);
      if (
        !(entity && furniture?.charger && device) ||
        device.type !== furniture.power?.device ||
        environment.registry.powerDevices.get(device.type)?.kind !== 'consumer' ||
        this.endpoints.has(consumerId) ||
        uids.has(entityUid)
      ) {
        throw new Error('Invalid charger endpoint');
      }
      this.endpoints.set(consumerId, entityUid);
      uids.add(entityUid);
    }
    for (const entity of inventory.entities.records) {
      if (
        entity.charging &&
        (!uids.has(entity.uid) ||
          entity.charging.atGameMilliseconds !== this.atGameMilliseconds ||
          this.remaining(entity) <= 0)
      ) {
        throw new Error('Saved charger and power must share an active settlement boundary');
      }
    }
    this.network = new PowerNetwork(environment, state, this);
  }

  private entity(consumerId: string): BlockEntity | undefined {
    const uid = this.endpoints.get(consumerId);
    return uid === undefined ? undefined : this.inventory.entities.byUid(uid);
  }

  private battery(entity: BlockEntity): Item | undefined {
    const spec = this.inventory.registry.furniture.get(entity.type)!.charger!;
    const grid = entity.pockets?.[spec.pocket];
    return grid?.length === 1 && grid[0]!.item.count === 1 ? grid[0]!.item : undefined;
  }

  private rate(entity: BlockEntity): number {
    const furniture = this.inventory.registry.furniture.get(entity.type)!;
    const device = this.inventory.registry.powerDevices.get(furniture.power!.device)!;
    if (device.kind !== 'consumer') {
      throw new Error('Charger needs a consumer');
    }
    const rate = exactUnits(device.demandWatts, POWER_UNITS.rate) * furniture.charger!.efficiency;
    if (!Number.isSafeInteger(rate) || rate <= 0) {
      throw new Error('Charger needs an exact positive energy rate');
    }
    return rate;
  }

  private remaining(entity: BlockEntity): number {
    const item = this.battery(entity);
    if (!item || item.uid !== entity.charging?.batteryUid || entity.carried) {
      throw new Error('Charger lost its owned battery');
    }
    return Math.ceil(
      (batteryCapacityMicrojoules(this.inventory.registry, item.type)! - batteryEnergy(this.inventory.registry, item)) /
        this.rate(entity),
    );
  }

  remainingGameMilliseconds(consumerId: string): number | undefined {
    if (!this.endpoints.has(consumerId)) {
      return undefined;
    }
    const entity = this.entity(consumerId);
    return entity?.charging ? this.remaining(entity) : 0;
  }

  settle(elapsed: number, served: readonly string[]): void {
    this.atGameMilliseconds += elapsed;
    for (const id of [...this.endpoints.keys()].sort()) {
      const entity = this.entity(id);
      if (!entity?.charging) {
        continue;
      }
      entity.charging.atGameMilliseconds = this.atGameMilliseconds;
      if (!served.includes(id)) {
        continue;
      }
      const battery = this.battery(entity)!;
      const capacity = batteryCapacityMicrojoules(this.inventory.registry, battery.type)!;
      // BigInt bounds the intermediate product even for a safe-integer absence; only bounded energy is saved.
      battery.batteryMicrojoules = Number(
        [
          BigInt(capacity),
          BigInt(batteryEnergy(this.inventory.registry, battery)) + BigInt(elapsed) * BigInt(this.rate(entity)),
        ].reduce((a, b) => (a < b ? a : b)),
      );
      battery.charges = undefined;
      if (battery.batteryMicrojoules === capacity) {
        entity.charging = undefined;
      }
      this.inventory.version += 1;
    }
  }

  /** Loading uses the ordinary move admission, including reach and stack splitting. */
  start(at: SimTimestamp, consumerId: string, battery: Item): StartResult {
    this.network.advance(at);
    const entity = this.entity(consumerId);
    if (!entity || entity.carried || !this.inventory.canReachEntity(entity)) {
      return { ok: false, reason: coreMessage(this.inventory.registry, 'tooFar') };
    }
    const spec = this.inventory.registry.furniture.get(entity.type)!.charger!;
    if (entity.charging || (entity.pockets?.[spec.pocket]?.length && this.battery(entity) !== battery)) {
      return { ok: false, reason: coreMessage(this.inventory.registry, 'inWork') };
    }
    if (!spec.batteries.includes(battery.type)) {
      return { ok: false, reason: coreMessage(this.inventory.registry, 'wrongBattery') };
    }
    const energy = batteryEnergy(this.inventory.registry, battery);
    const capacity = batteryCapacityMicrojoules(this.inventory.registry, battery.type)!;
    if (!Number.isSafeInteger(energy) || energy < 0 || energy >= capacity) {
      return { ok: false, reason: coreMessage(this.inventory.registry, 'wrongBattery') };
    }
    const plan: StartResult =
      this.battery(entity) === battery
        ? { ok: true }
        : this.inventory.move(battery, { kind: 'furniture', entity, pocket: spec.pocket }, 1);
    if (!plan.ok) {
      return plan;
    }
    const owned = this.battery(entity)!;
    owned.batteryMicrojoules = energy;
    owned.charges = undefined;
    entity.charging = { batteryUid: owned.uid, atGameMilliseconds: this.atGameMilliseconds };
    this.network.advance(at);
    return { ok: true };
  }

  stop(at: SimTimestamp, consumerId: string): boolean {
    this.network.advance(at);
    const entity = this.entity(consumerId);
    if (!(entity && this.inventory.canReachEntity(entity))) {
      return false;
    }
    entity.charging = undefined;
    this.inventory.version += 1;
    this.network.advance(at);
    return true;
  }

  collect(at: SimTimestamp, consumerId: string, target: Target): Plan {
    this.network.advance(at);
    const entity = this.entity(consumerId);
    const battery = entity && this.battery(entity);
    if (!entity || entity.charging || !battery) {
      return { ok: false, reason: coreMessage(this.inventory.registry, 'inWork') };
    }
    return this.inventory.move(battery, target);
  }

  /** Lifecycle callers settle before removal; the existing ruin/drop path still owns every pocket item. */
  beforeRemove(at: SimTimestamp, consumerId: string): void {
    this.network.advance(at);
    const entity = this.entity(consumerId);
    if (entity) {
      entity.charging = undefined;
    }
    if (this.endpoints.has(consumerId)) {
      this.network.removeConsumer(at, consumerId);
      this.endpoints.delete(consumerId);
    }
  }
}
