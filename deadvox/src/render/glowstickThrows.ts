import type { ColorRepresentation } from 'three';
import { CapsuleGeometry, Group, Mesh, MeshBasicMaterial, PointLight, Vector3 } from 'three';
import type { Vec3 } from '../core/coords.ts';

const MAX_ACTIVE = 4;
const DURATION = 0.75;
const ARC_HEIGHT = 1.1;
const UP = new Vector3(0, 1, 0);

interface Flight {
  active: boolean;
  age: number;
  readonly start: Vector3;
  readonly end: Vector3;
  readonly direction: Vector3;
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
  readonly light: PointLight;
}

/** Render-only arc for a glowstick already placed at its landing pile by the inventory owner. */
export class GlowstickThrows {
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
    flight.light.color.set(color);
    flight.mesh.visible = true;
    flight.light.visible = true;
    this.drawFlight(flight, 0);
  }

  update(dt: number): void {
    for (const flight of this.flights) {
      if (!flight.active) {
        continue;
      }
      flight.age += dt;
      if (flight.age >= DURATION) {
        flight.active = false;
        flight.mesh.visible = false;
        flight.light.visible = false;
        continue;
      }
      this.drawFlight(flight, flight.age / DURATION);
    }
  }

  get activeCount(): number {
    return this.flights.filter((flight) => flight.active).length;
  }

  dispose(): void {
    for (const flight of this.flights) {
      flight.material.dispose();
      flight.light.dispose();
    }
    this.geometry.dispose();
    this.group.clear();
    this.flights.length = 0;
  }

  private createFlight(): Flight {
    if (this.flights.length >= MAX_ACTIVE) {
      const current = this.flights.find((candidate) => candidate.active);
      if (!current) {
        throw new Error('Glowstick throw pool has no reusable flight');
      }
      current.active = false;
      current.mesh.visible = false;
      current.light.visible = false;
      return current;
    }
    const material = new MeshBasicMaterial({ color: '#b8ff64', toneMapped: false });
    const mesh = new Mesh(this.geometry, material);
    const light = new PointLight('#b8ff64', 1.5, 1.5);
    this.group.add(mesh, light);
    const flight: Flight = {
      active: false,
      age: 0,
      start: new Vector3(),
      end: new Vector3(),
      direction: new Vector3(),
      mesh,
      material,
      light,
    };
    this.flights.push(flight);
    return flight;
  }

  private drawFlight(flight: Flight, progress: number): void {
    const arc = Math.sin(Math.PI * progress) * ARC_HEIGHT;
    flight.mesh.position.lerpVectors(flight.start, flight.end, progress);
    flight.mesh.position.y += arc;
    flight.direction.subVectors(flight.end, flight.start);
    flight.direction.y += (Math.cos(Math.PI * progress) * ARC_HEIGHT * Math.PI) / DURATION;
    flight.mesh.quaternion.setFromUnitVectors(UP, flight.direction.normalize());
    flight.light.position.copy(flight.mesh.position);
  }
}
