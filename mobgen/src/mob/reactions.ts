// Reactions to taking damage: a short hit flinch (a recoil layered over whatever pose the actor is
// already in — walk, standing, or mid-attack) and a death fall (a whole-body topple to lying on the
// ground). EPIC.md asks for "animations for taking damage"; this is that, for mobgen actors.

import { IDENTITY_M, type Mat3, mulMM, rotX, rotZ, type Vec3 } from '../core/math.ts';
import type { Pose } from '../core/pose.ts';
import { type AttackClip, attackPose, zeroKey } from './attack.ts';
import { type Extent, GROUND_SMOOTHING, groundOffset, type WalkActor } from './gait.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const smoothstep = (x: number): number => x * x * (3 - 2 * x);

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

export const flinchPose = (actor: WalkActor, time: number, walkBase: Pose, params: FlinchParams = {}): Pose =>
  attackPose(actor, scaleClipZ(HIT_FLINCH, params.side ?? 0), time, walkBase);

// ---- death fall: whole-body motion the clip format can't express (root pitch + a ground-anchored drop) ----

export interface DeathParams {
  /** +1 topples forward (collapses face down); -1 topples backward (collapses face up). */
  readonly direction: 1 | -1;
}

export interface DeathActor extends WalkActor {
  /** Every bone's rest-pose extents (gait.ts's bodyRestExtents), not just the feet: a fallen body's
   * lowest point is rarely a foot, so re-grounding needs the whole body, not just what walkPose/attackPose
   * ground against. */
  readonly bodyExtents: ReadonlyMap<string, Extent>;
}

/** Seconds of active buckle+topple motion; deathPose holds this final pose for any `t` beyond it — the
 * caller (a renderer) drives its own "lie there, then sink" timing on top, entirely outside this pure
 * function, by just continuing to call deathPose with a saturating `t`. */
export const DEATH_FALL_DURATION = 1.15;
const BUCKLE_END = 0.4; // knees/torso finish buckling by here — the topple continues after
const TOPPLE_START = 0.15; // topple begins before the buckle finishes, so it reads as one motion
const TOPPLE_DEG = 100; // final pelvis pitch — a little past horizontal, so the smooth-min ground fit
// (below) doesn't have to lean on the buckled limbs alone to clear the torso.

const rotXCompose = (base: Mat3, deg: number): Mat3 => mulMM(base, rotX(deg));

/**
 * A pure whole-body collapse: knees bend and the torso slumps (0 to BUCKLE_END), while the whole body
 * (the pelvis — this rig's root bone, so its own rotation carries every other bone with it) pitches from
 * upright to lying down (TOPPLE_START to DEATH_FALL_DURATION). Composed onto `basePose` (mulMM(baseR,
 * delta), never overwritten outright) so deathPose(actor, basePose, 0, params) is exactly basePose, the
 * same convention attackPose uses for its own zero-slope endpoints. Re-grounded at the end against
 * `actor.bodyExtents` (not the feet-only extents walkPose/attackPose use) via the same groundOffset
 * smooth-min everything else in mobgen uses, so the lowest point of the *whole* fallen body — whichever
 * bone that ends up being — lands within GROUND_SMOOTHING's usual few-mm/cm tolerance of y=0, regardless
 * of the exact topple angle or basePose: see this module's report for the derivation (root.y is solved
 * for, not tuned by hand).
 */
export const deathPose = (actor: DeathActor, basePose: Pose, t: number, params: DeathParams): Pose => {
  const clamped = clamp(t, 0, DEATH_FALL_DURATION);
  const buckle = smoothstep(clamp(clamped / BUCKLE_END, 0, 1));
  const toppleU = smoothstep(clamp((clamped - TOPPLE_START) / (DEATH_FALL_DURATION - TOPPLE_START), 0, 1));

  const slumpDeg = 8 * buckle; // spine/chest/neck/head curl toward the fall, on top of the topple
  // Upright-bone convention (attack.ts's header comment, verified there against boneTransforms): +rotX
  // tips an upright bone backward, -rotX pitches it forward. direction=+1 (forward fall) needs a negative
  // angle; direction=-1 (backward fall) needs a positive one — hence the leading minus.
  const pitch = -params.direction * TOPPLE_DEG * toppleU;
  const slump = -params.direction * slumpDeg;
  // Legs stay rigid with the pelvis (zero extra local rotation, besides a modest buckle-driven knee give)
  // rather than counter-rotated to stay "planted": the pelvis's own ~100° topple already carries a
  // zero-local-rotation leg from hanging straight down to trailing out roughly flat behind the fallen
  // torso — exactly the lying-flat shape wanted (verified numerically: countering it to keep the legs
  // near-vertical instead left the pelvis pinned near standing height, a bow at the waist, not a fall).
  const hipFlexDeg = 15 * buckle;
  const kneeFlexDeg = 35 * buckle;

  const baseR = (id: string): Mat3 => basePose.rotations[id] ?? IDENTITY_M;
  const rotations: Record<string, Mat3> = {
    ...basePose.rotations,
    pelvis: rotXCompose(baseR('pelvis'), pitch),
    spine: rotXCompose(baseR('spine'), slump * 0.4),
    chest: rotXCompose(baseR('chest'), slump * 0.6),
    neck: rotXCompose(baseR('neck'), slump * 0.8),
    head: rotXCompose(baseR('head'), slump),
    'thigh.L': rotXCompose(baseR('thigh.L'), hipFlexDeg),
    'thigh.R': rotXCompose(baseR('thigh.R'), hipFlexDeg),
    'shin.L': rotXCompose(baseR('shin.L'), kneeFlexDeg),
    'shin.R': rotXCompose(baseR('shin.R'), kneeFlexDeg),
    // A little limb-splay as the knees/hips give, cosmetic only — hanging-limb convention (gait.ts's
    // header comment): +rotX swings forward, rotZ splays outward (mirrored L/R).
    'upperArm.L': mulMM(baseR('upperArm.L'), mulMM(rotX(20 * buckle), rotZ(-25 * buckle))),
    'upperArm.R': mulMM(baseR('upperArm.R'), mulMM(rotX(20 * buckle), rotZ(25 * buckle))),
    'forearm.L': rotXCompose(baseR('forearm.L'), 30 * buckle),
    'forearm.R': rotXCompose(baseR('forearm.R'), 30 * buckle),
  };

  const root: Vec3 = [
    basePose.root[0],
    groundOffset(actor.bones, actor.bodyExtents, rotations, GROUND_SMOOTHING),
    basePose.root[2],
  ];
  return { root, rotations };
};
