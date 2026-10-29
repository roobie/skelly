import { CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { AcidGlobState } from '../core/acidGlob.ts';
import type { AcidPuddleState } from '../core/acidPuddle.ts';
import type { ZombieDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { DEFAULT_WORLD_GRAVITY } from '../core/defaultGravity.ts';
import { Rng } from '../core/random.ts';
import type { Zombie } from '../core/zombies.ts';
import type { DrawnAnchors } from './mobActors.ts';

type Appearance = NonNullable<ZombieDef['acidSpit']>['presentation'];

/** A falling acid droplet; it vanishes once it drops below the floor its body stood on. Metres. */
interface Droplet {
  readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly velocity: [number, number, number];
  readonly floor: number;
}

interface DropletSpec {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly color: string;
  readonly sizeMetres: number;
  readonly floor: number;
}

export class AcidEffects {
  readonly group = new Group();
  private readonly geometry = new SphereGeometry(1, 8, 6);
  private readonly globs: Mesh<SphereGeometry, MeshBasicMaterial>[] = [];
  private readonly splashes: { mesh: Mesh<SphereGeometry, MeshBasicMaterial>; age: number; look: Appearance }[] = [];

  private readonly puddleGeometry = new CircleGeometry(1, 24);
  private readonly puddles: Mesh<CircleGeometry, MeshBasicMaterial>[] = [];

  private readonly droplets: Droplet[] = [];
  private readonly dropletMaterials = new Map<string, MeshBasicMaterial>();
  private readonly dripDue = new WeakMap<Zombie, number>();
  private readonly rng: Rng;

  private readonly blockSize: number;
  private readonly gravityMetresPerSimSecondSquared: number;

  constructor(blockSize: number, gravityMetresPerSimSecondSquared = DEFAULT_WORLD_GRAVITY, seed = 1) {
    this.blockSize = blockSize;
    this.gravityMetresPerSimSecondSquared = gravityMetresPerSimSecondSquared;
    this.rng = Rng.stream(seed, 'acid-effects');
  }

  private droplet({ position, velocity, color, sizeMetres, floor }: DropletSpec): void {
    let material = this.dropletMaterials.get(color);
    if (!material) {
      material = new MeshBasicMaterial({ color });
      this.dropletMaterials.set(color, material);
    }
    const mesh = new Mesh(this.geometry, material);
    mesh.position.set(...position);
    mesh.scale.setScalar(sizeMetres);
    this.group.add(mesh);
    this.droplets.push({ mesh, velocity: [...velocity], floor });
  }

  /** The sac bursting as an acid zombie dies: droplets thrown out from `position` (metres). Presentation only. */
  deathSplash(position: Vec3, zombie: Zombie): void {
    const body = zombie.type.acidBody;
    if (!body) {
      return;
    }
    const { droplets, speedMetresPerRealSecond, slowestSpeedFraction, sizeMetres } = body.deathSplash;
    const floor = zombie.body.pos[1] * this.blockSize;
    for (let index = 0; index < droplets; index++) {
      const azimuth = this.rng.range(0, 2 * Math.PI);
      const rise = this.rng.range(-0.2, 1);
      const across = Math.sqrt(1 - rise * rise);
      const speed = speedMetresPerRealSecond * this.rng.range(slowestSpeedFraction, 1);
      this.droplet({
        position,
        velocity: [Math.cos(azimuth) * across * speed, rise * speed, Math.sin(azimuth) * across * speed],
        color: body.color,
        sizeMetres,
        floor,
      });
    }
  }

  /** Acid dripping from each drawn acid mouth at its content rate. Presentation only. */
  private drip(anchors: Iterable<DrawnAnchors>, dt: number): void {
    for (const { zombie, mouth } of anchors) {
      const body = zombie.type.acidBody;
      if (!(body && mouth)) {
        continue;
      }
      let due = (this.dripDue.get(zombie) ?? this.rng.range(0, 1)) - dt * body.drips.perRealSecond;
      while (due <= 0) {
        this.droplet({
          position: mouth,
          velocity: [0, 0, 0],
          color: body.color,
          sizeMetres: body.drips.sizeMetres,
          floor: zombie.body.pos[1] * this.blockSize,
        });
        due += 1;
      }
      this.dripDue.set(zombie, due);
    }
  }

  private fall(dt: number): void {
    for (let index = this.droplets.length - 1; index >= 0; index--) {
      const { mesh, velocity, floor } = this.droplets[index]!;
      velocity[1] -= this.gravityMetresPerSimSecondSquared * dt;
      mesh.position.x += velocity[0] * dt;
      mesh.position.y += velocity[1] * dt;
      mesh.position.z += velocity[2] * dt;
      if (mesh.position.y < floor) {
        mesh.removeFromParent();
        this.droplets.splice(index, 1);
      }
    }
  }

  /** Live acid droplets (drips and splash), for tests and the smoke flow. */
  dropletCount(): number {
    return this.droplets.length;
  }

  splash(position: Vec3, look: Appearance): void {
    const mesh = new Mesh(
      this.geometry,
      new MeshBasicMaterial({ color: look.color, transparent: true, depthWrite: false }),
    );
    mesh.position.set(position[0] * this.blockSize, position[1] * this.blockSize, position[2] * this.blockSize);
    mesh.scale.setScalar(look.radiusMetres);
    this.group.add(mesh);
    this.splashes.push({ mesh, age: 0, look });
  }

  /** Drips from the drawn acid mouths, then moves and expires every droplet. Presentation only. */
  syncDroplets(anchors: Iterable<DrawnAnchors>, dt: number): void {
    this.drip(anchors, dt);
    this.fall(dt);
  }

  sync(
    states: readonly Readonly<AcidGlobState>[],
    puddles: readonly Readonly<AcidPuddleState>[],
    types: ReadonlyMap<string, ZombieDef>,
    dt: number,
  ): void {
    while (this.puddles.length > puddles.length) {
      const mesh = this.puddles.pop()!;
      mesh.removeFromParent();
      mesh.material.dispose();
    }
    for (const [index, state] of puddles.entries()) {
      let mesh = this.puddles[index];
      if (!mesh) {
        mesh = new Mesh(
          this.puddleGeometry,
          new MeshBasicMaterial({
            side: DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        this.group.add(mesh);
        this.puddles.push(mesh);
      }
      const spit = types.get(state.type)!.acidSpit!;
      mesh.material.color.set(spit.presentation.color);
      mesh.scale.setScalar(spit.puddle.radiusMetres);
      mesh.position.set(state.pos[0] * this.blockSize, state.pos[1] * this.blockSize, state.pos[2] * this.blockSize);
    }
    while (this.globs.length > states.length) {
      const mesh = this.globs.pop()!;
      mesh.removeFromParent();
      mesh.material.dispose();
    }
    for (const [index, state] of states.entries()) {
      let mesh = this.globs[index];
      if (!mesh) {
        mesh = new Mesh(this.geometry, new MeshBasicMaterial());
        this.group.add(mesh);
        this.globs.push(mesh);
      }
      const look = types.get(state.type)!.acidSpit!.presentation;
      mesh.material.color.set(look.color);
      mesh.scale.setScalar(look.radiusMetres);
      mesh.position.set(state.pos[0] * this.blockSize, state.pos[1] * this.blockSize, state.pos[2] * this.blockSize);
    }
    for (let index = this.splashes.length - 1; index >= 0; index--) {
      const splash = this.splashes[index]!;
      splash.age += dt;
      const fraction = Math.min(1, splash.age / splash.look.splashRealSeconds);
      splash.mesh.scale.setScalar(
        splash.look.radiusMetres + fraction * (splash.look.splashRadiusMetres - splash.look.radiusMetres),
      );
      splash.mesh.material.opacity = 1 - fraction;
      if (fraction === 1) {
        splash.mesh.removeFromParent();
        splash.mesh.material.dispose();
        this.splashes.splice(index, 1);
      }
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.puddleGeometry.dispose();
    for (const mesh of this.puddles) {
      mesh.material.dispose();
    }
    this.puddles.length = 0;
    for (const mesh of this.globs) {
      mesh.material.dispose();
    }
    for (const { mesh } of this.splashes) {
      mesh.material.dispose();
    }
    this.globs.length = 0;
    this.splashes.length = 0;
    for (const material of this.dropletMaterials.values()) {
      material.dispose();
    }
    this.dropletMaterials.clear();
    this.droplets.length = 0;
    this.group.clear();
  }
}
