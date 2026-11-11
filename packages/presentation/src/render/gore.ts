// Render-only gore: blood thrown from wounds, splats where it lands, and drips from wounded bodies. Nothing
// here is saved or read by the simulation: splats fade, and a reload starts clean. It runs every frame under
// crowds, so the per-frame path allocates nothing: pools, slots and vectors are made once and reused.

import type { GraphicsTuningDef } from '@skelly/engine/content';
import { Rng } from '@skelly/engine/math';
import { type FusedMassFigure, missingFlesh } from '@skelly/engine/pose';
import { type Actor, BODY_REGIONS, type BodyRegion, type EntityStore, type HitImpulse } from '@skelly/engine/sim';
import type { Vec3 } from '@skelly/engine/world';
import {
  BoxGeometry,
  CircleGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { ModelLibrary } from './models.ts';
import { PLAYER_REGION_BOXES, type PlayerFigurePlacement, setPlayerFigurePosition } from './playerFigure.ts';

export type GoreTuning = GraphicsTuningDef['gore'];

// Presentation tuning, not gameplay.
const DROPLET_MAX_AGE_S = 3;
const SPRAY_DROPLETS_MIN = 2;
const SPRAY_DROPLETS_MAX = 14;
const SPRAY_BACK_FRACTION = 0.3;
/** How much spray one carved cell is worth, in the damage units `spray` takes. */
const CARVED_CELL_SPRAY_DAMAGE = 2;
const SPLAT_LIFE_S = 90;
const SPLAT_FADE_S = 30;
const SPLAT_OPACITY = 0.9;
/** Drips a second from a body at full wound severity, and a player wound's base rate. */
const DRIPS_PER_SECOND = 2.5;
const DRIP_RANGE_M = 25;
/** A downed body drips from near the ground, not from its standing height. */
const DOWNED_DRIP_HEIGHT_M = 0.3;
const SEVERED_PART_SEVERITY = 0.2;
const CARVED_CELL_SEVERITY = 0.01;
const DROPLET_COLOR = 0x52_17_0f;
const SPLAT_COLOR = 0x3a_0c_08;
const FACE_NORMAL = new Vector3(0, 0, 1);
const AXES = [0, 1, 2] as const;

interface Droplet {
  active: boolean;
  readonly position: Vector3;
  readonly velocity: Vector3;
  ageRealSeconds: number;
  maxAgeRealSeconds: number;
  sizeMetres: number;
}

type SeveredSpurt = Actor['type']['severedSpurt'];

/** One part of a chunk model, instanced: the part's mesh and its transform from the model's ground root. */
interface ChunkMesh {
  readonly mesh: InstancedMesh;
  readonly matrix: Matrix4;
}

/** Where a flesh chunk's model parts come from once loaded (`src/render/models.ts`, `ModelLibrary`). */
export type ChunkModels = Pick<ModelLibrary, 'groundParts'>;

/** A flying flesh chunk, in metres; once landed it lies still on the floor until it fades. */
interface Chunk {
  active: boolean;
  /** Index into the tuning's model list. */
  model: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly spinAxis: Vector3;
  spinRadiansPerRealSecond: number;
  readonly orientation: Quaternion;
  scale: number;
  ageRealSeconds: number;
  landed: boolean;
  /** The splat slot it landed on, -1 for none, and that splat's generation then: the splat pool may have reused
   * the slot since, and the newer splat is not this chunk's. */
  splatSlot: number;
  splatGeneration: number;
}

interface Splat {
  active: boolean;
  /** Counts the slot's reuses, so an owner can tell its own splat from a later one in the same slot. */
  generation: number;
  ageRealSeconds: number;
  lifeRealSeconds: number;
  fadeRealSeconds: number;
}

/** One of the nearest wounded bodies, picked afresh each update. */
interface Dripper {
  actor: Actor | undefined;
  distanceBlocks: number;
  severity: number;
}

interface SeverityMemo {
  update: number;
  value: number;
}

/** A fused-mass body's drip cells, kept while its carved list (replaced on every carve) and severed count stay. */
interface DripCells {
  readonly carved: readonly number[];
  readonly severed: number;
  readonly cells: Int32Array;
}

/** What drips: the bodies in the world, and where the listener is (blocks). */
export interface GorePlayer {
  readonly pos: Vec3;
  readonly yaw: number;
  /** A bleeding region's drip from its content tier, relative to the base rate and size; undefined if dry. */
  readonly drip: (region: BodyRegion) => Readonly<{ rate: number; size: number }> | undefined;
  /** Whether the figure uses its third-person placement, without the first-person rear offset. */
  readonly thirdPerson: boolean;
}

export interface GoreBodies {
  readonly actors: Pick<EntityStore<Actor>, 'entries'>;
  readonly listener: Vec3;
  readonly player?: GorePlayer;
  /** A body's fused-mass figure, undefined for any other body. */
  readonly fusedMass?: (actor: Actor) => FusedMassFigure | undefined;
}

const setPlayerDripOrigin = (
  target: Vector3,
  placement: PlayerFigurePlacement,
  region: (typeof BODY_REGIONS)[number],
): void => {
  setPlayerFigurePosition(target, placement, PLAYER_REGION_BOXES[region].at);
};

const regionNameLists = new WeakMap<Actor['type']['regions'], readonly string[]>();

/** A type's region names, listed once per type rather than once per body per frame. */
const regionNames = (maxima: Actor['type']['regions']): readonly string[] => {
  let names = regionNameLists.get(maxima);
  if (!names) {
    names = Object.keys(maxima);
    regionNameLists.set(maxima, names);
  }
  return names;
};

/** How badly a body bleeds, 0 to 1, from its saved wounds: health lost across its regions, severed parts and
 * carved flesh. Derived, so drips and the bloodied tint survive a reload with no state of their own. */
export const woundSeverity = (actor: Pick<Actor, 'type' | 'regions' | 'severed' | 'carved'>): number => {
  let full = 0;
  let left = 0;
  const maxima = actor.type.regions;
  for (const region of regionNames(maxima)) {
    const max = maxima[region]!;
    full += max;
    left += Math.min(max, Math.max(0, actor.regions[region] ?? 0));
  }
  const lost = full > 0 ? 1 - left / full : 0;
  return Math.min(1, lost + actor.severed.length * SEVERED_PART_SEVERITY + actor.carved.length * CARVED_CELL_SEVERITY);
};

/** Fades each splat by its own opacity, which three's built-in materials have no per-instance slot for. */
const patchSplatOpacity = (material: MeshLambertMaterial): void => {
  material.customProgramCacheKey = () => 'skelly-gore-splat';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float splatOpacity;\nvarying float vSplatOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplatOpacity = splatOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSplatOpacity;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vSplatOpacity;');
  };
};

