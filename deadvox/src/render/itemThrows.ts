import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import { PILE_GRID } from '../core/inventoryScale.ts';
import { cellCount, defOf, type Item } from '../core/items.ts';
import { itemFlightPoint } from '../core/itemThrow.ts';
import { effectivePileDisplay, effectivePileItemPosition } from '../core/pileDisplay.ts';
import { reachTuning } from '../core/reach.ts';
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

/** Transient presentation arc; inventory ownership is immediate and arcs do not resume after load. */
export class ItemThrows {
  readonly group = new Group();
  private readonly flights: Flight[] = [];
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly bundleMaterial = withHeightFog(new MeshLambertMaterial({ color: 0x5a_50_46 }), 'piles');
  private readonly models: Pick<ModelLibrary, 'groundLook' | 'has'> | undefined;
  private readonly registry: Registry;
  private readonly blockSize: number;
  private readonly seed: number;

  constructor(registry: Registry, models?: Pick<ModelLibrary, 'groundLook' | 'has'>, blockSize = 1, seed = 1) {
    this.registry = registry;
    this.models = models;
    this.blockSize = blockSize;
    this.seed = seed;
  }

  spawn(
    {
      origin: from,
      item,
      itemUid = item.uid,
      startedAtSimSeconds = 0,
      landingAt = startedAtSimSeconds + reachTuning(this.registry).throwFlightSimSeconds,
    }: {
      origin: Vec3;
      item: Item;
      itemUid?: number;
      startedAtSimSeconds?: number;
      landingAt?: number;
    },
    inventory: Inventory,
  ): void {
    const flight = this.flights.find((candidate) => !candidate.active) ?? this.createFlight();
    flight.active = true;
    flight.itemUid = itemUid;
    flight.startedAtSimSeconds = startedAtSimSeconds;
    flight.landingAt = landingAt;
    flight.start.set(...from);
    flight.end.set(...from);
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
    this.update(startedAtSimSeconds, inventory);
  }

  update(simTime: number, inventory: Inventory): void {
    for (const flight of this.flights) {
      if (!flight.active) {
        continue;
      }
      const item = inventory.itemByUid(flight.itemUid);
      const location = item && inventory.locate(item);
      const otherHiddenItemUids = new Set(
        this.flights
          .filter(
            (candidate) => candidate.active && simTime < candidate.landingAt && candidate.itemUid !== flight.itemUid,
          )
          .map((candidate) => candidate.itemUid),
      );
      const projection =
        location?.kind === 'pile'
          ? effectivePileDisplay({
              registry: this.registry,
              pile: location.pile,
              blockSize: this.blockSize,
              worldSeed: this.seed,
              hasModel: (id) => this.models?.has(id) ?? false,
              hiddenItemUids: otherHiddenItemUids,
            })
          : undefined;
      const destination = projection && item ? effectivePileItemPosition(projection, item) : undefined;
      if (!destination) {
        flight.active = false;
        flight.group.visible = false;
        continue;
      }
      flight.end.set(...destination);
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

  get hiddenItemUids(): ReadonlySet<number> {
    return new Set(this.flights.filter((flight) => flight.active).map((flight) => flight.itemUid));
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
    const { throwArcHeightMetres } = reachTuning(this.registry);
    const point = itemFlightPoint(
      flight.start.toArray() as Vec3,
      flight.end.toArray() as Vec3,
      progress,
      throwArcHeightMetres,
    );
    flight.group.position.set(...point);
    flight.direction.subVectors(flight.end, flight.start);
    flight.direction.y +=
      (Math.cos(Math.PI * progress) * throwArcHeightMetres * Math.PI) / (flight.landingAt - flight.startedAtSimSeconds);
    flight.group.quaternion.setFromUnitVectors(flight.modelVisual ? RIGHT : UP, flight.direction.normalize());
  }
}
