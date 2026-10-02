// Capped, render-only flying spent cases. Their impacts never alter simulation piles.

import { Group, type Object3D, Vector3 } from 'three';
import { Rng } from '../core/random.ts';
import type { FirearmShotEffect } from '../game/firearmHandling.ts';
import { placeholderCaseMesh, resolveCaseModel } from './caseVisual.ts';
import type { ModelLibrary } from './models.ts';

export const FLYING_CASE_CAP = 32;
const GRAVITY = 9.81;
const MAX_AGE = 6;

interface Particle {
  active: boolean;
  age: number;
  bounces: number;
  position: Vector3;
  velocity: Vector3;
  rotation: Vector3;
  spin: Vector3;
  caseModelId: string | undefined;
  visual: Object3D | undefined;
  readonly visuals: Map<string, Object3D>;
  readonly fallbackModels: Set<string>;
}

const normalize = (v: Vector3): Vector3 => (v.lengthSq() > 0 ? v.normalize() : new Vector3(0, 0, -1));

export class CaseEffects {
  readonly mesh = new Group();
  private readonly blockSize: number;
  private readonly models: ModelLibrary | undefined;
  private readonly particles: Particle[] = Array.from({ length: FLYING_CASE_CAP }, () => ({
    active: false,
    age: 0,
    bounces: 0,
    position: new Vector3(),
    velocity: new Vector3(),
    rotation: new Vector3(),
    spin: new Vector3(),
    caseModelId: undefined,
    visual: undefined,
    visuals: new Map(),
    fallbackModels: new Set(),
  }));

  constructor(blockSize: number, models?: ModelLibrary) {
    this.blockSize = blockSize;
    this.models = models;
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
    const rng = Rng.stream(effect.seed, 'case-spread-and-spin');
    const direction = normalize(
      new Vector3(
        effect.direction[0] + rng.range(-0.09, 0.09),
        effect.direction[1] + rng.range(-0.09, 0.16),
        effect.direction[2] + rng.range(-0.09, 0.09),
      ),
    );
    particle.active = true;
    particle.age = 0;
    particle.bounces = 0;
    particle.position.set(...effect.origin);
    particle.velocity.copy(direction).multiplyScalar(effect.speed * rng.range(0.8, 1.2));
    particle.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI));
    particle.spin.set(rng.range(-24, 24), rng.range(-24, 24), rng.range(-24, 24));
    particle.caseModelId = effect.caseModelId;
    this.installVisual(particle);
    this.draw();
    return true;
  }

  /** Simple block-axis bounce, then remove the case once it has settled. */
  update(dt: number, isSolid: (x: number, y: number, z: number) => boolean): void {
    const steps = Math.max(1, Math.ceil(Math.max(0, dt) / 0.02));
    const step = Math.max(0, dt) / steps;
    for (const particle of this.particles) {
      if (!particle.active) {
        continue;
      }
      this.upgradeVisual(particle);
      particle.age += dt;
      for (let substep = 0; substep < steps; substep++) {
        this.advance(particle, step, isSolid);
      }
      if (particle.age >= MAX_AGE || (particle.bounces > 0 && particle.velocity.length() < 0.22)) {
        particle.active = false;
      }
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
      if (!key || !this.models?.has(key)) {
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
      particle.visuals.set(key, model);
      particle.fallbackModels.delete(key);
      this.mesh.add(model);
      if (particle.caseModelId === key) {
        particle.visual = model;
      }
    }
  }

  private advance(particle: Particle, dt: number, isSolid: (x: number, y: number, z: number) => boolean): void {
    particle.velocity.y -= GRAVITY * dt;
    let hitHorizontal = false;
    let hitGround = false;
    for (const axis of [0, 1, 2] as const) {
      const next = particle.position.clone();
      next.setComponent(axis, next.getComponent(axis) + particle.velocity.getComponent(axis) * dt);
      const block = [
        Math.floor(next.x / this.blockSize),
        Math.floor(next.y / this.blockSize),
        Math.floor(next.z / this.blockSize),
      ];
      if (!isSolid(block[0]!, block[1]!, block[2]!)) {
        particle.position.setComponent(axis, next.getComponent(axis));
        continue;
      }
      particle.velocity.setComponent(axis, -particle.velocity.getComponent(axis) * (axis === 1 ? 0.22 : 0.35));
      particle.bounces += 1;
      if (axis === 1) {
        hitGround = true;
      } else {
        hitHorizontal = true;
      }
    }
    if (hitHorizontal) {
      particle.velocity.x *= 0.72;
      particle.velocity.z *= 0.72;
    }
    if (hitGround) {
      particle.velocity.x *= 0.58;
      particle.velocity.z *= 0.58;
      if (particle.velocity.y < 0.35) {
        particle.velocity.y = 0;
      }
    }
    particle.rotation.addScaledVector(particle.spin, dt);
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
      if (!particle.visual || !particle.visuals.has(particle.caseModelId ?? '')) {
        this.installVisual(particle);
      }
      particle.visual!.visible = true;
      particle.visual!.position.copy(particle.position);
      particle.visual!.rotation.set(particle.rotation.x, particle.rotation.y, particle.rotation.z);
    }
  }
}
