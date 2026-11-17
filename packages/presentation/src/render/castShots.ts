import type { AbilityDef } from '@skelly/engine/content';
import type { CastProjectileState } from '@skelly/engine/sim';
import {
  AdditiveBlending,
  Color,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BodyGlow } from './lightPool.ts';

type ShotLook = AbilityDef['projectile'];
type Shot = Readonly<CastProjectileState>;

// Draw budgets: shots past them still fly and hit, they are only not drawn.
const SHOTS = 32;
const SPARKS = 768;
const FLASHES = 16;
/** Spark drift directions repeat after this many sparks; enough that neighbours never share one. */
const DRIFT_DIRECTIONS = 64;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface Track {
  readonly look: ShotLook;
  /** The drawn position last frame, metres. */
  readonly last: Vector3;
  /** Metres travelled since the last spark. */
  sinceSpark: number;
}

interface Spark {
  readonly position: Vector3;
  readonly drift: Vector3;
  readonly color: Color;
  readonly look: ShotLook['trail'];
  age: number;
}

interface Flash {
  readonly position: Vector3;
  readonly look: ShotLook;
  age: number;
}

const additive = () =>
  new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

/**
 * Cast shots in flight: an unlit core in an additive halo, a fading spark trail, a flash where each ends and a
 * point light on each shot and flash. Presentation only: it reads the simulation's shots and keeps no state the
 * simulation sees, and its sparks drift along a fixed spiral rather than a random stream.
 */
export class CastShots {
  readonly group = new Group();
  private readonly blockSize: number;
  private readonly sphere = new SphereGeometry(1, 12, 8);
  private readonly sparkGeometry = new IcosahedronGeometry(1, 0);
  private readonly cores = new InstancedMesh(this.sphere, new MeshBasicMaterial({ toneMapped: false }), SHOTS);
  private readonly halos = new InstancedMesh(this.sphere, additive(), SHOTS);
  private readonly sparkMesh = new InstancedMesh(this.sparkGeometry, additive(), SPARKS);
  private readonly flashMesh = new InstancedMesh(this.sphere, additive(), FLASHES);
  private readonly tracks = new Map<Shot, Track>();
  private readonly sparks: Spark[] = [];
  private readonly flashes: Flash[] = [];
  private readonly lights: BodyGlow[] = [];
  private sparkCount = 0;
  private readonly dummy = new Object3D();
  private readonly color = new Color();
  private readonly drawn = new Vector3();
  private readonly step = new Vector3();

  constructor(blockSize: number) {
    this.blockSize = blockSize;
    for (const mesh of [this.cores, this.halos, this.sparkMesh, this.flashMesh]) {
      // Instances move every frame, so a bounding sphere computed once would cull them wrongly.
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
    }
  }

  /**
   * Draws `shots` `aheadSimSeconds` past the actor step that placed them, so a shot glides between steps rather
   * than jumping a step's travel at a time; `dt` is real seconds.
   */
  sync(shots: readonly Shot[], look: (shot: Shot) => ShotLook, aheadSimSeconds: number, dt: number): void {
    this.age(dt);
    this.lights.length = 0;
    const live = new Set(shots);
    const drawnShots = Math.min(shots.length, SHOTS);
    for (const [index, shot] of shots.entries()) {
      this.drawnPosition(shot, aheadSimSeconds, this.drawn);
      const track = this.tracks.get(shot) ?? this.track(shot, look(shot), this.drawn);
      this.trail(track, this.drawn);
      if (index < drawnShots) {
        this.place(this.cores, index, this.drawn, track.look.core);
        this.place(this.halos, index, this.drawn, track.look.halo);
      }
      this.glow(this.drawn, track.look, 1);
    }
    this.finish(this.cores, drawnShots);
    this.finish(this.halos, drawnShots);
    for (const [shot, track] of this.tracks) {
      if (!live.has(shot)) {
        this.end(shot, track);
      }
    }
    this.drawSparks();
    this.drawFlashes();
  }

  /** This frame's shot and flash lights, in metres, for the light pool's free slots. */
  glows(): readonly BodyGlow[] {
    return this.lights;
  }

  dispose(): void {
    this.sphere.dispose();
    this.sparkGeometry.dispose();
    for (const mesh of [this.cores, this.halos, this.sparkMesh, this.flashMesh]) {
      mesh.material.dispose();
      mesh.dispose();
    }
    this.tracks.clear();
    this.sparks.length = 0;
    this.flashes.length = 0;
    this.group.clear();
  }

  /** A shot trails from where it is first drawn, not from its launch at the caster's eye, which sparks would fill. */
  private track(shot: Shot, look: ShotLook, drawn: Vector3): Track {
    const track: Track = { look, last: drawn.clone(), sinceSpark: 0 };
    this.tracks.set(shot, track);
    return track;
  }

