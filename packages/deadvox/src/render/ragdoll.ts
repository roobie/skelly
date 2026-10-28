import type { Bone } from '@mobgen/core/body.ts';
import type { Realized } from '@mobgen/core/generate.ts';
import { massProperties, voxelBounds } from '@mobgen/core/massProperties.ts';
import {
  applyPoint,
  mat3ToQuat,
  mulMM,
  mulMV,
  quatToMat3,
  rotY,
  type Transform,
  transpose,
  type Vec3,
} from '@mobgen/core/math.ts';
import { boneTransforms, type Pose } from '@mobgen/core/pose.ts';
import content from '@mobgen/mob/ragdoll.json' with { type: 'json' };
import { hash3 } from '../core/random.ts';
import type { RigidWorld } from '../core/rigidBody.ts';
import RAPIER from './ragdollRapier.ts';

export const ragdollContent = content;
const vector = (v: Vec3) => ({ x: v[0], y: v[1], z: v[2] });
const array = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];
const rotation = (r: Transform['r']) => {
  const q = mat3ToQuat(r);
  return { x: q[0], y: q[1], z: q[2], w: q[3] };
};
const matrix = (q: { x: number; y: number; z: number; w: number }) => quatToMat3([q.x, q.y, q.z, q.w]);

export interface RagdollGroup {
  readonly indices: readonly number[];
  readonly parent: number | undefined;
  readonly root: Bone;
  readonly limits: readonly (readonly number[])[] | null;
}

export function ragdollGroups(bones: readonly Bone[]): RagdollGroup[] {
  const owners = new Map<string, number>();
  content.groups.forEach((group, index) => {
    for (const id of group.bones) {
      if (owners.has(id) || !bones.some((bone) => bone.id === id)) {
        throw new Error(`Invalid ragdoll bone ownership: ${id}`);
      }
      owners.set(id, index);
    }
  });
  if (bones.some((bone) => !owners.has(bone.id))) {
    throw new Error('Ragdoll grouping must cover every bone');
  }
  return content.groups.map((group, index) => {
    const members = bones.filter((bone) => owners.get(bone.id) === index);
    const roots = members.filter((bone) => bone.parent === null || owners.get(bone.parent) !== index);
    if (roots.length !== 1) {
      throw new Error('Ragdoll group must be a connected skeleton subtree');
    }
    const root = roots[0]!;
    const parent = root.parent === null ? undefined : owners.get(root.parent);
    if ((parent === undefined) !== (group.limits === null)) {
      throw new Error('Every ragdoll group link requires limits');
    }
    return { indices: members.map((bone) => bones.indexOf(bone)), root, parent, limits: group.limits };
  });
}

interface Part {
  readonly body: InstanceType<typeof RAPIER.RigidBody>;
  readonly sources: ReadonlyMap<number, Transform>;
  readonly initial: Transform;
}

export interface Ragdoll {
  readonly transforms: Map<number, Transform>;
  readonly parts: Part[];
  readonly ground: InstanceType<typeof RAPIER.Collider>[];
  readonly joints: InstanceType<typeof RAPIER.ImpulseJoint>[];
  steps: number;
  settled: boolean;
  removed: boolean;
  sleepSteps?: number;
}

let initialization: Promise<void> | undefined;
export const initializeRagdollPhysics = (): Promise<void> => {
  initialization ??= RAPIER.init();
  return initialization;
};
interface RagdollSpawn {
  realized: Realized;
  pose: Pose;
  position: Vec3;
  yaw: number;
  direction: number;
  seed: number;
  ground: RigidWorld;
}
export class RagdollWorld {
  readonly ready: Promise<void>;
  failed = false;
  private world: InstanceType<typeof RAPIER.World> | undefined;
  private readonly corpses = new Set<Ragdoll>();
  private remainder = 0;
  private disposed = false;

  constructor() {
    this.ready = initializeRagdollPhysics()
      .then(() => {
        if (!this.disposed) {
          this.world = new RAPIER.World({ x: 0, y: content.gravity, z: 0 });
          this.world.timestep = content.timestep;
        }
      })
      .catch(() => {
        this.failed = true;
      });
  }

  spawn(input: RagdollSpawn): Ragdoll {
    const { realized, pose, position, yaw } = input;
    const yawMatrix = rotY((yaw * 180) / Math.PI);
    const posed = boneTransforms(realized.body.bones, pose);
    const transforms = new Map<number, Transform>();
    realized.body.bones.forEach((bone, index) => {
      const source = posed.get(bone.id)!;
      const t = mulMV(yawMatrix, source.t);
      transforms.set(index, {
        r: mulMM(yawMatrix, source.r),
        t: [t[0] + position[0], t[1] + position[1], t[2] + position[2]],
      });
    });
    const corpse: Ragdoll = { transforms, parts: [], ground: [], joints: [], steps: 0, settled: false, removed: false };
    this.corpses.add(corpse);
    this.ready.then(() => {
      if (!corpse.removed && this.world) {
        this.build(corpse, input);
      }
    });
    return corpse;
  }

