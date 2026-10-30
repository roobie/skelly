// Render-only gore: blood thrown from wounds, splats where it lands, and drips from wounded bodies. Nothing
// here is saved or read by the simulation: splats fade, and a reload starts clean. It runs every frame under
// crowds, so the per-frame path allocates nothing: pools, slots and vectors are made once and reused.

import {
  BoxGeometry,
  CircleGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { BODY_REGIONS, type BodyRegion } from '../core/body.ts';
import type { Vec3 } from '../core/coords.ts';
import type { EntityStore } from '../core/entities.ts';
import { Rng } from '../core/random.ts';
import type { GraphicsTuningDef } from '../core/schema.ts';
import type { HitImpulse, Zombie } from '../core/zombies.ts';
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

type SeveredSpurt = Zombie['type']['severedSpurt'];

interface Splat {
  active: boolean;
  ageRealSeconds: number;
}

/** One of the nearest wounded bodies, picked afresh each update. */
interface Dripper {
  zombie: Zombie | undefined;
  distanceBlocks: number;
  severity: number;
}

interface SeverityMemo {
  update: number;
  value: number;
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
  readonly zombies: Pick<EntityStore<Zombie>, 'entries'>;
  readonly listener: Vec3;
  readonly player?: GorePlayer;
}

const setPlayerDripOrigin = (
  target: Vector3,
  placement: PlayerFigurePlacement,
  region: (typeof BODY_REGIONS)[number],
): void => {
  setPlayerFigurePosition(target, placement, PLAYER_REGION_BOXES[region].at);
};

const regionNameLists = new WeakMap<Zombie['type']['regions'], readonly string[]>();

/** A type's region names, listed once per type rather than once per body per frame. */
const regionNames = (maxima: Zombie['type']['regions']): readonly string[] => {
  let names = regionNameLists.get(maxima);
  if (!names) {
    names = Object.keys(maxima);
    regionNameLists.set(maxima, names);
  }
  return names;
};

/** How badly a body bleeds, 0 to 1, from its saved wounds: health lost across its regions, severed parts and
 * carved flesh. Derived, so drips and the bloodied tint survive a reload with no state of their own. */
export const woundSeverity = (zombie: Pick<Zombie, 'type' | 'regions' | 'severed' | 'carved'>): number => {
  let full = 0;
  let left = 0;
  const maxima = zombie.type.regions;
  for (const region of regionNames(maxima)) {
    const max = maxima[region]!;
    full += max;
    left += Math.min(max, Math.max(0, zombie.regions[region] ?? 0));
  }
  const lost = full > 0 ? 1 - left / full : 0;
  return Math.min(
    1,
    lost + zombie.severed.length * SEVERED_PART_SEVERITY + zombie.carved.length * CARVED_CELL_SEVERITY,
  );
};

/** Fades each splat by its own opacity, which three's built-in materials have no per-instance slot for. */
const patchSplatOpacity = (material: MeshLambertMaterial): void => {
  material.customProgramCacheKey = () => 'deadvox-gore-splat';
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
  private readonly severities = new WeakMap<Zombie, SeverityMemo>();
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
  private nextDroplet = 0;
  private nextSplat = 0;
  private spawnedSinceUpdate = 0;
  private dripperCount = 0;
  private updates = 0;

  constructor(blockSize: number, gravityMetresPerSimSecondSquared: number, tuning: GoreTuning, seed = 1) {
    this.blockSize = blockSize;
    this.gravityMetresPerSimSecondSquared = gravityMetresPerSimSecondSquared;
    this.tuning = tuning;
    this.rng = Rng.stream(seed, 'gore');
    this.droplets = Array.from({ length: tuning.dropletCap }, () => ({
      active: false,
      position: new Vector3(),
      velocity: new Vector3(),
      ageRealSeconds: 0,
      maxAgeRealSeconds: DROPLET_MAX_AGE_S,
      sizeMetres: 0,
    }));
    this.splats = Array.from({ length: tuning.splatCap }, () => ({ active: false, ageRealSeconds: 0 }));
    this.drippers = Array.from({ length: tuning.dripSourceCap }, () => ({
      zombie: undefined,
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

  /** A body's woundSeverity, worked out at most once per update: the drips and the stains on live bodies
   * (mobActors.ts) both read it every frame. */
  severity(zombie: Zombie): number {
    const memo = this.severities.get(zombie);
    if (memo?.update === this.updates) {
      return memo.value;
    }
    const value = woundSeverity(zombie);
    if (memo) {
      memo.update = this.updates;
      memo.value = value;
    } else {
      this.severities.set(zombie, { update: this.updates, value });
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

  /** The extra burst as flesh is carved out of an amalgam, on top of the wound's own spray: more for a
   * bigger hole. */
  carved(hit: HitImpulse, cells: number): void {
    this.spray(hit, cells * CARVED_CELL_SPRAY_DAMAGE);
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

  /** A large splat on the floor under something wet that came to rest there, such as a chunk of amalgam
   * flesh (its centre, metres). The floor is the top of the block the centre is in. */
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
    this.fadeSplats(step);
    this.pickDrippers(bodies);
    this.drip(step);
    this.dripPlayer(step, bodies?.player);
    this.drawDroplets();
    this.spawnedSinceUpdate = 0;
  }

  dispose(): void {
    this.group.clear();
    for (const mesh of [this.dropletMesh, this.splatMesh]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
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
    for (const [, zombie] of bodies.zombies.entries()) {
      const { pos } = zombie.body;
      const distanceBlocks = Math.hypot(pos[0] - lx, pos[1] - ly, pos[2] - lz);
      const full = this.dripperCount === this.tuning.dripSourceCap;
      if (
        distanceBlocks > rangeBlocks ||
        (full && distanceBlocks >= this.drippers[this.tuning.dripSourceCap - 1]!.distanceBlocks)
      ) {
        continue;
      }
      const severity = this.severity(zombie);
      if (severity > 0) {
        this.insertDripper(zombie, distanceBlocks, severity);
      }
    }
  }

  /** Keeps the drippers sorted by distance: takes a free slot, or the farthest's when full, and moves it in
   * behind the last one nearer than it. */
  private insertDripper(zombie: Zombie, distanceBlocks: number, severity: number): void {
    let index = Math.min(this.dripperCount, this.tuning.dripSourceCap - 1);
    const slot = this.drippers[index]!;
    while (index > 0 && this.drippers[index - 1]!.distanceBlocks > distanceBlocks) {
      this.drippers[index] = this.drippers[index - 1]!;
      index -= 1;
    }
    slot.zombie = zombie;
    slot.distanceBlocks = distanceBlocks;
    slot.severity = severity;
    this.drippers[index] = slot;
    this.dripperCount = Math.min(this.dripperCount + 1, this.tuning.dripSourceCap);
  }

  private drip(dt: number): void {
    const s = this.blockSize;
    for (let index = 0; index < this.dripperCount; index++) {
      const { zombie, severity } = this.drippers[index]!;
      if (!(zombie && this.rng.chance(DRIPS_PER_SECOND * severity * dt))) {
        continue;
      }
      const { pos, halfWidth, height } = zombie.body;
      const reach = halfWidth * s;
      const heightMetres = zombie.incapacitated ? DOWNED_DRIP_HEIGHT_M : height * s;
      const x = pos[0] * s + this.rng.range(-reach, reach);
      const y = pos[1] * s + heightMetres * this.rng.range(0.35, 0.85);
      const z = pos[2] * s + this.rng.range(-reach, reach);
      if (
        !this.emit(
          this.origin.set(x, y, z),
          this.scratch.set(0, -0.2, 0),
          this.rng.range(0.01, 0.02),
          DROPLET_MAX_AGE_S,
        )
      ) {
        return;
      }
    }
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

  private splat(point: Vector3, normal: Vector3, radiusMetres: number): void {
    if (this.splats.length === 0) {
      return;
    }
    const slot = this.nextSplat;
    this.nextSplat = (this.nextSplat + 1) % this.tuning.splatCap;
    const splat = this.splats[slot]!;
    splat.active = true;
    splat.ageRealSeconds = 0;
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
  }

  private fadeSplats(dt: number): void {
    for (let slot = 0; slot < this.tuning.splatCap; slot++) {
      const splat = this.splats[slot]!;
      if (!splat.active) {
        continue;
      }
      splat.ageRealSeconds += dt;
      const left = SPLAT_LIFE_S - splat.ageRealSeconds;
      this.splatOpacity.setX(slot, SPLAT_OPACITY * Math.min(1, Math.max(0, left / SPLAT_FADE_S)));
      this.splatOpacity.needsUpdate = true;
      if (left <= 0) {
        splat.active = false;
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.splatMesh.setMatrixAt(slot, this.dummy.matrix);
        this.splatMesh.instanceMatrix.needsUpdate = true;
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
