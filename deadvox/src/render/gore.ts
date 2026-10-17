// Render-only gore: blood thrown from wounds, splats where it lands, drips from wounded bodies, and an acid
// zombie's drool and death burst. Nothing here is saved or read by the simulation: splats fade, and a reload
// starts clean. It runs every frame under crowds, so the per-frame path allocates nothing: pools, slots and
// vectors are made once and reused.

import {
  BoxGeometry,
  CircleGeometry,
  Color,
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
import type { ZombieDef } from '../core/schema.ts';
import { humanoidMouthOrigin, humanoidSacOrigin } from '../core/zombieFigure.ts';
import type { HitImpulse, Zombie } from '../core/zombies.ts';
import { PLAYER_REGION_BOXES, type PlayerFigurePlacement, setPlayerFigurePosition } from './playerFigure.ts';

/** Droplets in flight at once; a new one replaces the oldest. */
export const DROPLET_CAP = 128;
/** Splats on surfaces at once; a new one replaces the oldest. */
export const SPLAT_CAP = 256;
/** Droplets that may start between two updates, across sprays and drips; the rest of a burst is skipped. */
export const DROPLET_SPAWNS_PER_FRAME = 48;
/** Wounded bodies that drip at once: the nearest ones. */
const DRIP_SOURCE_CAP = 6;

// Presentation tuning, not gameplay.
const GRAVITY_MPS2 = 9.81;
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
/** A burst droplet's speed varies down to this share of the type's speed, so the burst reads as a spray. */
const BURST_SLOWEST_FRACTION = 0.5;
const FACE_NORMAL = new Vector3(0, 0, 1);
const AXES = [0, 1, 2] as const;

/** What a droplet looks like in flight and the stain it leaves where it lands. */
interface Tint {
  readonly droplet: Color;
  readonly splat: Color;
}

const BLOOD: Tint = { droplet: new Color(DROPLET_COLOR), splat: new Color(SPLAT_COLOR) };

type AcidEffects = NonNullable<ZombieDef['acidEffects']>;

const acidTints = new WeakMap<AcidEffects, Tint>();

/** A type's acid colour, made once per type rather than once per droplet. */
const acidTint = (effects: AcidEffects): Tint => {
  let tint = acidTints.get(effects);
  if (!tint) {
    const color = new Color(effects.color);
    tint = { droplet: color, splat: color };
    acidTints.set(effects, tint);
  }
  return tint;
};

interface Droplet {
  active: boolean;
  readonly position: Vector3;
  readonly velocity: Vector3;
  ageRealSeconds: number;
  sizeMetres: number;
  tint: Tint;
}

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

/** Gives every instance of `mesh` its own colour, starting at `fill`. */
const tintColors = (mesh: InstancedMesh, fill: Color): InstancedBufferAttribute => {
  const colors = new InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
  colors.setUsage(DynamicDrawUsage);
  mesh.instanceColor = colors;
  for (let slot = 0; slot < mesh.count; slot++) {
    mesh.setColorAt(slot, fill);
  }
  return colors;
};

export class Gore {
  readonly group = new Group();
  private readonly blockSize: number;
  private readonly rng: Rng;
  private readonly droplets: Droplet[];
  private readonly splats: Splat[];
  private readonly drippers: Dripper[];
  private readonly severities = new WeakMap<Zombie, SeverityMemo>();
  private readonly dropletMesh: InstancedMesh<BoxGeometry, MeshLambertMaterial>;
  private readonly splatMesh: InstancedMesh<CircleGeometry, MeshLambertMaterial>;
  private readonly splatOpacity: InstancedBufferAttribute;
  private readonly dropletColors: InstancedBufferAttribute;
  private readonly splatColors: InstancedBufferAttribute;
  private readonly dummy = new Object3D();
  private readonly turn = new Quaternion();
  private readonly scratch = new Vector3();
  private readonly origin = new Vector3();
  private readonly point = new Vector3();
  private readonly playerPlacement: PlayerFigurePlacement = {
    bodyPosition: [0, 0, 0],
    yaw: 0,
    blockSize: 1,
    thirdPerson: false,
  };
  private readonly normal = new Vector3();
  private nextDroplet = 0;
  private nextSplat = 0;
  private spawnedSinceUpdate = 0;
  private dripperCount = 0;
  private updates = 0;

  constructor(blockSize: number, seed = 1) {
    this.blockSize = blockSize;
    this.rng = Rng.stream(seed, 'gore');
    this.droplets = Array.from({ length: DROPLET_CAP }, () => ({
      active: false,
      position: new Vector3(),
      velocity: new Vector3(),
      ageRealSeconds: 0,
      sizeMetres: 0,
      tint: BLOOD,
    }));
    this.splats = Array.from({ length: SPLAT_CAP }, () => ({ active: false, ageRealSeconds: 0 }));
    this.drippers = Array.from({ length: DRIP_SOURCE_CAP }, () => ({
      zombie: undefined,
      distanceBlocks: 0,
      severity: 0,
    }));
    // Colour comes per instance, so blood and acid share one draw each; white leaves it unchanged.
    this.dropletMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), DROPLET_CAP);
    const splatMaterial = new MeshLambertMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    patchSplatOpacity(splatMaterial);
    this.splatMesh = new InstancedMesh(new CircleGeometry(1, 9), splatMaterial, SPLAT_CAP);
    this.splatOpacity = new InstancedBufferAttribute(new Float32Array(SPLAT_CAP), 1);
    this.splatOpacity.setUsage(DynamicDrawUsage);
    this.splatMesh.geometry.setAttribute('splatOpacity', this.splatOpacity);
    // Made before the first draw, so the materials compile with per-instance colour.
    this.dropletColors = tintColors(this.dropletMesh, BLOOD.droplet);
    this.splatColors = tintColors(this.splatMesh, BLOOD.splat);
    for (const mesh of [this.dropletMesh, this.splatMesh]) {
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let slot = 0; slot < SPLAT_CAP; slot++) {
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
      if (!this.emit(this.origin, direction, this.rng.range(0.012, 0.026))) {
        return;
      }
    }
  }

  /** The extra burst as flesh is carved out of an amalgam, on top of the wound's own spray: more for a
   * bigger hole. */
  carved(hit: HitImpulse, cells: number): void {
    this.spray(hit, cells * CARVED_CELL_SPRAY_DAMAGE);
  }

  /** A large splat on the floor under something wet that came to rest there, such as a chunk of amalgam
   * flesh (its centre, metres). The floor is the top of the block the centre is in. */
  landed(centre: Vec3): void {
    const floor = Math.floor(centre[1] / this.blockSize) * this.blockSize;
    this.splat(
      this.point.set(centre[0], floor, centre[2]),
      this.normal.set(0, 1, 0),
      this.rng.range(0.14, 0.24),
      BLOOD.splat,
    );
  }

  /** An acid zombie's sac bursting as it dies, thrown every way from the sac at its type's speed. Other
   * types leave no burst. */
  burst(zombie: Zombie): void {
    const effects = zombie.type.acidEffects;
    if (!effects) {
      return;
    }
    const s = this.blockSize;
    const { pos } = zombie.body;
    const [x, y, z] = humanoidSacOrigin(zombie.type.model, zombie.figureSeed, zombie.facing);
    this.origin.set(pos[0] * s + x, pos[1] * s + y, pos[2] * s + z);
    const { droplets, speedMetresPerRealSecond, sizeMetres } = effects.deathBurst;
    const tint = acidTint(effects);
    for (let i = 0; i < droplets; i++) {
      const direction = this.scratch
        .set(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1))
        .normalize()
        .multiplyScalar(speedMetresPerRealSecond * this.rng.range(BURST_SLOWEST_FRACTION, 1));
      if (!this.emit(this.origin, direction, sizeMetres, tint)) {
        return;
      }
    }
  }

  /** Flies the droplets, leaves a splat where each lands, fades the splats, lets the nearest wounded
   * bodies drip and acid zombies in range drool. */
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
      if (droplet.ageRealSeconds >= DROPLET_MAX_AGE_S) {
        droplet.active = false;
      }
    }
    this.fadeSplats(step);
    this.pickDrippers(bodies);
    this.drip(step);
    this.dripPlayer(step, bodies?.player);
    this.drool(step, bodies);
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
  private emit(origin: Vector3, velocity: Vector3, sizeMetres: number, tint = BLOOD): boolean {
    if (this.spawnedSinceUpdate >= DROPLET_SPAWNS_PER_FRAME) {
      return false;
    }
    this.spawnedSinceUpdate += 1;
    const slot = this.nextDroplet;
    const droplet = this.droplets[slot]!;
    this.nextDroplet = (slot + 1) % DROPLET_CAP;
    droplet.active = true;
    droplet.ageRealSeconds = 0;
    droplet.sizeMetres = sizeMetres;
    droplet.position.copy(origin);
    droplet.velocity.copy(velocity);
    if (droplet.tint !== tint) {
      droplet.tint = tint;
      this.dropletMesh.setColorAt(slot, tint.droplet);
      this.dropletColors.needsUpdate = true;
    }
    return true;
  }

  /** Acid drools from the jaw of each living acid zombie in range, at its type's rate. The jaw is found only
   * for a drop that falls, since finding it allocates. */
  private drool(dt: number, bodies: GoreBodies | undefined): void {
    if (!bodies) {
      return;
    }
    const s = this.blockSize;
    const [lx, ly, lz] = bodies.listener;
    const rangeBlocks = DRIP_RANGE_M / s;
    for (const [, zombie] of bodies.zombies.entries()) {
      const effects = zombie.type.acidEffects;
      const { pos } = zombie.body;
      if (
        !effects ||
        zombie.incapacitated ||
        Math.hypot(pos[0] - lx, pos[1] - ly, pos[2] - lz) > rangeBlocks ||
        !this.rng.chance(effects.drips.perRealSecond * dt)
      ) {
        continue;
      }
      const [x, y, z] = humanoidMouthOrigin(zombie.type.model, zombie.figureSeed, zombie.facing);
      this.origin.set(pos[0] * s + x, pos[1] * s + y, pos[2] * s + z);
      if (!this.emit(this.origin, this.scratch.set(0, -0.2, 0), effects.drips.sizeMetres, acidTint(effects))) {
        return;
      }
    }
  }

  /** The nearest wounded bodies within range, nearest first; distance is checked before the severity. */
  private pickDrippers(bodies: GoreBodies | undefined): void {
    this.dripperCount = 0;
    if (!bodies) {
      return;
    }
    const [lx, ly, lz] = bodies.listener;
    const rangeBlocks = DRIP_RANGE_M / this.blockSize;
    for (const [, zombie] of bodies.zombies.entries()) {
      const { pos } = zombie.body;
      const distanceBlocks = Math.hypot(pos[0] - lx, pos[1] - ly, pos[2] - lz);
      const full = this.dripperCount === DRIP_SOURCE_CAP;
      if (
        distanceBlocks > rangeBlocks ||
        (full && distanceBlocks >= this.drippers[DRIP_SOURCE_CAP - 1]!.distanceBlocks)
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
    let index = Math.min(this.dripperCount, DRIP_SOURCE_CAP - 1);
    const slot = this.drippers[index]!;
    while (index > 0 && this.drippers[index - 1]!.distanceBlocks > distanceBlocks) {
      this.drippers[index] = this.drippers[index - 1]!;
      index -= 1;
    }
    slot.zombie = zombie;
    slot.distanceBlocks = distanceBlocks;
    slot.severity = severity;
    this.drippers[index] = slot;
    this.dripperCount = Math.min(this.dripperCount + 1, DRIP_SOURCE_CAP);
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
      if (!this.emit(this.origin.set(x, y, z), this.scratch.set(0, -0.2, 0), this.rng.range(0.01, 0.02))) {
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
    this.playerPlacement.thirdPerson = player.thirdPerson;
    for (const region of BODY_REGIONS) {
      const drip = player.drip(region);
      if (!(drip && this.rng.chance(DRIPS_PER_SECOND * drip.rate * dt))) {
        continue;
      }
      setPlayerDripOrigin(this.origin, this.playerPlacement, region);
      if (!this.emit(this.origin, this.scratch.set(0, -0.2, 0), this.rng.range(0.01, 0.02) * drip.size)) {
        return;
      }
    }
  }

  /** Moves one axis at a time; the first solid block met takes a splat on the face it hit. */
  private advance(droplet: Droplet, dt: number, isSolid: (x: number, y: number, z: number) => boolean): void {
    const { position, velocity } = droplet;
    const s = this.blockSize;
    velocity.y -= GRAVITY_MPS2 * dt;
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
      this.splat(position, this.normal, droplet.sizeMetres * this.rng.range(2.5, 4.5), droplet.tint.splat);
      droplet.active = false;
      return;
    }
  }

  private splat(point: Vector3, normal: Vector3, radiusMetres: number, color: Color): void {
    const slot = this.nextSplat;
    this.nextSplat = (this.nextSplat + 1) % SPLAT_CAP;
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
    this.splatMesh.setColorAt(slot, color);
    this.splatColors.needsUpdate = true;
  }

  private fadeSplats(dt: number): void {
    for (let slot = 0; slot < SPLAT_CAP; slot++) {
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
    for (let slot = 0; slot < DROPLET_CAP; slot++) {
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
