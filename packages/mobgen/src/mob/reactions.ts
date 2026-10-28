// Reactions to taking damage: a short hit flinch (a recoil layered over whatever pose the actor is
// already in — walk, standing, or mid-attack) and a death fall (a whole-body topple to lying on the
// ground). EPIC.md asks for "animations for taking damage"; this is that, for mobgen actors.

import type { Bone } from '../core/body.ts';
import {
  applyPoint,
  clamp,
  compose,
  cross,
  dot,
  IDENTITY_M,
  length,
  type Mat3,
  mulMM,
  mulMV,
  normalize,
  rotAxis,
  rotX,
  rotY,
  rotZ,
  scale as scaleVector,
  smoothstep,
  sub,
  type Transform,
  transpose,
  type Vec3,
} from '../core/math.ts';
import { blendPose, boneLocalTransform, boneTransforms, type Pose } from '../core/pose.ts';
import { seededRng } from '../core/random.ts';
import type { Template } from '../core/template.ts';
import type { Voxels } from '../core/voxelize.ts';
import { type AttackClip, attackPose, zeroKey } from './attack.ts';
import { fitSkullContact } from './corpseContact.ts';
import deathContent from './deathPoses.json' with { type: 'json' };
import { corners, type Extent, GROUND_SMOOTHING, groundOffset, type WalkActor } from './gait.ts';

// ---- hit flinch: an AttackClip, played through the exact same interpolator/layering as an attack ----

const FLINCH_BONES = [
  'spine',
  'chest',
  'neck',
  'head',
  'jaw',
  'upperArm.L',
  'upperArm.R',
  'forearm.L',
  'forearm.R',
] as const;

/** A quick recoil: head/chest/spine snap back (and, via flinchPose's `side`, a little sideways) with a
 * jolt through the arms, then ease back to neutral. 0.35 s — fast enough to read as a flinch, not a
 * stagger. Z components are authored at their full "snap to one side" magnitude (mirrored by `side`, see
 * flinchPose); a straight-back-only flinch (no side info) scales them to 0. Same AttackClip shape as
 * LUNGE_GRAB (attack.ts): interpolated and layered on top of the current base pose by the very same
 * attackPose, so a flinch mid-walk or even mid-attack ("layer flinch on top of the attack pose") is just
 * another attackPose call with this clip and whatever pose is already current as its walkBase. */
export const HIT_FLINCH: AttackClip = {
  name: 'hit-flinch',
  duration: 0.35,
  // No damage is ever tied to a flinch — this field only exists because HIT_FLINCH is an AttackClip.
  // attackPose never reads hitTime; it's sampleVec3/armSwingWeight/samplePelvisDrop that matter, and none
  // of those touch it.
  hitTime: 0.35,
  keys: [
    zeroKey(0, FLINCH_BONES),
    {
      t: 0.08, // fast snap back
      rotations: {
        // Upright bones tip back for +x (attack.ts): about 26° at the head in total.
        spine: [4, 0, 5],
        chest: [6, 0, 7],
        neck: [6, 0, 8],
        head: [10, 0, 9],
        jaw: [12, 0, 0],
        'upperArm.L': [-25, 0, 12],
        'upperArm.R': [-25, 0, -12],
        'forearm.L': [20, 0, 0],
        'forearm.R': [20, 0, 0],
      },
    },
    zeroKey(0.35, FLINCH_BONES),
  ],
};

export const RUNNER_HIT_FLINCH: AttackClip = {
  ...HIT_FLINCH,
  name: 'runner-hit-flinch',
  keys: [
    zeroKey(0, FLINCH_BONES),
    {
      t: 0.07,
      rotations: {
        spine: [3, 0, 3],
        chest: [5, 0, 5],
        neck: [5, 0, 6],
        head: [9, 0, 7],
        jaw: [10, 0, 0],
        'upperArm.L': [-20, 0, 9],
        'upperArm.R': [-20, 0, -9],
        'forearm.L': [16, 0, 0],
        'forearm.R': [16, 0, 0],
      },
    },
    zeroKey(HIT_FLINCH.duration, FLINCH_BONES),
  ],
};

