// Capped render-only effects follow firearm cases; simulation commits the corresponding pile items at impact.

import { Group, type Object3D, Vector3 } from 'three';
import type { Vec3 } from '../core/coords.ts';
import { DEFAULT_WORLD_GRAVITY } from '../core/defaultGravity.ts';
import { Rng } from '../core/random.ts';
import type { FirearmShotEffect } from '../game/firearmHandling.ts';
import { placeholderCaseMesh, resolveCaseModel } from './caseVisual.ts';
import type { ModelLibrary } from './models.ts';

export const FLYING_CASE_CAP = 32;

export const caseFlightPoint = (
  from: Vec3,
  to: Vec3,
  progress: number,
  {
    durationSimSeconds,
    initialVelocity,
    gravityMetresPerSimSecondSquared = DEFAULT_WORLD_GRAVITY,
  }: { durationSimSeconds: number; initialVelocity: Vec3; gravityMetresPerSimSecondSquared?: number },
): Vec3 => {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 1 || !(durationSimSeconds > 0)) {
    return [...to];
  }
  const elapsed = durationSimSeconds * t;
  const correction: Vec3 = [
    to[0] - from[0] - initialVelocity[0] * durationSimSeconds,
    to[1] -
      from[1] -
      initialVelocity[1] * durationSimSeconds +
      (gravityMetresPerSimSecondSquared * durationSimSeconds ** 2) / 2,
    to[2] - from[2] - initialVelocity[2] * durationSimSeconds,
  ];
  return [
    from[0] + initialVelocity[0] * elapsed + correction[0] * t ** 2,
    from[1] +
      initialVelocity[1] * elapsed -
      (gravityMetresPerSimSecondSquared * elapsed ** 2) / 2 +
      correction[1] * t ** 2,
    from[2] + initialVelocity[2] * elapsed + correction[2] * t ** 2,
  ];
};

interface Particle {
  active: boolean;
  startedAtSimSeconds: number;
  updatedAtSimSeconds: number;
  landingAt: number;
  readonly origin: Vector3;
  readonly landing: Vector3;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly rotation: Vector3;
  readonly spin: Vector3;
  caseModelId: string | undefined;
  verticalDrop: boolean;
  seed: number;
  visual: Object3D | undefined;
  readonly visuals: Map<string, Object3D>;
  readonly fallbackModels: Set<string>;
}

export class CaseEffects {
  readonly mesh = new Group();
  private readonly models: ModelLibrary | undefined;
  private readonly gravityMetresPerSimSecondSquared: number;
  private readonly particles: Particle[] = Array.from({ length: FLYING_CASE_CAP }, () => ({
    active: false,
    startedAtSimSeconds: 0,
    updatedAtSimSeconds: 0,
    landingAt: 0,
    origin: new Vector3(),
    landing: new Vector3(),
    position: new Vector3(),
    velocity: new Vector3(),
    rotation: new Vector3(),
    spin: new Vector3(),
    caseModelId: undefined,
    verticalDrop: false,
    seed: 0,
    visual: undefined,
    visuals: new Map(),
    fallbackModels: new Set(),
  }));

  constructor(_blockSize: number, gravityOrModels?: number | ModelLibrary, models?: ModelLibrary) {
    this.gravityMetresPerSimSecondSquared =
      typeof gravityOrModels === 'number' ? gravityOrModels : DEFAULT_WORLD_GRAVITY;
    this.models = typeof gravityOrModels === 'number' ? models : gravityOrModels;
  }

  get activeCount(): number {
    return this.particles.reduce((count, particle) => count + Number(particle.active), 0);
  }

