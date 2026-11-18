import type { Registry } from '@skelly/engine/content';
import type { SkyBounds } from '@skelly/engine/sky';
import {
  projectVehicleParts,
  savedClock,
  type VehicleInstances,
  VehicleOccupancy,
  type VehiclePartProjection,
  vehiclePartPoses,
} from '@skelly/engine/vehicles';
import type { Vec3 } from '@skelly/engine/world';
import { type BufferGeometry, Group, type Material, Matrix4, Mesh, type Object3D } from 'three';
import { itemFinishLook } from './itemLook.ts';
import { applyItemStateLook, disposeItemStateMaterials } from './itemStateLook.ts';
import type { ModelLibrary } from './models.ts';
import { addSkyCellAnchors, skyAnchoredCopy } from './skyAnchor.ts';
import { freezeMatrices } from './staticMatrices.ts';
import type { VehicleFinishes } from './vehicleFinishes.ts';

type Vehicle = NonNullable<ReturnType<VehicleInstances['get']>>;
type PartPose = VehiclePartProjection['pose'];

/** A part drawn on its way between two clocks of its motion, 0 shut and 1 open, after its saved state changed. */
interface Swing {
  readonly from: number;
  readonly to: number;
  readonly startSimSeconds: number;
  readonly durationSimSeconds: number;
}

const swingClock = ({ from, to, startSimSeconds, durationSimSeconds }: Swing, time: number): number =>
  from + (to - from) * Math.min(1, Math.max(0, (time - startSimSeconds) / durationSimSeconds));

interface RenderedVehicle {
  readonly signature: string;
  readonly group: Group;
  /** The anchored geometry and material copies made for this build alone, freed with it. */
  readonly owned: readonly (BufferGeometry | Material)[];
  /** Each drawn part's posing group by fitting id, which a swing moves without a rebuild. */
  readonly posed: ReadonlyMap<string, Group>;
  /** The clock each part that opens is saved at, so the next build knows which of them set off. */
  readonly saved: ReadonlyMap<string, number>;
  /** The parts still on their way to where they are saved. */
  readonly swings: Map<string, Swing>;
}

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

const signatureOf = (parts: readonly VehiclePartProjection[], modelVersion: number, finished: boolean): string =>
  JSON.stringify([
    modelVersion,
    finished,
    parts.map(({ fittingId, item, model, transform, pose }) => [
      fittingId,
      item.uid,
      item.type,
      item.cargo,
      item.finish,
      model,
      transform.position,
      transform.yaw,
      transform.mirror,
      pose,
    ]),
  ]);

/** Stands a part's posing group at `pose`; a rigid pose decomposes with unit scale. */
const setPose = (posed: Group, { rotation: r, translation: t }: PartPose): void => {
  new Matrix4()
    .set(r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2], 0, 0, 0, 1)
    .decompose(posed.position, posed.quaternion, posed.scale);
};

/** A part's pose as a three.js parent of its placed model. */
const posedHolder = (pose: PartPose): Group => {
  const posed = new Group();
  setPose(posed, pose);
  return posed;
};

/** Occupied production vehicle parts, grouped per instance so one changed build leaves its neighbours intact. */
export class VehicleMeshes {
  readonly group = new Group();
  private readonly rendered = new Map<number, RenderedVehicle>();
  private readonly registry: Registry;
  private readonly models: ModelLibrary;
  private readonly blockSize: number;
  private readonly finishes: Pick<VehicleFinishes, 'enabled' | 'dress'> | undefined;
  private occupied: { vehicles: VehicleInstances; light: VehicleOccupancy } | undefined;

  constructor(
    registry: Registry,
    models: ModelLibrary,
    blockSize: number,
    finishes?: Pick<VehicleFinishes, 'enabled' | 'dress'>,
  ) {
    this.registry = registry;
    this.models = models;
    this.blockSize = blockSize;
    this.finishes = finishes;
  }

  groupFor(id: number): Object3D | undefined {
    return this.rendered.get(id)?.group;
  }

  /** Draws `vehicles` as they stand at sim second `time`, which a part swinging open or shut is timed by. */
  sync(vehicles: VehicleInstances, time: number): void {
    if (this.occupied?.vehicles !== vehicles) {
      this.occupied = { vehicles, light: new VehicleOccupancy(this.registry, vehicles, this.blockSize, 'light') };
    }
    const live = new Set<number>();
    for (const [id, vehicle] of vehicles.records) {
      live.add(id);
      this.syncVehicle(id, vehicle, this.occupied.light, time);
    }
    this.removeMissing(live);
  }