const FLINCH_CLIPS: Readonly<Record<string, AttackClip>> = {
  [HIT_FLINCH.name]: HIT_FLINCH,
  [RUNNER_HIT_FLINCH.name]: RUNNER_HIT_FLINCH,
};

export const flinchClipFor = (template: Pick<Template, 'name' | 'flinchClip'>): AttackClip => {
  const clip =
    template.flinchClip !== undefined && Object.hasOwn(FLINCH_CLIPS, template.flinchClip)
      ? FLINCH_CLIPS[template.flinchClip]
      : undefined;
  if (!clip) {
    throw new Error(`template "${template.name}" selects no known flinch clip (${String(template.flinchClip)})`);
  }
  return clip;
};

export interface FlinchParams {
  /** -1..1: mirrors HIT_FLINCH's own sideways (Z) snap, meant to come from the hit direction relative to
   * facing (a hit from the actor's right vs. left). 0 (the default) drops the sideways component
   * entirely — a straight-back-only snap — for a caller that doesn't have hit-direction info cheaply
   * available; that's a deliberate, documented simplification, not a bug. */
  readonly side?: number;
}

/** Every touched bone's authored Z (sideways) component scaled by `scale` — HIT_FLINCH's Z values are all
 * authored at scale 1 ("snap right"), so this is exactly a side mirror/mute without forking attackPose's
 * own interpolator. A plain data transform on the clip, not a runtime hook, so attackPose (attack.ts)
 * stays untouched and keeps its existing 4-parameter shape (every other caller — LUNGE_GRAB — never needs
 * this). */
const scaleClipZ = (clip: AttackClip, scale: number): AttackClip =>
  scale === 1
    ? clip
    : {
        ...clip,
        keys: clip.keys.map((key) => ({
          ...key,
          rotations: Object.fromEntries(
            Object.entries(key.rotations).map(([boneId, r]) => [boneId, r ? [r[0], r[1], r[2] * scale] : r]),
          ),
        })),
      };

export const flinchPoseWithClip = (
  actor: WalkActor,
  time: number,
  walkBase: Pose,
  options: FlinchParams & { readonly clip: AttackClip },
): Pose => attackPose(actor, scaleClipZ(options.clip, options.side ?? 0), time, walkBase);

export const flinchPose = (actor: WalkActor, time: number, walkBase: Pose, params: FlinchParams = {}): Pose =>
  flinchPoseWithClip(actor, time, walkBase, { ...params, clip: HIT_FLINCH });

// ---- death fall: whole-body motion the clip format can't express (root pitch + a ground-anchored drop) ----

export interface DeathParams {
  /** Biases selection away from the hit without excluding other resting poses. */
  readonly direction: 1 | -1;
  readonly seed?: number;
  readonly poseId?: string;
}

export interface DeathActor extends WalkActor {
  readonly posture: 'upright' | 'prone';
  readonly voxels: Voxels;
  /** Every bone's rest-pose extents (gait.ts's bodyRestExtents), not just the feet: a fallen body's
   * lowest point is rarely a foot, so re-grounding needs the whole body, not just what walkPose/attackPose
   * ground against. */
  readonly bodyExtents: ReadonlyMap<string, Extent>;
}

export const DEATH_FALL_DURATION = deathContent.duration;
const DEATH_POSES = deathContent.poses;
const restingPoses = new WeakMap<DeathActor['bodyExtents'], Map<string, Pose>>();
const supportFaces: Readonly<Record<DeathActor['posture'], Readonly<Record<string, readonly number[]>>>> =
  deathContent.supportFaces;

