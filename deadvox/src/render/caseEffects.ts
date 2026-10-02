// Capped, render-only flying spent cases. Their impacts never alter simulation piles.

import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { Rng } from '../core/random.ts';
import type { FirearmShotEffect } from '../game/firearmHandling.ts';

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
}

const normalize = (v: Vector3): Vector3 => (v.lengthSq() > 0 ? v.normalize() : new Vector3(0, 0, -1));

export class CaseEffects {
  readonly mesh: InstancedMesh;
  private readonly blockSize: number;
  private readonly particles: Particle[] = Array.from({ length: FLYING_CASE_CAP }, () => ({
    active: false,
    age: 0,
    bounces: 0,
    position: new Vector3(),
    velocity: new Vector3(),
    rotation: new Vector3(),
    spin: new Vector3(),
  }));
  private readonly transform = new Object3D();

  constructor(blockSize: number) {
    this.blockSize = blockSize;
    this.mesh = new InstancedMesh(
      new BoxGeometry(0.038, 0.009, 0.012),
      new MeshStandardMaterial({ color: 0xb4_87_45, metalness: 0.72, roughness: 0.38 }),
      FLYING_CASE_CAP,
    );
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
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
    const { geometry, material } = this.mesh;
    geometry.dispose();
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose();
      }
    } else {
      material.dispose();
    }
  }

  private draw(): void {
    let index = 0;
    for (const particle of this.particles) {
      if (!particle.active) {
        continue;
      }
      this.transform.position.copy(particle.position);
      this.transform.rotation.set(particle.rotation.x, particle.rotation.y, particle.rotation.z);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(index, this.transform.matrix);
      index += 1;
    }
    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }
}
