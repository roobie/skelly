import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Pile, Spot } from '../core/inventory.ts';
import { PILE_GRID } from '../core/inventory.ts';
import { cellCount, defOf, type Item } from '../core/items.ts';
import { ITEM_ARC_HEIGHT_METRES, ITEM_FLIGHT_SECONDS, itemFlightPoint } from '../core/itemThrow.ts';
import { pileItemPosition } from '../core/pileLayout.ts';
import { PILE_DISPLAY_KIND } from '../core/schema.ts';
import { placeholderCaseMesh } from './caseVisual.ts';
import { withHeightFog } from './heightFog.ts';
import { applyItemEmissive, disposeItemEmissiveMaterials } from './itemEmissive.ts';
import { itemLook } from './itemLook.ts';
import type { ModelLibrary } from './models.ts';

const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);

interface Flight {
  active: boolean;
  itemUid: number;
  startedAtSimSeconds: number;
  landingAt: number;
  readonly start: Vector3;
  readonly end: Vector3;
  readonly direction: Vector3;
  readonly group: Group;
  readonly bundle: Mesh;
  readonly emissive: Mesh;
  readonly emissiveMaterial: MeshBasicMaterial;
  modelVisual: boolean;
}

/** Render-only arc following the inventory item's saved simulation landing. */
export class ItemThrows {
  readonly group = new Group();
  private readonly flights: Flight[] = [];
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly bundleMaterial = withHeightFog(new MeshLambertMaterial({ color: 0x5a_50_46 }), 'piles');
  private readonly models: Pick<ModelLibrary, 'groundLook' | 'has'> | undefined;
  private readonly registry: Registry;
  private readonly blockSize: number;

  constructor(registry: Registry, models?: Pick<ModelLibrary, 'groundLook' | 'has'>, blockSize = 1) {
    this.registry = registry;
    this.models = models;
    this.blockSize = blockSize;
  }

  spawn(
    {
      origin: from,
      landing: to,
      item,
      startedAtSimSeconds = 0,
      landingAt = ITEM_FLIGHT_SECONDS,
      targetPos,
      targetSpot,
      mergeUid,
    }: {
      origin: Vec3;
      landing: Vec3;
      item: Item;
      startedAtSimSeconds?: number;
      landingAt?: number;
      targetPos?: Vec3;
      targetSpot?: Spot;
      mergeUid?: number;
    },
    pile?: Pile,
  ): void {
    const flight = this.flights.find((candidate) => !candidate.active) ?? this.createFlight();
    flight.active = true;
    flight.itemUid = item.uid;
    flight.startedAtSimSeconds = startedAtSimSeconds;
    flight.landingAt = landingAt;
    flight.start.set(...from);
    const destination =
      pile && targetPos && targetSpot
        ? (pileItemPosition(this.registry, pile, mergeUid ?? item.uid, {
            blockSize: this.blockSize,
            hasModel: (id) => this.models?.has(id) ?? false,
          }) ?? to)
        : to;
    flight.end.set(...destination);
    disposeItemEmissiveMaterials(flight.group);
    flight.group.clear();
    flight.modelVisual = false;
    flight.emissive.visible = false;

    const definition = defOf(this.registry, item.type);
    const look = itemLook(this.registry, item);
    const model = look ? this.models?.groundLook(look) : undefined;
    if (look && model) {
      model.name = look.key;
      applyItemEmissive(
        model,
        item,
        definition,
        definition.model ? this.registry.models.get(definition.model) : undefined,
      );
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
    if (!flight.modelVisual && item.on && light?.emissive !== undefined && light.burning?.drop === 'stay') {
      flight.emissiveMaterial.color.set(new Color(light.color).multiplyScalar(light.emissive));
      flight.emissive.scale.set(this.blockSize * 0.36, this.blockSize * 0.06, this.blockSize * 0.06);
      flight.emissive.position.y = this.blockSize * 0.15;
      flight.emissive.visible = true;
      flight.group.add(flight.emissive);
    }

    flight.group.visible = true;
    this.drawFlight(flight, 0);
  }

  update(simTime: number, pendingLandings?: ReadonlyMap<number, unknown>): void {
    for (const flight of this.flights) {
      if (!flight.active) {
        continue;
      }
      if (pendingLandings && !pendingLandings.has(flight.itemUid) && simTime < flight.landingAt) {
        flight.active = false;
        flight.group.visible = false;
        continue;
      }
      const duration = flight.landingAt - flight.startedAtSimSeconds;
      const progress = duration > 0 ? Math.max(0, (simTime - flight.startedAtSimSeconds) / duration) : 1;
      if (simTime >= flight.landingAt) {
        this.drawFlight(flight, 1);
        flight.active = false;
        flight.group.visible = false;
        continue;
      }
      this.drawFlight(flight, progress);
    }
  }

  get activeCount(): number {
    return this.flights.filter((flight) => flight.active).length;
  }

  dispose(): void {
    for (const flight of this.flights) {
      disposeItemEmissiveMaterials(flight.group);
      flight.emissiveMaterial.dispose();
    }
    this.bundleMaterial.dispose();
    this.geometry.dispose();
    this.group.clear();
    this.flights.length = 0;
  }

  private createFlight(): Flight {
    const group = new Group();
    const bundle = new Mesh(this.geometry, this.bundleMaterial);
    const emissiveMaterial = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const emissive = new Mesh(this.geometry, emissiveMaterial);
    const flight: Flight = {
      active: false,
      itemUid: 0,
      startedAtSimSeconds: 0,
      landingAt: 0,
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