const selectDeathPose = (seed: number, direction: 1 | -1, poseId?: string) => {
  if (poseId !== undefined) {
    const pose = DEATH_POSES.find((entry) => entry.id === poseId);
    if (!pose) {
      throw new Error(`Unknown death pose: ${poseId}`);
    }
    return pose;
  }
  const weight = (entry: (typeof DEATH_POSES)[number]): number =>
    direction === 1 ? entry.weights.forward : entry.weights.backward;
  let choice = seededRng(seed)() * DEATH_POSES.reduce((sum, entry) => sum + weight(entry), 0);
  for (const entry of DEATH_POSES) {
    choice -= weight(entry);
    if (choice < 0) {
      return entry;
    }
  }
  throw new Error('Death pose set has no positive selection weight');
};

const align = (from: Vec3, to: Vec3): Mat3 => {
  const axis = cross(from, to);
  if (length(axis) < 1e-10) {
    return IDENTITY_M;
  }
  return rotAxis(axis, (Math.acos(clamp(dot(normalize(from), normalize(to)), -1, 1)) * 180) / Math.PI);
};

const supportedRotation = (
  actor: DeathActor,
  bone: Bone,
  {
    world,
    flatWorlds,
    atDrop,
  }: {
    world: Transform;
    flatWorlds: ReadonlyMap<string, Transform>;
    atDrop: (drop: number) => Mat3;
  },
): Mat3 => {
  const extent = actor.bodyExtents.get(bone.id)!;
  const constraints = corners(extent).map((point) => ({ point: sub(point, bone.head), below: 0 }));
  // An ankle cannot settle below the foot's thickness, nor a wrist below its hand.
  for (const child of actor.bones.filter((entry) => entry.parent === bone.id)) {
    const childExtent = actor.bodyExtents.get(child.id);
    if (!childExtent) {
      continue;
    }
    const childR = flatWorlds.get(child.id)!.r;
    constraints.push({
      point: sub(child.head, bone.head),
      below: Math.min(...corners(childExtent).map((point) => mulMV(childR, sub(point, child.head))[1])),
    });
  }
  const [, headY] = applyPoint(world, bone.head);
  let supported = 0;
  let penetrating = length(sub(bone.tail, bone.head));
  for (let iteration = 0; iteration < 16; iteration++) {
    const drop = (supported + penetrating) / 2;
    const candidate = atDrop(drop);
    const lowest = Math.min(...constraints.map(({ point, below }) => headY + mulMV(candidate, point)[1] + below));
    if (lowest >= 0) {
      supported = drop;
    } else {
      penetrating = drop;
    }
  }
  return atDrop(supported);
};

const restingRotation = (
  actor: DeathActor,
  bone: Bone,
  world: Transform,
  flatWorlds: ReadonlyMap<string, Transform> | undefined,
): Mat3 => {
  if (bone.parent === null) {
    // Keep the authored hip incline so a thicker chest does not suspend the pelvis.
    return world.r;
  }
  const vector = mulMV(world.r, sub(bone.tail, bone.head));
  const horizontal: Vec3 = [vector[0], 0, vector[2]];
  if (length(horizontal) <= 1e-10) {
    return world.r;
  }
  let flat = mulMM(align(vector, horizontal), world.r);
  const face = supportFaces[actor.posture][bone.id];
  if (face) {
    const axis = normalize(horizontal);
    const normal = mulMV(flat, [face[0]!, face[1]!, face[2]!]);
    const down: Vec3 = [0, -1, 0];
    // Roll around the bone, not the shortest arc to the floor: that arc swings the toes inward.
    const angle = (Math.atan2(dot(axis, cross(normal, down)), dot(normal, down)) * 180) / Math.PI;
    flat = mulMM(rotAxis(axis, angle), flat);
  }
  const atDrop = (drop: number): Mat3 => {
    const planar = scaleVector(normalize(horizontal), Math.sqrt(Math.max(0, dot(vector, vector) - drop * drop)));
    return mulMM(align(horizontal, [planar[0], -drop, planar[2]]), flat);
  };
  return flatWorlds && actor.bodyExtents.has(bone.id) && deathContent.settleBones.includes(bone.id)
    ? supportedRotation(actor, bone, { world, flatWorlds, atDrop })
    : atDrop(0);
};

