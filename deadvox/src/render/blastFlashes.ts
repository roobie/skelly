import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { Vec3 } from '../core/coords.ts';

// Presentation only: how long a fireball lasts, how far it swells, and how many can show at once.
const FIREBALL_SECONDS = 0.45;
const FIREBALL_RADIUS_METRES = 2.5;
const FIREBALLS = 4;

interface Fireball {
  readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  age: number;
}

/** A detonation's fireball, swelling and fading where the blast was (DESIGN.md, "Hand grenade"). */
export class BlastFlashes {
  readonly group = new Group();
  private readonly geometry = new SphereGeometry(1, 16, 12);
  private readonly fireballs: readonly Fireball[];
  private next = 0;

  constructor() {
    this.fireballs = Array.from({ length: FIREBALLS }, () => {
      const mesh = new Mesh(
        this.geometry,
        new MeshBasicMaterial({
          color: 0xff_b3_47,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, age: FIREBALL_SECONDS };
    });
  }

  /** Starts a fireball at `at`, in metres, reusing the oldest when all are showing. */
  spawn(at: Vec3): void {
    const fireball = this.fireballs[this.next]!;
    this.next = (this.next + 1) % this.fireballs.length;
    fireball.age = 0;
    fireball.mesh.position.set(...at);
    fireball.mesh.visible = true;
    this.update(0);
  }

  update(dt: number): void {
    for (const fireball of this.fireballs) {
      if (!fireball.mesh.visible) {
        continue;
      }
      fireball.age += dt;
      const progress = fireball.age / FIREBALL_SECONDS;
      if (progress >= 1) {
        fireball.mesh.visible = false;
        continue;
      }
      fireball.mesh.scale.setScalar(FIREBALL_RADIUS_METRES * Math.sqrt(progress) + 0.2);
      fireball.mesh.material.opacity = 1 - progress;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const { mesh } of this.fireballs) {
      mesh.material.dispose();
    }
  }
}