  /** The shot ended at its last step: it trails to where it hit or ran out, and flashes there. */
  private end(shot: Shot, track: Track): void {
    const at = this.metres(shot.pos, new Vector3());
    // A drawn shot can lead its contact by part of a step; the trail only runs forward.
    if (at.clone().sub(track.last).dot(this.direction(shot)) > 0) {
      this.trail(track, at);
    }
    if (this.flashes.length >= FLASHES) {
      this.flashes.shift();
    }
    this.flashes.push({ position: at, look: track.look, age: 0 });
    this.tracks.delete(shot);
  }

  private drawnPosition(shot: Shot, aheadSimSeconds: number, out: Vector3): Vector3 {
    const ahead = Math.min(shot.speedMetresPerSimSecond * Math.max(0, aheadSimSeconds), shot.remainingMetres);
    return this.metres(shot.pos, out).addScaledVector(this.direction(shot), ahead);
  }

  /** Leaves a spark every `spacingMetres` from the track's last drawn position to `to`, then moves it there. */
  private trail(track: Track, to: Vector3): void {
    const { trail } = track.look;
    this.step.subVectors(to, track.last);
    const length = this.step.length();
    if (length > 0) {
      this.step.divideScalar(length);
      let along = trail.spacingMetres - track.sinceSpark;
      for (; along <= length; along += trail.spacingMetres) {
        this.spark(track.last.clone().addScaledVector(this.step, along), trail);
      }
      track.sinceSpark = length - (along - trail.spacingMetres);
    }
    track.last.copy(to);
  }

  private spark(position: Vector3, look: ShotLook['trail']): void {
    if (this.sparks.length >= SPARKS) {
      return;
    }
    const index = this.sparkCount % DRIFT_DIRECTIONS;
    this.sparkCount += 1;
    const rise = 1 - (2 * (index + 0.5)) / DRIFT_DIRECTIONS;
    const across = Math.sqrt(1 - rise * rise);
    const turn = index * GOLDEN_ANGLE;
    const drift = new Vector3(Math.cos(turn) * across, rise, Math.sin(turn) * across).multiplyScalar(
      look.driftMetresPerRealSecond,
    );
    this.sparks.push({ position, drift, color: new Color(look.color), look, age: 0 });
  }

  private age(dt: number): void {
    for (let index = this.sparks.length - 1; index >= 0; index--) {
      const spark = this.sparks[index]!;
      spark.age += dt;
      if (spark.age >= spark.look.lifeRealSeconds) {
        this.sparks[index] = this.sparks.at(-1)!;
        this.sparks.pop();
      } else {
        spark.position.addScaledVector(spark.drift, dt);
      }
    }
    for (let index = this.flashes.length - 1; index >= 0; index--) {
      const flash = this.flashes[index]!;
      flash.age += dt;
      if (flash.age >= flash.look.impact.lifeRealSeconds) {
        this.flashes.splice(index, 1);
      }
    }
  }

  private drawSparks(): void {
    for (const [index, spark] of this.sparks.entries()) {
      const left = 1 - spark.age / spark.look.lifeRealSeconds;
      this.dummy.position.copy(spark.position);
      this.dummy.scale.setScalar(spark.look.sizeMetres * left);
      this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(index, this.dummy.matrix);
      this.sparkMesh.setColorAt(index, this.color.copy(spark.color).multiplyScalar(left));
    }
    this.finish(this.sparkMesh, this.sparks.length);
  }

  private drawFlashes(): void {
    for (const [index, { position, look, age }] of this.flashes.entries()) {
      const progress = age / look.impact.lifeRealSeconds;
      const left = 1 - progress;
      this.dummy.position.copy(position);
      this.dummy.scale.setScalar(look.impact.radiusMetres * Math.sqrt(progress) + look.core.radiusMetres);
      this.dummy.updateMatrix();
      this.flashMesh.setMatrixAt(index, this.dummy.matrix);
      this.flashMesh.setColorAt(index, this.color.set(look.impact.color).multiplyScalar(left));
      this.glow(position, look, left);
    }
    this.finish(this.flashMesh, this.flashes.length);
  }

  private glow(position: Vector3, look: ShotLook, share: number): void {
    const { color, intensity, radiusMetres } = look.light;
    this.lights.push({
      position: [position.x, position.y, position.z],
      color,
      intensity: intensity * share,
      radiusMetres,
    });
  }

  private place(
    mesh: InstancedMesh,
    index: number,
    position: Vector3,
    { color, radiusMetres }: { readonly color: string; readonly radiusMetres: number },
  ): void {
    this.dummy.position.copy(position);
    this.dummy.scale.setScalar(radiusMetres);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
    mesh.setColorAt(index, this.color.set(color));
  }

  private finish(mesh: InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }

  private metres(blocks: readonly number[], out: Vector3): Vector3 {
    return out.set(blocks[0]! * this.blockSize, blocks[1]! * this.blockSize, blocks[2]! * this.blockSize);
  }

  private direction(shot: Shot): Vector3 {
    return new Vector3(...shot.direction);
  }
}