  /** Returns false when the capped presentation pool is full. */
  spawn(effect: FirearmShotEffect): boolean {
    const particle = this.particles.find((candidate) => !candidate.active);
    if (!particle) {
      return false;
    }
    const rng = Rng.stream(effect.seed, 'case-spin');
    particle.active = true;
    particle.startedAtSimSeconds = effect.startedAtSimSeconds;
    particle.updatedAtSimSeconds = effect.startedAtSimSeconds;
    particle.landingAt = effect.landingAt;
    particle.seed = effect.seed;
    particle.origin.set(...effect.origin);
    particle.verticalDrop = effect.verticalDrop === true;
    particle.landing.set(
      particle.verticalDrop ? effect.origin[0] : effect.landingPosition[0],
      effect.landingPosition[1],
      particle.verticalDrop ? effect.origin[2] : effect.landingPosition[2],
    );
    particle.position.set(...effect.origin);
    particle.velocity.set(
      effect.direction[0] * effect.speed,
      effect.direction[1] * effect.speed,
      effect.direction[2] * effect.speed,
    );
    particle.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI));
    particle.spin.set(rng.range(-24, 24), rng.range(-24, 24), rng.range(-24, 24));
    particle.caseModelId = effect.caseModelId;
    this.installVisual(particle);
    this.draw();
    return true;
  }

  /** Aligns the presentation endpoint with the pile instance created by simulation. */
  retarget(seed: number, position: Vec3): void {
    const particle = this.particles.find((candidate) => candidate.active && candidate.seed === seed);
    if (particle) {
      particle.landing.set(
        particle.verticalDrop ? particle.origin.x : position[0],
        position[1],
        particle.verticalDrop ? particle.origin.z : position[2],
      );
    }
  }

  /** Follows the simulation clock and hides at the exact frame its pile item is committed. */
  update(simTime: number): void {
    for (const particle of this.particles) {
      if (!particle.active) {
        continue;
      }
      this.upgradeVisual(particle);
      if (simTime >= particle.landingAt) {
        particle.position.copy(particle.landing);
        particle.visual?.position.copy(particle.position);
        particle.active = false;
        continue;
      }
      const duration = particle.landingAt - particle.startedAtSimSeconds;
      const elapsed = Math.max(0, simTime - particle.startedAtSimSeconds);
      const progress = duration > 0 ? elapsed / duration : 1;
      const point = caseFlightPoint(particle.origin.toArray() as Vec3, particle.landing.toArray() as Vec3, progress, {
        durationSimSeconds: duration,
        initialVelocity: particle.velocity.toArray() as Vec3,
        gravityMetresPerSimSecondSquared: this.gravityMetresPerSimSecondSquared,
      });
      particle.position.set(...point);
      particle.rotation.addScaledVector(particle.spin, Math.max(0, simTime - particle.updatedAtSimSeconds));
      particle.updatedAtSimSeconds = simTime;
    }
    this.draw();
  }

  private installVisual(particle: Particle): void {
    const key = particle.caseModelId ?? '';
    let visual = particle.visuals.get(key);
    if (!visual) {
      visual = resolveCaseModel(this.models, particle.caseModelId) ?? placeholderCaseMesh();
      particle.visuals.set(key, visual);
      if (particle.caseModelId !== undefined && !this.models?.has(particle.caseModelId)) {
        particle.fallbackModels.add(key);
      }
      this.mesh.add(visual);
    }
    for (const [modelId, candidate] of particle.visuals) {
      candidate.visible = modelId === key;
    }
    particle.visual = visual;
  }

  private upgradeVisual(particle: Particle): void {
    for (const key of particle.fallbackModels) {
      if (!(key && this.models?.has(key))) {
        continue;
      }
      const model = resolveCaseModel(this.models, key);
      if (!model) {
        continue;
      }
      const fallback = particle.visuals.get(key);
      if (fallback) {
        fallback.visible = false;
        this.mesh.remove(fallback);
      }
      model.visible = particle.active && particle.caseModelId === key;
      particle.visuals.set(key, model);
      particle.fallbackModels.delete(key);
      this.mesh.add(model);
      if (particle.caseModelId === key) {
        particle.visual = model;
      }
    }
  }

  dispose(): void {
    this.mesh.clear();
    for (const particle of this.particles) {
      particle.active = false;
      particle.visual = undefined;
      particle.visuals.clear();
      particle.fallbackModels.clear();
    }
  }

  private draw(): void {
    for (const particle of this.particles) {
      if (!particle.active) {
        if (particle.visual) {
          particle.visual.visible = false;
        }
        continue;
      }
      if (!(particle.visual && particle.visuals.has(particle.caseModelId ?? ''))) {
        this.installVisual(particle);
      }
      particle.visual!.visible = true;
      particle.visual!.position.copy(particle.position);
      particle.visual!.rotation.set(particle.rotation.x, particle.rotation.y, particle.rotation.z);
    }
  }
}
