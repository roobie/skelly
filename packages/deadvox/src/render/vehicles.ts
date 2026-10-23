import { Group, type Object3D } from 'three';
import type { Registry } from '../core/content.ts';
import type { VehicleInstances } from '../core/vehicleInstances.ts';
import { projectVehicleParts, type VehiclePartProjection } from '../core/vehicleProjection.ts';
import type { ModelLibrary } from './models.ts';

interface RenderedVehicle {
  readonly signature: string;
  readonly group: Group;
}

const signatureOf = (parts: readonly VehiclePartProjection[], modelVersion: number): string =>
  JSON.stringify([
    modelVersion,
    parts.map(({ fittingId, item, model, transform }) => [
      fittingId,
      item.uid,
      item.type,
      item.cargo,
      model,
      transform.position,
      transform.yaw,
      transform.mirror,
    ]),
  ]);

/** Occupied production vehicle parts, grouped per instance so one changed build leaves its neighbours intact. */
export class VehicleMeshes {
  readonly group = new Group();
  private readonly rendered = new Map<number, RenderedVehicle>();
  private readonly registry: Registry;
  private readonly models: ModelLibrary;
  private readonly blockSize: number;

  constructor(registry: Registry, models: ModelLibrary, blockSize: number) {
    this.registry = registry;
    this.models = models;
    this.blockSize = blockSize;
  }

  groupFor(id: number): Object3D | undefined {
    return this.rendered.get(id)?.group;
  }

  sync(vehicles: VehicleInstances): void {
    const live = new Set<number>();
    for (const [id, vehicle] of vehicles.records) {
      live.add(id);
      this.syncVehicle(id, vehicle);
    }
    this.removeMissing(live);
  }

  private syncVehicle(id: number, vehicle: ReturnType<VehicleInstances['get']>): void {
    if (!vehicle) {
      return;
    }
    const parts = projectVehicleParts(this.registry, id, vehicle, this.blockSize);
    const signature = signatureOf(parts, this.models.version);
    const previous = this.rendered.get(id);
    if (previous?.signature === signature) {
      return;
    }
    const group = new Group();
    for (const part of parts) {
      const model = part.model === undefined ? undefined : this.models.part(part.model);
      if (!model) {
        continue;
      }
      model.traverse((object) => {
        object.castShadow = true;
        object.receiveShadow = true;
      });
      const holder = new Group();
      holder.position.set(...part.transform.position);
      holder.rotation.y = part.transform.yaw;
      holder.scale.z = part.transform.mirror ? -1 : 1;
      holder.add(model);
      group.add(holder);
    }
    if (previous) {
      this.group.remove(previous.group);
    }
    this.group.add(group);
    this.rendered.set(id, { signature, group });
  }

  private removeMissing(live: ReadonlySet<number>): void {
    for (const [id, rendered] of this.rendered) {
      if (!live.has(id)) {
        this.group.remove(rendered.group);
        this.rendered.delete(id);
      }
    }
  }

  dispose(): void {
    this.group.clear();
    this.rendered.clear();
  }
}