export class Gore {
  readonly group = new Group();
  private readonly blockSize: number;
  private readonly gravityMetresPerSimSecondSquared: number;
  private readonly tuning: GoreTuning;
  private readonly rng: Rng;
  private readonly droplets: Droplet[];
  private readonly splats: Splat[];
  private readonly drippers: Dripper[];
  private readonly severities = new WeakMap<Actor, SeverityMemo>();
  private readonly dripCells = new WeakMap<Actor, DripCells>();
  private readonly dropletMesh: InstancedMesh<BoxGeometry, MeshLambertMaterial>;
  private readonly splatMesh: InstancedMesh<CircleGeometry, MeshLambertMaterial>;
  private readonly splatOpacity: InstancedBufferAttribute;
  private readonly dummy = new Object3D();
  private readonly turn = new Quaternion();
  private readonly scratch = new Vector3();
  private readonly origin = new Vector3();
  private readonly point = new Vector3();
  private readonly playerPlacement: PlayerFigurePlacement = {
    bodyPosition: [0, 0, 0],
    yaw: 0,
    blockSize: 1,
  };
  private readonly normal = new Vector3();
  private readonly launch = new Vector3();
  private readonly partVelocity = new Vector3();
  private readonly chunks: Chunk[];
  private readonly chunkModels: ChunkModels | undefined;
  /** Per chunk model, one instanced mesh per model part, made once the model has loaded. */
  private readonly chunkMeshes: (readonly ChunkMesh[] | undefined)[];
  private readonly chunkMatrix = new Matrix4();
  private readonly up = new Vector3(0, 1, 0);
  private nextDroplet = 0;
  private nextSplat = 0;
  private nextChunk = 0;
  private spawnedSinceUpdate = 0;
  private dripperCount = 0;
  private updates = 0;