  private syncVehicle(
    id: number,
    vehicle: ReturnType<VehicleInstances['get']>,
    light: VehicleOccupancy,
    time: number,
  ): void {
    if (!vehicle) {
      return;
    }
    const parts = projectVehicleParts(this.registry, id, vehicle, this.blockSize);
    const signature = signatureOf(parts, this.models.version, this.finishes?.enabled ?? false);
    const previous = this.rendered.get(id);
    if (previous?.signature === signature) {
      this.swing(previous, vehicle, time);
      return;
    }
    const posed = new Map<string, Group>();
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
      this.dress(model, part);
      const holder = new Group();
      holder.position.set(...part.transform.position);
      holder.rotation.y = part.transform.yaw;
      holder.scale.x = part.transform.mirror ? -1 : 1;
      holder.add(model);
      const partPose = posedHolder(part.pose);
      partPose.add(holder);
      group.add(partPose);
      posed.set(part.fittingId, partPose);
    }
    if (previous) {
      this.drop(previous);
    }
    // A vehicle stands where it is built until its render signature changes and it is rebuilt whole; only a swing
    // moves a part in place meanwhile.
    freezeMatrices(group);
    this.group.add(group);
    const rendered: RenderedVehicle = {
      signature,
      group,
      posed,
      saved: new Map(
        vehicle.fittings
          .filter(({ item }) => this.openingOf(item.type) !== undefined)
          .map((fitting) => [fitting.id, savedClock(fitting)]),
      ),
      swings: this.swingsSince(previous, vehicle, time),
      // Anchored as the build stands saved, so a swinging part samples the sky from where it comes to rest.
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
    };
    this.rendered.set(id, rendered);
    this.swing(rendered, vehicle, time);
  }

  private openingOf(type: string) {
    return this.registry.items.get(type)?.vehicle?.opening;
  }

  /**
   * The parts that set off since `previous` was drawn, each from where it was drawn last, and those still on their
   * way. A swing takes the part's handling time from end to end, so one turned back halfway takes half.
   */
  private swingsSince(previous: RenderedVehicle | undefined, vehicle: Vehicle, time: number): Map<string, Swing> {
    const swings = new Map<string, Swing>();
    for (const fitting of vehicle.fittings) {
      const was = previous?.saved.get(fitting.id);
      const opening = this.openingOf(fitting.item.type);
      if (was === undefined || !opening) {
        continue;
      }
      const under = previous?.swings.get(fitting.id);
      const from = under ? swingClock(under, time) : was;
      const to = savedClock(fitting);
      if (to === was && under) {
        swings.set(fitting.id, under);
      } else if (to !== from) {
        swings.set(fitting.id, {
          from,
          to,
          startSimSeconds: time,
          durationSimSeconds: opening.handlingSimSeconds * Math.abs(to - from),
        });
      }
    }
    return swings;
  }

  /** Stands every part of `rendered` where its swings have reached at `time`, and lets the finished ones go. */
  private swing(rendered: RenderedVehicle, vehicle: Vehicle, time: number): void {
    if (rendered.swings.size === 0) {
      return;
    }
    const held = new Map([...rendered.swings].map(([id, swing]) => [id, swingClock(swing, time)]));
    const poses = vehiclePartPoses(this.registry, vehicle, this.blockSize, held);
    for (const [fittingId, posed] of rendered.posed) {
      setPose(posed, poses.get(fittingId)!);
      freezeMatrices(posed);
    }
    for (const [fittingId, swing] of rendered.swings) {
      if (time >= swing.startSimSeconds + swing.durationSimSeconds) {
        rendered.swings.delete(fittingId);
      }
    }
  }

  private dress(model: Object3D, part: VehiclePartProjection): void {
    const finish = itemFinishLook(this.registry, part.item);
    if (finish && part.model !== undefined) {
      applyItemStateLook(
        model,
        { model: part.model, state: { finish }, slots: [], hidden: [], key: '' },
        this.registry,
      );
    }
    // After the paint, which copies its material as a plain standard one and would drop a finished copy's coat.
    if (this.finishes?.enabled) {
      this.finishes.dress(model);
    }
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
