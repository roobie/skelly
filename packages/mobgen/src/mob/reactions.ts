import type { Pose } from '../core/pose.ts';
import type { Template } from '../core/template.ts';
import { type AttackClip, attackPose, zeroKey } from './attack.ts';
import type { WalkActor } from './gait.ts';

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

export const HIT_FLINCH: AttackClip = {
  name: 'hit-flinch',
  duration: 0.35,
  hitTime: 0.35,
  keys: [
    zeroKey(0, FLINCH_BONES),
    {
      t: 0.08,
      rotations: {
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
  readonly side?: number;
}

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
