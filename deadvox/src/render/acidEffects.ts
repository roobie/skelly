import { CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { AcidGlobState } from '../core/acidGlob.ts';
import type { AcidPuddleState } from '../core/acidPuddle.ts';
import type { ZombieDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';

type Appearance = NonNullable<ZombieDef['acidSpit']>['presentation'];

export class AcidEffects {
  readonly group = new Group();
  private readonly geometry = new SphereGeometry(1, 8, 6);
  private readonly globs: Mesh<SphereGeometry, MeshBasicMaterial>[] = [];
  private readonly splashes: { mesh: Mesh<SphereGeometry, MeshBasicMaterial>; age: number; look: Appearance }[] = [];

  private readonly puddleGeometry = new CircleGeometry(1, 24);
  private readonly puddles: Mesh<CircleGeometry, MeshBasicMaterial>[] = [];

  private readonly blockSize: number;

  constructor(blockSize: number) {
    this.blockSize = blockSize;
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
    this.group.clear();
  }
}
