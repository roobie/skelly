import { Box3, Group, Mesh, type Object3D, Quaternion, Vector3 } from 'three';
import type { ModelDef } from '../core/content.ts';

// Presentation only: how many shed levers can fly at once.
const LEVERS = 4;
const GRAVITY_MPS2 = 9.81;
const UP = new Vector3(0, 1, 0);

type Lever = NonNullable<ModelDef['lever']>;

interface Prop {
  readonly holder: Group;
  readonly velocity: Vector3;
  readonly axis: Vector3;
  spinRadiansPerRealSecond: number;
  age: number;
  lifetimeRealSeconds: number;
  resting: boolean;
}

/** A fused throwable's lever flying off as its fuse lights, then lying where it fell (`DESIGN.md`, "Hand grenade"). */
export class LeverProps {
  readonly group = new Group();
  private readonly props: readonly Prop[];
  private next = 0;
  private readonly pending: { readonly uid: number; readonly lever: Lever }[] = [];
  private readonly blockSize: number;
  private readonly isSolid: (x: number, y: number, z: number) => boolean;
  private readonly centre = new Vector3();
  private readonly from = new Vector3();
  private readonly turn = new Quaternion();

  constructor(blockSize: number, isSolid: (x: number, y: number, z: number) => boolean) {
    this.blockSize = blockSize;
    this.isSolid = isSolid;
    this.props = Array.from({ length: LEVERS }, (): Prop => {
      const holder = new Group();
      holder.visible = false;
      this.group.add(holder);
      return {
        holder,
        velocity: new Vector3(),
        axis: new Vector3(),
        spinRadiansPerRealSecond: 0,
        age: 0,
        lifetimeRealSeconds: 0,
        resting: true,
      };
    });
  }

  /** Holds a lit fuse's lever for `launchLit`: a fuse lit by a drop burns before the pile has drawn its throwable. */
  lit(uid: number, lever: Lever): void {
    this.pending.push({ uid, lever });
  }

  /** Launches each lever lit since the last call from its throwable as drawn now. */
  launchLit(drawn: (uid: number) => Object3D | undefined): void {
    for (const { uid, lever } of this.pending) {
      this.spawn(drawn(uid), lever);
    }
    this.pending.length = 0;
  }

  /** Launches a copy of `source`'s lever mesh from where it is drawn, reusing the oldest when all are flying. */
  spawn(source: Object3D | undefined, lever: Lever): void {
    if (!source) {
      return;
    }
    source.updateWorldMatrix(true, true);
    let mesh: Mesh | undefined;
    source.traverse((child) => {
      if (!mesh && child instanceof Mesh && child.geometry.userData.piece === lever.piece) {
        mesh = child;
      }
    });
    if (!mesh) {
      return;
    }
    const prop = this.props[this.next]!;
    this.next = (this.next + 1) % this.props.length;
    // Centred on its own bounds, so the lever spins about itself rather than about the throwable.
    mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox!.getCenter(new Vector3());
    const copy = new Mesh(mesh.geometry, mesh.material);
    copy.position.copy(local).negate();
    prop.holder.clear();
    prop.holder.add(copy);
    mesh.matrixWorld.decompose(prop.holder.position, prop.holder.quaternion, prop.holder.scale);
    prop.holder.position.copy(local.applyMatrix4(mesh.matrixWorld));
    new Box3().setFromObject(source).getCenter(this.from);
    const outward = this.centre.subVectors(prop.holder.position, this.from).setY(0);
    if (outward.lengthSq() === 0) {
      outward.set(1, 0, 0);
    }
    outward.normalize();
    prop.axis.crossVectors(outward, UP).normalize();
    prop.velocity.copy(outward).add(UP).normalize().multiplyScalar(lever.launchMetresPerRealSecond);
    prop.spinRadiansPerRealSecond = (lever.spinDegreesPerRealSecond * Math.PI) / 180;
    prop.age = 0;
    prop.lifetimeRealSeconds = lever.lifetimeRealSeconds;
    prop.resting = false;
    prop.holder.visible = true;
  }

  update(dt: number): void {
    const step = Math.max(0, dt);
    const substeps = Math.max(1, Math.ceil(step / 0.02));
    for (const prop of this.props) {
      if (!prop.holder.visible) {
        continue;
      }
      prop.age += step;
      if (prop.age >= prop.lifetimeRealSeconds) {
        prop.holder.visible = false;
        continue;
      }
      for (let substep = 0; substep < substeps && !prop.resting; substep++) {
        this.advance(prop, step / substeps);
      }
    }
  }

  dispose(): void {
    // The copies share the model library's geometry and materials, so there is nothing of their own to free.
    for (const prop of this.props) {
      prop.holder.clear();
    }
    this.group.clear();
  }

  /** Moves one axis at a time; the first solid block met stops the lever on the face it hit. */
  private advance(prop: Prop, dt: number): void {
    const { holder, velocity } = prop;
    const { position } = holder;
    const s = this.blockSize;
    velocity.y -= GRAVITY_MPS2 * dt;
    holder.quaternion.premultiply(this.turn.setFromAxisAngle(prop.axis, prop.spinRadiansPerRealSecond * dt));
    for (const axis of [0, 1, 2] as const) {
      const speed = velocity.getComponent(axis);
      const next = position.getComponent(axis) + speed * dt;
      const bx = Math.floor((axis === 0 ? next : position.x) / s);
      const by = Math.floor((axis === 1 ? next : position.y) / s);
      const bz = Math.floor((axis === 2 ? next : position.z) / s);
      if (!this.isSolid(bx, by, bz)) {
        position.setComponent(axis, next);
        continue;
      }
      position.setComponent(axis, (Math.floor(next / s) + (speed > 0 ? 0 : 1)) * s);
      prop.resting = true;
      return;
    }
  }
}
