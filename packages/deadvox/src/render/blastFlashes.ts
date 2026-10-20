import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, NormalBlending, SphereGeometry } from 'three';
import type { Vec3 } from '../core/coords.ts';

// Presentation only: how long each part of a blast shows, how far it swells as a share of the blast radius, and
// how many blasts can show at once.
const FIREBALL = { realSeconds: 0.5, radiusShare: 0.5, color: 0xff_b3_47, opacity: 1, blending: AdditiveBlending };
const DUST = { realSeconds: 2.2, radiusShare: 0.8, color: 0x5a_52_4a, opacity: 0.55, blending: NormalBlending };
const BLASTS = 4;

type Part = typeof FIREBALL | typeof DUST;

interface Puff {
  readonly part: Part;
  readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  age: number;
  radiusMetres: number;
}

/** A detonation's fireball and the dust it throws up, swelling and fading where the blast was (`DESIGN.md`, "Hand grenade"). */
export class BlastFlashes {
  readonly group = new Group();
  private readonly geometry = new SphereGeometry(1, 16, 12);
  private readonly blasts: readonly (readonly Puff[])[];
  private next = 0;

  constructor() {
    this.blasts = Array.from({ length: BLASTS }, () =>
      [DUST, FIREBALL].map((part): Puff => {
        const mesh = new Mesh(
          this.geometry,
          new MeshBasicMaterial({
            color: part.color,
            transparent: true,
            blending: part.blending,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        mesh.visible = false;
        this.group.add(mesh);
        return { part, mesh, age: part.realSeconds, radiusMetres: 0 };
      }),
    );
  }

  /** Starts a blast of `radiusMetres` at `at`, in metres, reusing the oldest when all are showing. */
  spawn(at: Vec3, radiusMetres: number): void {
    const blast = this.blasts[this.next]!;
    this.next = (this.next + 1) % this.blasts.length;
    for (const puff of blast) {
      puff.age = 0;
      puff.radiusMetres = radiusMetres;
      puff.mesh.position.set(...at);
      puff.mesh.visible = true;
    }
    this.update(0);
  }

  update(dt: number): void {
    for (const puff of this.blasts.flat()) {
      if (!puff.mesh.visible) {
        continue;
      }
      puff.age += dt;
      const progress = puff.age / puff.part.realSeconds;
      if (progress >= 1) {
        puff.mesh.visible = false;
        continue;
      }
      puff.mesh.scale.setScalar(puff.radiusMetres * puff.part.radiusShare * Math.sqrt(progress) + 0.2);
      puff.mesh.material.opacity = puff.part.opacity * (1 - progress);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const { mesh } of this.blasts.flat()) {
      mesh.material.dispose();
    }
  }
}
