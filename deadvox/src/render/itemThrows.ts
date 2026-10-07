import type { ColorRepresentation } from 'three';
import { CapsuleGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Vec3 } from '../core/coords.ts';
import { ITEM_ARC_HEIGHT_METRES, ITEM_FLIGHT_SECONDS, itemFlightPoint } from '../core/itemThrow.ts';

const MAX_ACTIVE = 4;
const UP = new Vector3(0, 1, 0);

interface Flight {
  active: boolean;
  age: number;
  readonly start: Vector3;
  readonly end: Vector3;
  readonly direction: Vector3;
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
}

/** Render-only arc for an item already placed at its landing pile by the inventory owner. */
export class ItemThrows {
  readonly group = new Group();
  private readonly flights: Flight[] = [];
  private readonly geometry = new CapsuleGeometry(0.025, 0.12, 2, 6);

  spawn(from: Vec3, to: Vec3, color: ColorRepresentation): void {
    const flight = this.flights.find((candidate) => !candidate.active) ?? this.createFlight();
    flight.active = true;
    flight.age = 0;
    flight.start.set(...from);
    flight.end.set(...to);
    flight.material.color.set(color);
    flight.mesh.visible = true;
    this.drawFlight(flight, 0);
  }

  update(dt: number): void {
    for (const flight of this.flights) {
      if (!flight.active) {
        continue;
      }
      flight.age += dt;
      if (flight.age >= ITEM_FLIGHT_SECONDS) {
        flight.active = false;
        flight.mesh.visible = false;
        continue;
      }
      this.drawFlight(flight, flight.age / ITEM_FLIGHT_SECONDS);
    }
  }

  get activeCount(): number {
    return this.flights.filter((flight) => flight.active).length;
  }

  dispose(): void {
    for (const flight of this.flights) {
      flight.material.dispose();
    }
    this.geometry.dispose();
    this.group.clear();
    this.flights.length = 0;
  }

  private createFlight(): Flight {
    if (this.flights.length >= MAX_ACTIVE) {
      const current = this.flights.find((candidate) => candidate.active);
      if (!current) {
        throw new Error('Item throw pool has no reusable flight');
      }
      current.active = false;
      current.mesh.visible = false;
      return current;
    }
    const material = new MeshBasicMaterial({ color: '#d8d0c4', toneMapped: false });
    const mesh = new Mesh(this.geometry, material);
    this.group.add(mesh);
    const flight: Flight = {
      active: false,
      age: 0,
      start: new Vector3(),
      end: new Vector3(),
      direction: new Vector3(),
      mesh,
      material,
    };
    this.flights.push(flight);
    return flight;
  }

  private drawFlight(flight: Flight, progress: number): void {
    const point = itemFlightPoint(flight.start.toArray() as Vec3, flight.end.toArray() as Vec3, progress);
    flight.mesh.position.set(...point);
    flight.direction.subVectors(flight.end, flight.start);
    flight.direction.y +=
      (Math.cos(Math.PI * progress) * ITEM_ARC_HEIGHT_METRES * Math.PI) / ITEM_FLIGHT_SECONDS;
    flight.mesh.quaternion.setFromUnitVectors(UP, flight.direction.normalize());
  }
}