  /** `models` draws the flesh chunks; without it chunks still fly and land but nothing draws them. */
  constructor(
    blockSize: number,
    gravityMetresPerSimSecondSquared: number,
    tuning: GoreTuning,
    { seed = 1, models }: { readonly seed?: number; readonly models?: ChunkModels } = {},
  ) {
    this.blockSize = blockSize;
    this.gravityMetresPerSimSecondSquared = gravityMetresPerSimSecondSquared;
    this.tuning = tuning;
    this.rng = Rng.stream(seed, 'gore');
    this.chunkModels = models;
    this.chunks = Array.from({ length: tuning.chunks?.cap ?? 0 }, () => ({
      active: false,
      model: 0,
      position: new Vector3(),
      velocity: new Vector3(),
      spinAxis: new Vector3(),
      spinRadiansPerRealSecond: 0,
      orientation: new Quaternion(),
      scale: 1,
      ageRealSeconds: 0,
      landed: false,
      splatSlot: -1,
      splatGeneration: 0,
    }));
    this.chunkMeshes = (tuning.chunks?.models ?? []).map(() => undefined);
    this.droplets = Array.from({ length: tuning.dropletCap }, () => ({
      active: false,
      position: new Vector3(),
      velocity: new Vector3(),
      ageRealSeconds: 0,
      maxAgeRealSeconds: DROPLET_MAX_AGE_S,
      sizeMetres: 0,
    }));
    this.splats = Array.from({ length: tuning.splatCap }, () => ({
      active: false,
      generation: 0,
      ageRealSeconds: 0,
      lifeRealSeconds: SPLAT_LIFE_S,
      fadeRealSeconds: SPLAT_FADE_S,
    }));
    this.drippers = Array.from({ length: tuning.dripSourceCap }, () => ({
      actor: undefined,
      distanceBlocks: 0,
      severity: 0,
    }));
    this.dropletMesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshLambertMaterial({ color: DROPLET_COLOR }),
      tuning.dropletCap,
    );
    const splatMaterial = new MeshLambertMaterial({
      color: SPLAT_COLOR,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    patchSplatOpacity(splatMaterial);
    this.splatMesh = new InstancedMesh(new CircleGeometry(1, 9), splatMaterial, tuning.splatCap);
    this.splatOpacity = new InstancedBufferAttribute(new Float32Array(tuning.splatCap), 1);
    this.splatOpacity.setUsage(DynamicDrawUsage);
    this.splatMesh.geometry.setAttribute('splatOpacity', this.splatOpacity);
    for (const mesh of [this.dropletMesh, this.splatMesh]) {
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let slot = 0; slot < tuning.splatCap; slot++) {
      this.splatMesh.setMatrixAt(slot, this.dummy.matrix);
    }
    this.drawDroplets();
  }

  get activeDroplets(): number {
    return this.droplets.reduce((count, droplet) => count + Number(droplet.active), 0);
  }

  get activeSplats(): number {
    return this.splats.reduce((count, splat) => count + Number(splat.active), 0);
  }

  get activeChunks(): number {
    return this.chunks.reduce((count, chunk) => count + Number(chunk.active), 0);
  }

  /** A body's woundSeverity, worked out at most once per update: the drips and the stains on live bodies
   * (mobActors.ts) both read it every frame. */
  severity(actor: Actor): number {
    const memo = this.severities.get(actor);
    if (memo?.update === this.updates) {
      return memo.value;
    }
    const value = woundSeverity(actor);
    if (memo) {
      memo.update = this.updates;
      memo.value = value;
    } else {
      this.severities.set(actor, { update: this.updates, value });
    }
    return value;
  }

  /** Blood thrown from a wound: most along the strike and on through the body, some back toward the attacker;
   * more for a heavier hit. `hit` is in blocks, like the simulation's. */
  spray(hit: HitImpulse, damage: number): void {
    const count = Math.min(SPRAY_DROPLETS_MAX, Math.max(SPRAY_DROPLETS_MIN, Math.round(2 + damage / 5)));
    this.origin.set(hit.point[0], hit.point[1], hit.point[2]).multiplyScalar(this.blockSize);
    for (let i = 0; i < count; i++) {
      const sense = this.rng.chance(SPRAY_BACK_FRACTION) ? -1 : 1;
      const direction = this.scratch
        .set(
          hit.direction[0] * sense + this.rng.range(-0.5, 0.5),
          hit.direction[1] * sense + this.rng.range(-0.2, 0.6),
          hit.direction[2] * sense + this.rng.range(-0.5, 0.5),
        )
        .normalize()
        .multiplyScalar(this.rng.range(1.5, 4.5));
      if (!this.emit(this.origin, direction, this.rng.range(0.012, 0.026), DROPLET_MAX_AGE_S)) {
        return;
      }
    }
  }

  /** The extra burst as flesh is carved out of a fused-mass body, on top of the wound's own spray: more blood for
   * a bigger hole, and the flesh chunks knocked out of it. */
  carved(hit: HitImpulse, cells: number): void {
    this.spray(hit, cells * CARVED_CELL_SPRAY_DAMAGE);
    this.throwChunks(hit);
  }

  /** Flesh chunks a wound throws beside its spray: only a hit at or over the content's hard-hit damage. */
  wounded(hit: HitImpulse, damage: number): void {
    const { chunks } = this.tuning;
    if (chunks && damage >= chunks.hardHitDamage) {
      this.throwChunks(hit);
    }
  }

  /** The blood a cut throws as its part flies off (`spurt`, the kind's content): each droplet leaves the wound
   * along the strike, fanned by the spread, and inherits the part's launch velocity in metres per second, so it
   * stays with the part. A kind with no spurt throws none. */
  severed(hit: HitImpulse, partVelocity: Vec3 | undefined, spurt: SeveredSpurt): void {
    this.origin.set(hit.point[0], hit.point[1], hit.point[2]).multiplyScalar(this.blockSize);
    for (let i = 0; i < spurt.droplets; i++) {
      const direction = this.scratch
        .set(
          hit.direction[0] + this.rng.range(-0.5, 0.5) * spurt.spreadFraction,
          hit.direction[1] + this.rng.range(-0.2, 0.6) * spurt.spreadFraction,
          hit.direction[2] + this.rng.range(-0.5, 0.5) * spurt.spreadFraction,
        )
        .normalize()
        .multiplyScalar(this.rng.range(0.5, 1) * spurt.speedMetresPerRealSecond);
      const velocity = this.launch.copy(direction);
      if (partVelocity) {
        velocity.add(
          this.partVelocity
            .set(partVelocity[0], partVelocity[1], partVelocity[2])
            .multiplyScalar(spurt.partVelocityShare),
        );
      }
      if (!this.emit(this.origin, velocity, this.rng.range(0.012, 0.026), spurt.lifetimeRealSeconds)) {
        return;
      }
    }
  }

  /** A large splat on the floor under something wet that came to rest there, such as a flesh chunk (its centre,
   * metres). The floor is the top of the block the centre is in. */
  landed(centre: Vec3): void {
    const floor = Math.floor(centre[1] / this.blockSize) * this.blockSize;
    this.splat(this.point.set(centre[0], floor, centre[2]), this.normal.set(0, 1, 0), this.rng.range(0.14, 0.24));
  }

  /** Flies the droplets, leaves a splat where each lands, fades the splats and lets the nearest wounded
   * bodies drip. */
  update(dt: number, isSolid: (x: number, y: number, z: number) => boolean, bodies?: GoreBodies): void {
    this.updates += 1;
    const step = Math.max(0, dt);
    const substeps = Math.max(1, Math.ceil(step / 0.02));
    // Before anything lands this update, so a new splat starts aging with the next one, as its chunk does.
    this.fadeSplats(step);
    for (const droplet of this.droplets) {
      if (!droplet.active) {
        continue;
      }
      droplet.ageRealSeconds += step;
      for (let substep = 0; substep < substeps && droplet.active; substep++) {
        this.advance(droplet, step / substeps, isSolid);
      }
      if (droplet.ageRealSeconds >= droplet.maxAgeRealSeconds) {
        droplet.active = false;
      }
    }
    this.flyChunks(step, substeps, isSolid);
    this.pickDrippers(bodies);
    this.drip(step, bodies?.fusedMass);
    this.dripPlayer(step, bodies?.player);
    this.drawDroplets();
    this.drawChunks();
    this.spawnedSinceUpdate = 0;
  }

  dispose(): void {
    this.group.clear();
    for (const mesh of [this.dropletMesh, this.splatMesh]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
    // The chunk meshes share the model library's geometry and materials, which it owns.
    for (const meshes of this.chunkMeshes) {
      for (const { mesh } of meshes ?? []) {
        mesh.dispose();
      }
    }
  }

  /** Starts a throw of chunks from the hit, each reusing the oldest slot in the pool. They leave the wound back
   * toward the attacker: the hit point lies on the struck face and chunks meet only world blocks, so a chunk thrown
   * along the strike would fly into the body and land hidden under it. */
  private throwChunks(hit: HitImpulse): void {
    const tuning = this.tuning.chunks;
    if (!tuning || this.chunks.length === 0) {
      return;
    }
    const count = this.rng.int(tuning.perThrow[0], tuning.perThrow[1]);
    const { speedMetresPerRealSecond: speed, spinRadiansPerRealSecond: spin, scale, spreadFraction } = tuning;
    for (let i = 0; i < count; i++) {
      const chunk = this.chunks[this.nextChunk]!;
      this.nextChunk = (this.nextChunk + 1) % this.chunks.length;
      this.retireChunkSplat(chunk);
      chunk.active = true;
      chunk.landed = false;
      chunk.ageRealSeconds = 0;
      chunk.model = this.rng.int(0, tuning.models.length - 1);
      chunk.position.set(hit.point[0], hit.point[1], hit.point[2]).multiplyScalar(this.blockSize);
      chunk.velocity
        .set(
          -hit.direction[0] + this.rng.range(-1, 1) * spreadFraction,
          -hit.direction[1] + this.rng.range(0, 1) * spreadFraction,
          -hit.direction[2] + this.rng.range(-1, 1) * spreadFraction,
        )
        .normalize()
        .multiplyScalar(this.rng.range(speed.min, speed.max));
      chunk.spinAxis.set(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1));
      if (chunk.spinAxis.lengthSq() === 0) {
        chunk.spinAxis.copy(this.up);
      }
      chunk.spinAxis.normalize();
      chunk.spinRadiansPerRealSecond = this.rng.range(spin.min, spin.max);
      chunk.orientation.setFromAxisAngle(chunk.spinAxis, this.rng.range(0, Math.PI * 2));
      chunk.scale = this.rng.range(scale.min, scale.max);
    }
  }

  /** The splat a chunk lands on. It ends with the chunk: a splat left bare where a chunk was reads as a chunk that
   * never came. */
  private splatUnderChunk(chunk: Chunk, tuning: NonNullable<GoreTuning['chunks']>): void {
    const { position } = chunk;
    const radius = this.rng.range(tuning.landedSplatRadiusMetres.min, tuning.landedSplatRadiusMetres.max);
    const left = Math.max(0, tuning.lifetimeRealSeconds - chunk.ageRealSeconds);
    const slot = this.splat(this.point.copy(position), this.normal.set(0, 1, 0), radius);
    if (slot < 0) {
      return;
    }
    const splat = this.splats[slot]!;
    splat.lifeRealSeconds = left;
    splat.fadeRealSeconds = Math.min(left, tuning.fadeRealSeconds);
    chunk.splatSlot = slot;
    chunk.splatGeneration = splat.generation;
  }

  /** Ends a chunk's splat as the chunk ends, by expiry or by its pool slot being reused; a splat that has since
   * taken that splat slot belongs to something else and stays. */
  private retireChunkSplat(chunk: Chunk): void {
    const slot = chunk.splatSlot;
    chunk.splatSlot = -1;
    if (slot >= 0 && this.splats[slot]!.active && this.splats[slot]!.generation === chunk.splatGeneration) {
      this.retireSplat(slot);
    }
  }

  private flyChunks(dt: number, substeps: number, isSolid: (x: number, y: number, z: number) => boolean): void {
    const lifetime = this.tuning.chunks?.lifetimeRealSeconds ?? 0;
    for (const chunk of this.chunks) {
      if (!chunk.active) {
        continue;
      }
      chunk.ageRealSeconds += dt;
      if (chunk.ageRealSeconds >= lifetime) {
        chunk.active = false;
        this.retireChunkSplat(chunk);
        continue;
      }
      for (let substep = 0; substep < substeps && !chunk.landed; substep++) {
        this.advanceChunk(chunk, dt / substeps, isSolid);
      }
    }
  }

  /** Moves one axis at a time like a droplet. A floor lands it upright at a random yaw, with a splat under it;
   * a wall or ceiling stops that axis of its flight. */
  private advanceChunk(chunk: Chunk, dt: number, isSolid: (x: number, y: number, z: number) => boolean): void {
    const { position, velocity } = chunk;
    const s = this.blockSize;
    velocity.y -= this.gravityMetresPerSimSecondSquared * dt;
    chunk.orientation.premultiply(this.turn.setFromAxisAngle(chunk.spinAxis, chunk.spinRadiansPerRealSecond * dt));
    for (const axis of AXES) {
      const speed = velocity.getComponent(axis);
      const next = position.getComponent(axis) + speed * dt;
      const bx = Math.floor((axis === 0 ? next : position.x) / s);
      const by = Math.floor((axis === 1 ? next : position.y) / s);
      const bz = Math.floor((axis === 2 ? next : position.z) / s);
      if (!isSolid(bx, by, bz)) {
        position.setComponent(axis, next);
        continue;
      }
      velocity.setComponent(axis, 0);
      if (axis === 1 && speed < 0) {
        position.y = (Math.floor(next / s) + 1) * s;
        velocity.set(0, 0, 0);
        chunk.landed = true;
        chunk.orientation.setFromAxisAngle(this.up, this.rng.range(0, Math.PI * 2));
        if (this.tuning.chunks) {
          this.splatUnderChunk(chunk, this.tuning.chunks);
        }
        return;
      }
    }
  }

  /** Draws each live chunk on its model's parts, shrinking it away over the fade at the end of its lifetime. */
  private drawChunks(): void {
    const tuning = this.tuning.chunks;
    if (!tuning) {
      return;
    }
    for (let index = 0; index < tuning.models.length; index++) {
      const meshes = this.chunkMeshesFor(index, tuning.models[index]!);
      if (!meshes) {
        continue;
      }
      let count = 0;
      for (const chunk of this.chunks) {
        if (!(chunk.active && chunk.model === index)) {
          continue;
        }
        const left = tuning.lifetimeRealSeconds - chunk.ageRealSeconds;
        this.dummy.position.copy(chunk.position);
        this.dummy.quaternion.copy(chunk.orientation);
        this.dummy.scale.setScalar(chunk.scale * Math.min(1, Math.max(0, left / tuning.fadeRealSeconds)));
        this.dummy.updateMatrix();
        for (const { mesh, matrix } of meshes) {
          mesh.setMatrixAt(count, this.chunkMatrix.multiplyMatrices(this.dummy.matrix, matrix));
        }
        count += 1;
      }
      for (const { mesh } of meshes) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** A chunk model's meshes, made the first update after its model has loaded. */
  private chunkMeshesFor(index: number, model: string): readonly ChunkMesh[] | undefined {
    const made = this.chunkMeshes[index];
    if (made || !this.chunkModels) {
      return made;
    }
    const parts = this.chunkModels.groundParts(model);
    if (!parts?.length) {
      return undefined;
    }
    const meshes = parts.map((part) => {
      const mesh = new InstancedMesh(part.geometry, part.material, this.chunks.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      return { mesh, matrix: part.matrix };
    });
    this.chunkMeshes[index] = meshes;
    return meshes;
  }

  /** Starts one droplet, reusing the oldest; false once this update's spawn budget is spent. */
  private emit(origin: Vector3, velocity: Vector3, sizeMetres: number, maxAgeRealSeconds: number): boolean {
    if (this.droplets.length === 0 || this.spawnedSinceUpdate >= this.tuning.dropletSpawnsPerFrame) {
      return false;
    }
    this.spawnedSinceUpdate += 1;
    const droplet = this.droplets[this.nextDroplet]!;
    this.nextDroplet = (this.nextDroplet + 1) % this.tuning.dropletCap;
    droplet.active = true;
    droplet.ageRealSeconds = 0;
    droplet.maxAgeRealSeconds = maxAgeRealSeconds;
    droplet.sizeMetres = sizeMetres;
    droplet.position.copy(origin);
    droplet.velocity.copy(velocity);
    return true;
  }

  /** The nearest wounded bodies within range, nearest first; distance is checked before the severity. */
  private pickDrippers(bodies: GoreBodies | undefined): void {
    this.dripperCount = 0;
    if (!bodies || this.drippers.length === 0) {
      return;
    }
    const [lx, ly, lz] = bodies.listener;
    const rangeBlocks = DRIP_RANGE_M / this.blockSize;
    for (const [, actor] of bodies.actors.entries()) {
      const { pos } = actor.body;
      const distanceBlocks = Math.hypot(pos[0] - lx, pos[1] - ly, pos[2] - lz);
      const full = this.dripperCount === this.tuning.dripSourceCap;
      if (
        distanceBlocks > rangeBlocks ||
        (full && distanceBlocks >= this.drippers[this.tuning.dripSourceCap - 1]!.distanceBlocks)
      ) {
        continue;
      }
      const severity = this.severity(actor);
      if (severity > 0) {
        this.insertDripper(actor, distanceBlocks, severity);
      }
    }
  }

  /** Keeps the drippers sorted by distance: takes a free slot, or the farthest's when full, and moves it in
   * behind the last one nearer than it. */
  private insertDripper(actor: Actor, distanceBlocks: number, severity: number): void {
    let index = Math.min(this.dripperCount, this.tuning.dripSourceCap - 1);
    const slot = this.drippers[index]!;
    while (index > 0 && this.drippers[index - 1]!.distanceBlocks > distanceBlocks) {
      this.drippers[index] = this.drippers[index - 1]!;
      index -= 1;
    }
    slot.actor = actor;
    slot.distanceBlocks = distanceBlocks;
    slot.severity = severity;
    this.drippers[index] = slot;
    this.dripperCount = Math.min(this.dripperCount + 1, this.tuning.dripSourceCap);
  }

  private drip(dt: number, fusedMass: GoreBodies['fusedMass']): void {
    for (let index = 0; index < this.dripperCount; index++) {
      const { actor, severity } = this.drippers[index]!;
      if (!(actor && this.rng.chance(DRIPS_PER_SECOND * severity * dt))) {
        continue;
      }
      const figure = actor.incapacitated ? undefined : fusedMass?.(actor);
      if (!(figure ? this.fleshDripOrigin(actor, figure) : this.boxDripOrigin(actor))) {
        continue;
      }
      if (!this.emit(this.origin, this.scratch.set(0, -0.2, 0), this.rng.range(0.01, 0.02), DROPLET_MAX_AGE_S)) {
        return;
      }
    }
  }

  /** Sets `origin` somewhere in a body's box; a downed body's from near the ground. */
  private boxDripOrigin(actor: Actor): boolean {
    const s = this.blockSize;
    const { pos, halfWidth, height } = actor.body;
    const reach = halfWidth * s;
    const heightMetres = actor.incapacitated ? DOWNED_DRIP_HEIGHT_M : height * s;
    this.origin.set(
      pos[0] * s + this.rng.range(-reach, reach),
      pos[1] * s + heightMetres * this.rng.range(0.35, 0.85),
      pos[2] * s + this.rng.range(-reach, reach),
    );
    return true;
  }

  /** Sets `origin` to the underside of one of a standing fused-mass body's drip cells; false when it has none.
   * Its bounding box is mostly air around a rounded mass, so a drip placed in the box would start in the air beside
   * or above the flesh. The cell is placed at rest pose, turned to the body's facing as the posed figure turns. */
  private fleshDripOrigin(actor: Actor, figure: FusedMassFigure): boolean {
    const cells = this.fleshDripCells(actor, figure);
    if (cells.length === 0) {
      return false;
    }
    const cell = cells[this.rng.int(0, cells.length - 1)]!;
    const { dims, size, origin } = figure.grid;
    const metres = size * figure.scale;
    const [offsetX, offsetY, offsetZ] = figure.originOffset;
    const x = (origin[0] + (cell % dims[0])) * metres + offsetX;
    const y = (origin[1] + (Math.floor(cell / dims[0]) % dims[1])) * metres + offsetY;
    const z = (origin[2] + Math.floor(cell / (dims[0] * dims[1]))) * metres + offsetZ;
    const yaw = Math.atan2(actor.facing[0], actor.facing[2]);
    const c = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const s = this.blockSize;
    const { pos } = actor.body;
    this.origin.set(pos[0] * s + c * x + sin * z, pos[1] * s + y, pos[2] * s - sin * x + c * z);
    return true;
  }

  /** The cells a fused-mass body drips from: live flesh with open air under it, above the ground layer, so each
   * drop falls clear of the body. That is an overhang, the roof of a hole or the stump a shed member left. */
  private fleshDripCells(actor: Actor, figure: FusedMassFigure): Int32Array {
    const kept = this.dripCells.get(actor);
    if (kept && kept.carved === actor.carved && kept.severed === actor.severed.length) {
      return kept.cells;
    }
    const { dims, owner } = figure.grid;
    const missing = missingFlesh(figure, actor);
    const live = (cell: number): boolean => {
      const bone = owner[cell]!;
      return bone > 0 && !missing.severedOwners.has(bone) && !missing.carved.has(cell);
    };
    const cells: number[] = [];
    for (let cell = 0; cell < owner.length; cell++) {
      if (Math.floor(cell / dims[0]) % dims[1] > 0 && live(cell) && !live(cell - dims[0])) {
        cells.push(cell);
      }
    }
    const made = { carved: actor.carved, severed: actor.severed.length, cells: Int32Array.from(cells) };
    this.dripCells.set(actor, made);
    return made.cells;
  }

  /** Player wounds drip from their matching world-figure region in either camera view. */
  private dripPlayer(dt: number, player: GorePlayer | undefined): void {
    if (!player) {
      return;
    }
    this.playerPlacement.bodyPosition = player.pos;
    this.playerPlacement.yaw = player.yaw;
    this.playerPlacement.blockSize = this.blockSize;
    for (const region of BODY_REGIONS) {
      const drip = player.drip(region);
      if (!(drip && this.rng.chance(DRIPS_PER_SECOND * drip.rate * dt))) {
        continue;
      }
      setPlayerDripOrigin(this.origin, this.playerPlacement, region);
      if (
        !this.emit(this.origin, this.scratch.set(0, -0.2, 0), this.rng.range(0.01, 0.02) * drip.size, DROPLET_MAX_AGE_S)
      ) {
        return;
      }
    }
  }

  /** Moves one axis at a time; the first solid block met takes a splat on the face it hit. */
  private advance(droplet: Droplet, dt: number, isSolid: (x: number, y: number, z: number) => boolean): void {
    const { position, velocity } = droplet;
    const s = this.blockSize;
    velocity.y -= this.gravityMetresPerSimSecondSquared * dt;
    for (const axis of AXES) {
      const speed = velocity.getComponent(axis);
      const next = position.getComponent(axis) + speed * dt;
      const bx = Math.floor((axis === 0 ? next : position.x) / s);
      const by = Math.floor((axis === 1 ? next : position.y) / s);
      const bz = Math.floor((axis === 2 ? next : position.z) / s);
      if (!isSolid(bx, by, bz)) {
        position.setComponent(axis, next);
        continue;
      }
      position.setComponent(axis, (Math.floor(next / s) + (speed > 0 ? 0 : 1)) * s);
      this.normal.set(0, 0, 0).setComponent(axis, speed > 0 ? -1 : 1);
      this.splat(position, this.normal, droplet.sizeMetres * this.rng.range(2.5, 4.5));
      droplet.active = false;
      return;
    }
  }

  /** Lays a splat with a droplet's life, which the caller may change; returns its slot, -1 if there is no pool. */
  private splat(point: Vector3, normal: Vector3, radiusMetres: number): number {
    if (this.splats.length === 0) {
      return -1;
    }
    const slot = this.nextSplat;
    this.nextSplat = (this.nextSplat + 1) % this.tuning.splatCap;
    const splat = this.splats[slot]!;
    splat.active = true;
    splat.generation += 1;
    splat.ageRealSeconds = 0;
    splat.lifeRealSeconds = SPLAT_LIFE_S;
    splat.fadeRealSeconds = SPLAT_FADE_S;
    // Successive splats sit a hair apart so overlapping ones don't fight for depth.
    this.dummy.position.copy(point).addScaledVector(normal, 0.003 + (slot % 8) * 0.0004);
    this.dummy.quaternion
      .setFromUnitVectors(FACE_NORMAL, normal)
      .multiply(this.turn.setFromAxisAngle(FACE_NORMAL, this.rng.range(0, Math.PI * 2)));
    this.dummy.scale.set(radiusMetres * this.rng.range(0.8, 1.25), radiusMetres * this.rng.range(0.8, 1.25), 1);
    this.dummy.updateMatrix();
    this.splatMesh.setMatrixAt(slot, this.dummy.matrix);
    this.splatMesh.instanceMatrix.needsUpdate = true;
    this.splatOpacity.setX(slot, SPLAT_OPACITY);
    this.splatOpacity.needsUpdate = true;
    return slot;
  }

  private retireSplat(slot: number): void {
    this.splats[slot]!.active = false;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.splatMesh.setMatrixAt(slot, this.dummy.matrix);
    this.splatMesh.instanceMatrix.needsUpdate = true;
  }

  private fadeSplats(dt: number): void {
    for (let slot = 0; slot < this.tuning.splatCap; slot++) {
      const splat = this.splats[slot]!;
      if (!splat.active) {
        continue;
      }
      splat.ageRealSeconds += dt;
      const left = splat.lifeRealSeconds - splat.ageRealSeconds;
      this.splatOpacity.setX(slot, SPLAT_OPACITY * Math.min(1, Math.max(0, left / splat.fadeRealSeconds)));
      this.splatOpacity.needsUpdate = true;
      if (left <= 0) {
        this.retireSplat(slot);
      }
    }
  }

  /** Each droplet stretches along its velocity, so it reads wet in flight. */
  private drawDroplets(): void {
    for (let slot = 0; slot < this.tuning.dropletCap; slot++) {
      const droplet = this.droplets[slot]!;
      if (droplet.active) {
        const speed = droplet.velocity.length();
        this.dummy.position.copy(droplet.position);
        this.dummy.quaternion.setFromUnitVectors(
          FACE_NORMAL,
          speed > 1e-6 ? this.scratch.copy(droplet.velocity).divideScalar(speed) : FACE_NORMAL,
        );
        this.dummy.scale.set(droplet.sizeMetres, droplet.sizeMetres, droplet.sizeMetres + speed * 0.015);
      } else {
        this.dummy.scale.setScalar(0);
      }
      this.dummy.updateMatrix();
      this.dropletMesh.setMatrixAt(slot, this.dummy.matrix);
    }
    this.dropletMesh.instanceMatrix.needsUpdate = true;
  }
}
