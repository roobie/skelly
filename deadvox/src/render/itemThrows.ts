import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { PILE_GRID } from '../core/inventory.ts';
import { cellCount, defOf, type Item } from '../core/items.ts';
import { ITEM_ARC_HEIGHT_METRES, ITEM_FLIGHT_SECONDS, itemFlightPoint } from '../core/itemThrow.ts';
import { PILE_DISPLAY_KIND } from '../core/schema.ts';
import { placeholderCaseMesh } from './caseVisual.ts';
import { withHeightFog } from './heightFog.ts';
import { itemLook } from './itemLook.ts';
import type { ModelLibrary } from './models.ts';

const MAX_ACTIVE = 4;
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);

interface Flight {
  active: boolean;
  age: number;
  readonly start: Vector3;
  readonly end: Vector3;
  readonly direction: Vector3;
  readonly group: Group;
  readonly bundle: Mesh;
  readonly emissive: Mesh;
  readonly emissiveMaterial: MeshBasicMaterial;
  modelVisual: boolean;
}

/** Render-only arc for an item already placed at its landing pile by the inventory owner. */
export class ItemThrows {
  readonly group = new Group();
  private readonly flights: Flight[] = [];
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly bundleMaterial = withHeightFog(new MeshLambertMaterial({ color: 0x5a_50_46 }), 'piles');
  private readonly models: Pick<ModelLibrary, 'groundLook'> | undefined;
  private readonly registry: Registry;
  private readonly blockSize: number;

  constructor(registry: Registry, models?: Pick<ModelLibrary, 'groundLook'>, blockSize = 1) {
    this.registry = registry;
    this.models = models;
    this.blockSize = blockSize;
  }

  spawn(from: Vec3, to: Vec3, item: Item): void {
    const flight = this.flights.find((candidate) => !candidate.active) ?? this.createFlight();
    flight.active = true;
    flight.age = 0;
    flight.start.set(...from);
    flight.end.set(...to);
    flight.group.clear();
    flight.modelVisual = false;
    flight.emissive.visible = false;

    const definition = defOf(this.registry, item.type);
    const look = itemLook(this.registry, item);
    const model = look ? this.models?.groundLook(look) : undefined;
    if (look && model) {
      model.name = look.key;
      flight.modelVisual = true;
      flight.group.add(model);
    } else if (definition.pileDisplay === PILE_DISPLAY_KIND.scatter) {
      flight.group.add(placeholderCaseMesh());
    } else {
      // Match PileMeshes' unmodeled-item fallback: a low, neutral bundle sized from item cells.
      const capacity = PILE_GRID.w * PILE_GRID.h;
      const height = 0.06 + 0.18 * Math.min(1, cellCount(definition) / capacity);
      flight.bundle.scale.set(this.blockSize * 0.7, height, this.blockSize * 0.7);
      flight.group.add(flight.bundle);
    }

    const { light } = definition;
    if (item.on && light?.emissive !== undefined && light.burning?.drop === 'stay') {
      flight.emissiveMaterial.color.set(new Color(light.color).multiplyScalar(light.emissive));
      flight.emissive.scale.set(this.blockSize * 0.36, this.blockSize * 0.06, this.blockSize * 0.06);
      flight.emissive.position.y = this.blockSize * 0.15;
      flight.emissive.visible = true;
      flight.group.add(flight.emissive);
    }

    flight.group.visible = true;
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
        flight.group.visible = false;
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
      flight.emissiveMaterial.dispose();
    }
    this.bundleMaterial.dispose();
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
      current.group.visible = false;
      current.group.clear();
      return current;
    }
    const group = new Group();
    const bundle = new Mesh(this.geometry, this.bundleMaterial);
    const emissiveMaterial = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const emissive = new Mesh(this.geometry, emissiveMaterial);
    const flight: Flight = {
      active: false,
      age: 0,
      start: new Vector3(),
      end: new Vector3(),
      direction: new Vector3(),
      group,
      bundle,
      emissive,
      emissiveMaterial,
      modelVisual: false,
    };
    this.flights.push(flight);
    this.group.add(group);
    return flight;
  }

  private drawFlight(flight: Flight, progress: number): void {
    const point = itemFlightPoint(flight.start.toArray() as Vec3, flight.end.toArray() as Vec3, progress);
    flight.group.position.set(...point);
    flight.direction.subVectors(flight.end, flight.start);
    flight.direction.y += (Math.cos(Math.PI * progress) * ITEM_ARC_HEIGHT_METRES * Math.PI) / ITEM_FLIGHT_SECONDS;
    flight.group.quaternion.setFromUnitVectors(flight.modelVisual ? RIGHT : UP, flight.direction.normalize());
  }
}
