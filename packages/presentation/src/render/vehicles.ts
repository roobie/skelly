import type { Registry } from '@skelly/engine/content';
import type { SkyBounds } from '@skelly/engine/sky';
import {
  projectVehicleParts,
  type VehicleInstances,
  VehicleOccupancy,
  type VehiclePartProjection,
} from '@skelly/engine/vehicles';
import type { Vec3 } from '@skelly/engine/world';
import { type BufferGeometry, Group, type Material, Mesh, type Object3D } from 'three';
import { itemFinishLook } from './itemLook.ts';
import { applyItemStateLook, disposeItemStateMaterials } from './itemStateLook.ts';
import type { ModelLibrary } from './models.ts';
import { addSkyCellAnchors, skyAnchoredCopy } from './skyAnchor.ts';
import { freezeMatrices } from './staticMatrices.ts';

interface RenderedVehicle {
  readonly signature: string;
  readonly group: Group;
  /** The anchored geometry and material copies made for this build alone, freed with it. */
  readonly owned: readonly (BufferGeometry | Material)[];
}

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

const signatureOf = (parts: readonly VehiclePartProjection[], modelVersion: number): string =>
  JSON.stringify([
    modelVersion,
    parts.map(({ fittingId, item, model, transform }) => [
      fittingId,
      item.uid,
      item.type,
      item.cargo,
      item.finish,
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
  private occupied: { vehicles: VehicleInstances; light: VehicleOccupancy } | undefined;

  constructor(registry: Registry, models: ModelLibrary, blockSize: number) {
    this.registry = registry;
    this.models = models;
    this.blockSize = blockSize;
  }

  groupFor(id: number): Object3D | undefined {
    return this.rendered.get(id)?.group;
  }

  sync(vehicles: VehicleInstances): void {
    if (this.occupied?.vehicles !== vehicles) {
      this.occupied = { vehicles, light: new VehicleOccupancy(this.registry, vehicles, this.blockSize, 'light') };
    }
    const live = new Set<number>();
    for (const [id, vehicle] of vehicles.records) {
      live.add(id);
      this.syncVehicle(id, vehicle, this.occupied.light);
    }
    this.removeMissing(live);
  }

  private syncVehicle(id: number, vehicle: ReturnType<VehicleInstances['get']>, light: VehicleOccupancy): void {
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
      const finish = itemFinishLook(this.registry, part.item);
      if (finish && part.model !== undefined) {
        applyItemStateLook(
          model,
          { model: part.model, state: { finish }, slots: [], hidden: [], key: '' },
          this.registry,
        );
      }
      const holder = new Group();
      holder.position.set(...part.transform.position);
      holder.rotation.y = part.transform.yaw;
      holder.scale.x = part.transform.mirror ? -1 : 1;
      holder.add(model);
      group.add(holder);
    }
    if (previous) {
      this.drop(previous);
    }
    // A vehicle stands where it is built until its render signature changes and it is rebuilt whole.
    freezeMatrices(group);
    this.group.add(group);
    this.rendered.set(id, {
      signature,
      group,
      owned: this.anchorToSky(group, {
        blocked: (x, y, z) => light.isSolidFor(id, x, y, z),
        own: parts
          .filter((part) => light.shareOf(part) > 0)
          .flatMap((part) => part.boxes)
          .map(({ min, max }) => ({
            min: min.map((value) => value / this.blockSize) as Vec3,
            max: max.map((value) => value / this.blockSize) as Vec3,
          })),
      }),
    });
  }

  /**
   * Moves each part's sky sample out of the light-blocking cells its own vehicle adds to the sky field (see
   * `addSkyCellAnchors`), so a parked car shades the ground under it without darkening its own body. Only its own
   * cells and geometry count, as they alone are in the render signature; a neighbour shades it through the field
   * instead.
   */
  private anchorToSky(
    group: Group,
    { blocked, own }: { blocked: (x: number, y: number, z: number) => boolean; own: readonly SkyBounds[] },
  ): (BufferGeometry | Material)[] {
    group.updateWorldMatrix(true, true);
    const meshes: Mesh[] = [];
    group.traverse((object) => {
      if (object instanceof Mesh) {
        meshes.push(object);
      }
    });
    const copies = new Map<Material, Material>();
    for (const material of meshes.flatMap(materialsOf)) {
      if (!copies.has(material)) {
        copies.set(material, skyAnchoredCopy(material));
      }
    }
    // The anchored copies stand in for any state-owned material, which nothing draws once they do.
    disposeItemStateMaterials(group);
    const anchored = (material: Material): Material => copies.get(material) ?? material;
    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      addSkyCellAnchors(geometry, {
        toWorld: mesh.matrixWorld,
        blocked,
        own,
        blockSize: this.blockSize,
      });
      mesh.geometry = geometry;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(anchored) : anchored(mesh.material);
      return geometry;
    });
    return [...geometries, ...copies.values()];
  }

  private drop(rendered: RenderedVehicle): void {
    this.group.remove(rendered.group);
    for (const resource of rendered.owned) {
      resource.dispose();
    }
  }

  private removeMissing(live: ReadonlySet<number>): void {
    for (const [id, rendered] of this.rendered) {
      if (!live.has(id)) {
        this.drop(rendered);
        this.rendered.delete(id);
      }
    }
  }

  dispose(): void {
    for (const rendered of this.rendered.values()) {
      this.drop(rendered);
    }
    this.group.clear();
    this.rendered.clear();
  }
}
