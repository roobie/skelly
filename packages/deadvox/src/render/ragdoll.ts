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
import RAPIER from './ragdollRapier.ts';
import { angularVelocity, type RigidBody, type RigidWorld } from './rigidImpulse.ts';

export const ragdollContent = content;
type Motion = typeof content.motion;
export function ragdollMotion(
  base: Motion,
  kind: Partial<Motion>,
  override: Partial<Motion>,
  scale: Partial<Motion>,
): Motion {
  const motion = { ...base, ...kind, ...override };
  for (const key of Object.keys(scale) as (keyof Motion)[]) {
    motion[key] *= scale[key]!;
  }
  return motion;
}
const vector = (v: Vec3) => ({ x: v[0], y: v[1], z: v[2] });
const array = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];
const scaled = (v: Vec3, factor: number): Vec3 => [v[0] * factor, v[1] * factor, v[2] * factor];
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

export function ragdollGroups(
  bones: readonly Bone[],
  excluded: ReadonlySet<number> = new Set(),
  authored = content.groups,
): RagdollGroup[] {
  const ordinary = content.shortenedLegs.absent.every((id) => !bones.some((bone) => bone.id === id))
    ? authored.filter((group) => !group.bones.some((id) => content.shortenedLegs.omit.includes(id)))
    : authored;
  const definitions =
    bones[0]?.id === content.compound.root
      ? [
          { bones: [content.compound.root], limits: null },
          ...bones
            .filter((bone) => bone.parent === content.compound.root)
            .flatMap((root) => {
              if (!root.id.endsWith(content.compound.memberRoot)) {
                throw new Error('Invalid compound ragdoll root');
              }
              const prefix = root.id.slice(0, -content.compound.memberRoot.length);
              return authored.map((group) => ({
                bones: group.bones.map((id) => prefix + id),
                limits: group.limits ?? content.compound.limits,
              }));
            }),
        ]
      : ordinary;
  const owners = new Map<string, number>();
  definitions.forEach((group, index) => {
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
  const groups = definitions.map((group, index) => {
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
    return {
      indices: members.map((bone) => bones.indexOf(bone)).filter((boneIndex) => !excluded.has(boneIndex)),
      root,
      parent,
      limits: group.limits,
    };
  });
  const retained = groups.filter((group) => group.indices.length > 0);
  return retained.map((group) => ({
    ...group,
    parent: group.parent === undefined ? undefined : retained.indexOf(groups[group.parent]!),
  }));
}

interface Part {
  readonly body: InstanceType<typeof RAPIER.RigidBody>;
  readonly sources: Map<number, Transform>;
  readonly initial: Transform;
}

export interface Ragdoll {
  readonly transforms: Map<number, Transform>;
  readonly excluded: Set<number>;
  readonly parts: Part[];
  readonly anchors: InstanceType<typeof RAPIER.RigidBody>[];
  readonly ground: Set<string>;
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
  model?: string;
  pose: Pose;
  position: Vec3;
  yaw: number;
  direction: number;
  seed: number;
  ground: RigidWorld;
  excluded?: ReadonlySet<number>;
  launch?: Vec3;
  reach?: number;
  scale?: number;
  motion?: Partial<typeof content.motion>;
  motionScale?: Partial<typeof content.motion>;
}
export class RagdollWorld {
  readonly ready: Promise<void>;
  failed = false;
  private world: InstanceType<typeof RAPIER.World> | undefined;
  private readonly corpses = new Set<Ragdoll>();
  private readonly debris = new Map<Ragdoll, { body: RigidBody; ground: RigidWorld; cell: string }>();
  private readonly terrain = new Map<Ragdoll, { ground: RigidWorld; cell: string }>();
  private readonly cells = new Map<string, { collider: InstanceType<typeof RAPIER.Collider>; users: number }>();
  private remainder = 0;
  private disposed = false;

  constructor(gravityMetresPerSimSecondSquared: number) {
    if (!Number.isFinite(gravityMetresPerSimSecondSquared)) {
      throw new Error('RagdollWorld requires world gravity');
    }
    this.ready = initializeRagdollPhysics()
      .then(() => {
        if (!this.disposed) {
          this.world = new RAPIER.World({ x: 0, y: -gravityMetresPerSimSecondSquared, z: 0 });
          this.world.timestep = content.timestep;
        }
      })
      .catch((error: unknown) => {
        // biome-ignore lint/suspicious/noConsole: a failed presentation solver must not disappear without diagnostic evidence.
        console.warn('Ragdoll physics initialization failed; corpse physics is unavailable.', error);
        this.failed = true;
      });
  }

  spawn(input: RagdollSpawn): Ragdoll {
    const { realized, pose, position, yaw } = input;
    const scale = input.scale ?? 1;
    const yawMatrix = rotY((yaw * 180) / Math.PI);
    const posed = boneTransforms(realized.body.bones, pose);
    const transforms = new Map<number, Transform>();
    realized.body.bones.forEach((bone, index) => {
      const source = posed.get(bone.id)!;
      const t = mulMV(yawMatrix, scaled(source.t, scale));
      transforms.set(index, {
        r: mulMM(yawMatrix, source.r),
        t: [t[0] + position[0], t[1] + position[1], t[2] + position[2]],
      });
    });
    const corpse: Ragdoll = {
      transforms,
      excluded: new Set(input.excluded),
      parts: [],
      anchors: [],
      ground: new Set(),
      joints: [],
      steps: 0,
      settled: false,
      removed: false,
    };
    this.corpses.add(corpse);
    this.ready.then(() => {
      if (!corpse.removed && this.world) {
        this.build(corpse, input);
      }
    });
    return corpse;
  }

  private build(
    corpse: Ragdoll,
    {
      realized,
      model = 'shambler',
      position,
      yaw,
      direction,
      seed,
      ground,
      launch,
      reach,
      scale = 1,
      motion: override,
      motionScale,
    }: RagdollSpawn,
  ): void {
    const world = this.world!;
    const groups = ragdollGroups(
      realized.body.bones,
      corpse.excluded,
      (content.modelGroups as Record<string, typeof content.groups>)[model] ?? content.groups,
    );
    const motion = ragdollMotion(
      content.motion,
      (content.kindMotion as Record<string, Partial<Motion>>)[model] ?? {},
      override ?? {},
      motionScale ?? {},
    );
    const directed = launch && Math.hypot(...launch) > 0;
    const weight = directed ? motion.hitDirectionWeight : 0;
    const spread = (hash3(seed, 0, 0, 0) - 0.5) * motion.seedSpread;
    const fallback = mulMV(rotY((yaw * 180) / Math.PI), [0, 0, -direction]);
    const blend = (axis: number) =>
      fallback[axis]! * (1 - weight) + (directed ? (launch[axis]! / Math.hypot(...launch)) * weight : 0);
    const aim: Vec3 = [blend(0), blend(1), blend(2)];
    const length = Math.hypot(...aim) || 1;
    const spin = (axis: number) => (hash3(seed, axis, 1, 0) - 0.5) * 2 * motion.spinSpeed;
    const across = Math.hypot(aim[0], aim[2]);
    const velocity: Vec3 = [
      (aim[0] * motion.launchSpeed) / length + (across > 0 ? (-aim[2] * spread) / across : 0),
      (aim[1] * motion.launchSpeed) / length + motion.upwardLift,
      (aim[2] * motion.launchSpeed) / length + (across > 0 ? (aim[0] * spread) / across : 0),
    ];
    for (const group of groups) {
      const source = corpse.transforms.get(group.indices[0]!)!;
      const bounds = voxelBounds(realized.voxels, group.indices);
      const center = applyPoint(source, scaled(bounds.center, scale));
      const initial: Transform = { r: source.r, t: center };
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...center)
          .setRotation(rotation(source.r))
          .setLinearDamping(content.linearDamping)
          .setAngularDamping(content.angularDamping),
      );
      body.setLinvel(vector(velocity), true);
      body.setAngvel(vector([spin(0), spin(1), spin(2)]), true);
      const { mass } = massProperties(realized.voxels, group.indices, realized.voxels.size);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(...scaled(bounds.halfExtents, scale))
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
      const anchor = applyPoint(corpse.transforms.get(group.indices[0]!)!, scaled(group.root.head, scale));
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
      joint.setFrameX2(rotation(mulMM(transpose(child.initial.r), parent.initial.r)));
      joint.setContactsEnabled(false);
      // The JS generic-joint wrapper lacks angular limits; Rapier's public raw set owns them.
      group.limits!.forEach((limits, axis) => {
        world.impulseJoints.raw.jointSetLimits(joint.handle, axis + 3, limits[0]!, limits[1]!);
      });
    });
    if (reach !== undefined && corpse.parts[0]) {
      const trunk = corpse.parts[0].body;
      const anchor = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(position[0], trunk.translation().y, position[2]),
      );
      corpse.anchors.push(anchor);
      corpse.joints.push(
        world.createImpulseJoint(
          RAPIER.JointData.rope(reach, vector([0, 0, 0]), vector([0, 0, 0])),
          anchor,
          trunk,
          true,
        ),
      );
    }
    this.terrain.set(corpse, { ground, cell: this.cellAt(position, ground.blockSize) });
    this.buildGround(corpse, position, ground);
  }

  spawnRigid(body: RigidBody, ground: RigidWorld): Ragdoll {
    const piece: Ragdoll = {
      transforms: new Map(),
      excluded: new Set(),
      parts: [],
      anchors: [],
      ground: new Set(),
      joints: [],
      steps: 0,
      settled: false,
      removed: false,
    };
    this.corpses.add(piece);
    this.debris.set(piece, { body, ground, cell: this.cellAt(body.center, ground.blockSize) });
    this.ready.then(() => {
      if (piece.removed || !this.world) {
        return;
      }
      const rigid = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...body.center)
          .setRotation({
            x: body.orientation[0],
            y: body.orientation[1],
            z: body.orientation[2],
            w: body.orientation[3],
          })
          .setLinvel(...body.velocity)
          .setAngvel(vector(angularVelocity(body)))
          .setLinearDamping(content.debris.linearDamping)
          .setAngularDamping(content.debris.angularDamping)
          .setCcdEnabled(true),
      );
      const half = [0, 1, 2].map((axis) => Math.max(...body.corners.map((corner) => Math.abs(corner[axis]!))));
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(half[0]!, half[1]!, half[2]!)
          .setMass(body.mass)
          .setFriction(content.debris.friction),
        rigid,
      );
      piece.parts.push({
        body: rigid,
        sources: new Map(),
        initial: { r: matrix(rigid.rotation()), t: [...body.center] },
      });
      this.buildGround(piece, body.center, ground);
    });
    return piece;
  }

  private buildGround(corpse: Ragdoll, position: Vec3, ground: RigidWorld): void {
    const size = ground.blockSize;
    const origin = position.map((value) => Math.floor(value / size));
    const desired = new Set<string>();
    const radius = content.footprintMetres.map((value) => Math.ceil(value / size));
    for (let x = origin[0]! - radius[0]!; x <= origin[0]! + radius[0]!; x++) {
      for (let y = origin[1]! - radius[1]!; y <= origin[1]! + radius[1]!; y++) {
        for (let z = origin[2]! - radius[2]!; z <= origin[2]! + radius[2]!; z++) {
          if (ground.isSolid(x, y, z)) {
            const key = `${size}:${x}:${y}:${z}`;
            desired.add(key);
            this.retainCell(corpse, key, size, [x, y, z]);
          }
        }
      }
    }
    for (const key of corpse.ground) {
      if (!desired.has(key)) {
        this.releaseCell(key);
        corpse.ground.delete(key);
      }
    }
  }

  private retainCell(corpse: Ragdoll, key: string, size: number, [x, y, z]: Vec3): void {
    if (corpse.ground.has(key)) {
      return;
    }
    let cell = this.cells.get(key);
    if (!cell) {
      cell = {
        users: 0,
        collider: this.world!.createCollider(
          RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
            .setTranslation((x + 0.5) * size, (y + 0.5) * size, (z + 0.5) * size)
            .setFriction(content.friction),
        ),
      };
      this.cells.set(key, cell);
    }
    cell.users += 1;
    corpse.ground.add(key);
  }

  private cellAt(position: Vec3, size: number): string {
    return position.map((value) => Math.floor(value / size)).join(':');
  }

  private releaseCell(key: string): void {
    const cell = this.cells.get(key)!;
    cell.users -= 1;
    if (cell.users === 0) {
      this.world?.removeCollider(cell.collider, false);
      this.cells.delete(key);
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
        this.refreshCorpseTerrain(corpse);
        this.syncRigid(corpse);
      }
    }
  }

  private refreshCorpseTerrain(corpse: Ragdoll): void {
    const terrain = this.terrain.get(corpse);
    const center = corpse.parts[0]?.body.translation();
    if (!(terrain && center) || corpse.settled) {
      return;
    }
    const position = array(center);
    const cell = this.cellAt(position, terrain.ground.blockSize);
    if (cell !== terrain.cell) {
      terrain.cell = cell;
      this.buildGround(corpse, position, terrain.ground);
    }
  }

  private syncRigid(corpse: Ragdoll): void {
    const target = this.debris.get(corpse);
    const [part] = corpse.parts;
    if (!(target && part)) {
      return;
    }
    target.body.center = array(part.body.translation());
    const q = part.body.rotation();
    target.body.orientation = [q.x, q.y, q.z, q.w];
    target.body.velocity = array(part.body.linvel());
    target.body.asleep = corpse.settled;
    const cell = this.cellAt(target.body.center, target.ground.blockSize);
    if (cell !== target.cell && !corpse.settled) {
      target.cell = cell;
      this.buildGround(corpse, target.body.center, target.ground);
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

  sever(corpse: Ragdoll, realized: Realized, excluded: ReadonlySet<number>, scale = 1): void {
    for (const index of excluded) {
      corpse.excluded.add(index);
    }
    for (const part of [...corpse.parts]) {
      if (![...excluded].some((index) => part.sources.has(index))) {
        continue;
      }
      for (const index of excluded) {
        part.sources.delete(index);
      }
      if (part.sources.size === 0) {
        this.world?.removeRigidBody(part.body);
        corpse.parts.splice(corpse.parts.indexOf(part), 1);
        continue;
      }
      const indices = [...part.sources.keys()];
      const bounds = voxelBounds(realized.voxels, indices);
      const source = corpse.transforms.get(indices[0]!)!;
      const center = applyPoint(source, scaled(bounds.center, scale));
      const bodyCenter = array(part.body.translation());
      const offset = mulMV(transpose(matrix(part.body.rotation())), [
        center[0] - bodyCenter[0],
        center[1] - bodyCenter[1],
        center[2] - bodyCenter[2],
      ]);
      const collider = part.body.collider(0);
      collider.setShape(new RAPIER.Cuboid(...scaled(bounds.halfExtents, scale)));
      collider.setTranslationWrtParent(vector(offset));
      collider.setMass(massProperties(realized.voxels, indices, realized.voxels.size).mass);
    }
  }

  hideColliders(corpse: Ragdoll): void {
    for (const part of corpse.parts) {
      part.body.setEnabled(false);
    }
  }

  counts(): { bodies: number; colliders: number; joints: number } {
    return {
      bodies: this.world?.bodies.len() ?? 0,
      colliders: this.world?.colliders.len() ?? 0,
      joints: this.world?.impulseJoints.len() ?? 0,
    };
  }

  remove(corpse: Ragdoll): void {
    if (corpse.removed) {
      return;
    }
    corpse.removed = true;
    for (const part of corpse.parts) {
      this.world?.removeRigidBody(part.body);
    }
    for (const anchor of corpse.anchors) {
      this.world?.removeRigidBody(anchor);
    }
    for (const key of corpse.ground) {
      this.releaseCell(key);
    }
    this.corpses.delete(corpse);
    this.debris.delete(corpse);
    this.terrain.delete(corpse);
  }

  dispose(): void {
    this.disposed = true;
    this.world?.free();
    this.world = undefined;
    this.corpses.clear();
    this.cells.clear();
    this.debris.clear();
    this.terrain.clear();
  }
}