  private build(corpse: Ragdoll, { realized, position, direction, seed, ground }: RagdollSpawn): void {
    const world = this.world!;
    const groups = ragdollGroups(realized.body.bones);
    for (const group of groups) {
      const source = corpse.transforms.get(group.indices[0]!)!;
      const bounds = voxelBounds(realized.voxels, group.indices);
      const center = applyPoint(source, bounds.center);
      const initial: Transform = { r: source.r, t: center };
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...center)
          .setRotation(rotation(source.r))
          .setLinearDamping(content.linearDamping)
          .setAngularDamping(content.angularDamping),
      );
      const velocity = mulMV(source.r, [
        (hash3(seed, 0, 0, 0) - 0.5) * content.seedSpread,
        0,
        -direction * content.launchSpeed,
      ]);
      body.setLinvel(vector(velocity), true);
      const { mass } = massProperties(realized.voxels, group.indices, realized.voxels.size);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(...bounds.halfExtents)
          .setMass(mass)
          .setFriction(content.friction),
        body,
      );
      corpse.parts.push({
        body,
        initial,
        sources: new Map(group.indices.map((index) => [index, corpse.transforms.get(index)!])),
      });
    }
    groups.forEach((group, index) => {
      if (group.parent === undefined) {
        return;
      }
      const parent = corpse.parts[group.parent]!;
      const child = corpse.parts[index]!;
      const anchor = applyPoint(corpse.transforms.get(group.indices[0]!)!, group.root.head);
      const local = (part: Part) =>
        vector(
          mulMV(transpose(part.initial.r), [
            anchor[0] - part.initial.t[0],
            anchor[1] - part.initial.t[1],
            anchor[2] - part.initial.t[2],
          ]),
        );
      const joint = world.createImpulseJoint(
        RAPIER.JointData.generic(
          local(parent),
          local(child),
          { x: 1, y: 0, z: 0 },
          RAPIER.JointAxesMask.LinX | RAPIER.JointAxesMask.LinY | RAPIER.JointAxesMask.LinZ,
        ),
        parent.body,
        child.body,
        true,
      );
      corpse.joints.push(joint);
      joint.setContactsEnabled(false);
      // The JS generic-joint wrapper lacks angular limits; Rapier's public raw set owns them.
      group.limits!.forEach((limits, axis) => {
        world.impulseJoints.raw.jointSetLimits(joint.handle, axis + 3, limits[0]!, limits[1]!);
      });
    });
    const size = ground.blockSize;
    const cell = position.map((value) => Math.floor(value / size));
    const radius = content.footprintMetres.map((value) => Math.ceil(value / size));
    for (let x = cell[0]! - radius[0]!; x <= cell[0]! + radius[0]!; x++) {
      for (let y = cell[1]! - radius[1]!; y <= cell[1]! + radius[1]!; y++) {
        for (let z = cell[2]! - radius[2]!; z <= cell[2]! + radius[2]!; z++) {
          if (ground.isSolid(x, y, z)) {
            corpse.ground.push(
              world.createCollider(
                RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
                  .setTranslation((x + 0.5) * size, (y + 0.5) * size, (z + 0.5) * size)
                  .setFriction(content.friction),
              ),
            );
          }
        }
      }
    }
  }

  advance(realDt: number): void {
    if (!this.world) {
      return;
    }
    this.remainder += realDt;
    let steps = 0;
    while (this.remainder >= content.timestep && steps < content.maxStepsPerFrame) {
      this.world.step();
      this.remainder -= content.timestep;
      steps += 1;
      for (const corpse of this.corpses) {
        this.finishStep(corpse);
      }
    }
  }

  private finishStep(corpse: Ragdoll): void {
    if (corpse.settled || corpse.parts.length === 0) {
      return;
    }
    corpse.steps += 1;
    this.readback(corpse);
    const asleep = corpse.parts.every((part) => part.body.isSleeping());
    if (asleep || corpse.steps >= content.stepBudget) {
      if (asleep) {
        corpse.sleepSteps = corpse.steps;
      }
      corpse.settled = true;
      for (const part of corpse.parts) {
        part.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      }
    }
  }

  private readback(corpse: Ragdoll): void {
    for (const part of corpse.parts) {
      const delta = mulMM(matrix(part.body.rotation()), transpose(part.initial.r));
      const center = array(part.body.translation());
      for (const [index, source] of part.sources) {
        const offset = mulMV(delta, [
          source.t[0] - part.initial.t[0],
          source.t[1] - part.initial.t[1],
          source.t[2] - part.initial.t[2],
        ]);
        corpse.transforms.set(index, {
          r: mulMM(delta, source.r),
          t: [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]],
        });
      }
    }
  }

  remove(corpse: Ragdoll): void {
    corpse.removed = true;
    for (const part of corpse.parts) {
      this.world?.removeRigidBody(part.body);
    }
    for (const collider of corpse.ground) {
      this.world?.removeCollider(collider, false);
    }
    this.corpses.delete(corpse);
  }

  dispose(): void {
    this.disposed = true;
    this.world?.free();
    this.world = undefined;
    this.corpses.clear();
  }
}
