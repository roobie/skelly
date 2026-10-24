import type { ModelBox } from '@skelly/thing-core/schema';
import type { Registry } from './content.ts';
import type { VehicleInstances } from './vehicleInstances.ts';
import { projectVehicleParts, type VehiclePartProjection } from './vehicleProjection.ts';

/** Every vehicle's occupied part projections, rebuilt only when the collection's revision changes. */
export class VehicleParts {
  private projected: readonly VehiclePartProjection[] = [];
  private seenVersion = -1;

  private readonly registry: Registry;
  private readonly vehicles: VehicleInstances;
  private readonly blockSize: number;

  constructor(registry: Registry, vehicles: VehicleInstances, blockSize: number) {
    this.registry = registry;
    this.vehicles = vehicles;
    this.blockSize = blockSize;
  }

  all(): readonly VehiclePartProjection[] {
    if (this.seenVersion !== this.vehicles.version) {
      this.projected = [...this.vehicles.records].flatMap(([vehicleId, vehicle]) =>
        projectVehicleParts(this.registry, vehicleId, vehicle, this.blockSize),
      );
      this.seenVersion = this.vehicles.version;
    }
    return this.projected;
  }

  /** One vehicle's part boxes in world metres; none for an unknown vehicle. */
  boxesOf(vehicleId: number): readonly ModelBox[] {
    return this.all()
      .filter((part) => part.vehicleId === vehicleId)
      .flatMap(({ boxes }) => boxes);
  }
}