const relaxBones = (actor: DeathActor, rotations: Record<string, Mat3>, supportFit: boolean): void => {
  const root: Vec3 = [0, groundOffset(actor.bones, actor.bodyExtents, rotations), 0];
  const worlds = new Map<string, Transform>();
  const flatWorlds = supportFit ? boneTransforms(actor.bones, { root, rotations }) : undefined;
  for (const bone of actor.bones) {
    const parent: Transform = bone.parent === null ? { r: IDENTITY_M, t: [0, 0, 0] } : worlds.get(bone.parent)!;
    const local = boneLocalTransform(bone, { root, rotations });
    const world = compose(parent, local);
    const settled = restingRotation(actor, bone, world, flatWorlds);
    rotations[bone.id] = mulMM(transpose(parent.r), settled);
    const settledLocal = boneLocalTransform(bone, { root, rotations });
    worlds.set(bone.id, compose(parent, settledLocal));
  }
};

/** A root-only floor fit cannot lower a bent knee or a hand frozen in an attack. */
const restingPose = (actor: DeathActor, rotations: Record<string, Mat3>, headRolls: readonly number[]): Pose => {
  relaxBones(actor, rotations, false);
  relaxBones(actor, rotations, true);
  const root: Vec3 = [0, groundOffset(actor.bones, actor.bodyExtents, rotations, GROUND_SMOOTHING), 0];
  fitSkullContact(actor, rotations, [0, groundOffset(actor.bones, actor.bodyExtents, rotations), 0], headRolls);
  return { root, rotations };
};

export const deathPose = (actor: DeathActor, basePose: Pose, t: number, params: DeathParams): Pose => {
  if (t <= 0) {
    return basePose;
  }
  // Compound rigs have no humanoid root to topple; keep their member poses intact.
  if (!actor.bones.some((bone) => bone.id === 'pelvis' && bone.parent === null)) {
    return {
      ...basePose,
      root: [
        basePose.root[0],
        groundOffset(actor.bones, actor.bodyExtents, basePose.rotations, GROUND_SMOOTHING),
        basePose.root[2],
      ],
    };
  }
  const entry = selectDeathPose(params.seed ?? actor.seed, params.direction, params.poseId);
  let cache = restingPoses.get(actor.bodyExtents);
  if (!cache) {
    cache = new Map();
    restingPoses.set(actor.bodyExtents, cache);
  }
  const cacheKey = `${actor.posture}:${entry.id}`;
  let rest = cache.get(cacheKey);
  if (!rest) {
    // An already-prone body must not interpolate through an upright fall or reverse its reaching arms.
    const target = entry.postures[actor.posture];
    const rotations: Record<string, Mat3> = Object.fromEntries(
      Object.entries(target.rotations).map(([id, angles]) => [
        id,
        mulMM(rotZ(angles[2]!), mulMM(rotY(angles[1]!), rotX(angles[0]!))),
      ]),
    );
    rotations.pelvis = mulMM(rotX(target.pitch), rotY(target.roll));
    rest = restingPose(actor, rotations, target.contactHeadRolls);
    cache.set(cacheKey, rest);
  }
  const blended = blendPose(
    basePose,
    { ...rest, root: [basePose.root[0], rest.root[1], basePose.root[2]] },
    smoothstep(clamp(t / DEATH_FALL_DURATION, 0, 1)),
  );
  return {
    ...blended,
    root: [
      basePose.root[0],
      t >= DEATH_FALL_DURATION
        ? rest.root[1]
        : groundOffset(actor.bones, actor.bodyExtents, blended.rotations, GROUND_SMOOTHING),
      basePose.root[2],
    ],
  };
};
