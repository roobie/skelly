import { DEFAULT_HANDED_CHARACTER } from './character.ts';
import type { Vec3 } from './coords.ts';

export type MeleeProfile = 'blunt' | 'cut' | 'pierce' | 'fists';
export type MeleeHand = 'right' | 'left';

/** Contact is quick for heavy weapons too; recovery still fills the item's full cooldown. */
const MELEE_WINDUP_FRACTION = 0.4;
const MELEE_WINDUP_CAP_SECONDS = 0.25;
export const meleeContactTime = (cooldown: number): number =>
  Math.min(MELEE_WINDUP_FRACTION * cooldown, MELEE_WINDUP_CAP_SECONDS);

export interface MeleeActionPose {
  profile: MeleeProfile;
  hand: MeleeHand;
  twoHanded: boolean;
  cooldown: number;
  contactAt: number;
  aimYaw: number;
  aimPitch: number;
  origin: Vec3;
  direction: Vec3;
  hitResolved: boolean;
}

export interface HandPose {
  offset: Vec3;
  rotation: Vec3;
}

export interface MeleePoseFrame {
  right: HandPose;
  left: HandPose;
  /** First-person upper-torso yaw in radians; camera orientation remains aim-locked. */
  torsoYaw?: number;
  viewOrientation?: { yaw: number; pitch: number };
  /** The same tick-locked ray consumed by the simulation at the contact phase. */
  contactRay?: { origin: Vec3; direction: Vec3 };
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const cleanZero = (value: number): number => (Object.is(value, -0) ? 0 : value);
const handPose = (offset: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0]): HandPose => ({
  offset: offset.map(cleanZero) as Vec3,
  rotation: rotation.map(cleanZero) as Vec3,
});
const smooth = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const blendHand = (from: HandPose, to: HandPose, amount: number): HandPose =>
  handPose(
    from.offset.map((value, index) => value + (to.offset[index]! - value) * amount) as Vec3,
    from.rotation.map((value, index) => value + (to.rotation[index]! - value) * amount) as Vec3,
  );
const swingPath = (
  elapsed: number,
  timing: { contact: number; cooldown: number },
  path: { pull: HandPose; strike: HandPose; follow: HandPose },
) => {
  const { contact, cooldown } = timing;
  const { pull, strike, follow } = path;
  const pullEnd = contact * 0.36;
  if (elapsed <= pullEnd) {
    return blendHand(handPose(), pull, smooth(elapsed / pullEnd));
  }
  if (elapsed < contact) {
    return blendHand(pull, strike, smooth((elapsed - pullEnd) / (contact - pullEnd)));
  }
  const recovery = Math.max(0.001, cooldown - contact);
  const followEnd = contact + recovery * 0.22;
  if (elapsed <= followEnd) {
    return blendHand(strike, follow, smooth((elapsed - contact) / (followEnd - contact)));
  }
  return blendHand(follow, handPose(), smooth((elapsed - followEnd) / (cooldown - followEnd)));
};

/** Pure pose-and-contact contract shared by first-person rendering and hit resolution. */
export const meleePoseAndContact = (action: MeleeActionPose, elapsed: number, ready: boolean): MeleePoseFrame => {
  const neutral = { right: handPose(), left: handPose() };
  if (ready && elapsed <= 0) {
    return readyMeleePose(true, action.hand);
  }
  if (elapsed < 0) {
    return { ...neutral, viewOrientation: { yaw: action.aimYaw, pitch: action.aimPitch } };
  }

  const contact = Math.max(0.001, action.contactAt);
  const sign = action.hand === 'right' ? 1 : -1;
  let pull: HandPose;
  let strike: HandPose;
  let follow: HandPose;
  switch (action.profile) {
    case 'blunt':
      pull = handPose([sign * 0.34, 0.08, 0.02], [-0.2, -sign * 1.25, sign * 0.2]);
      strike = handPose([sign * 0.04, 0.08, 0], [-1.5, sign * 0.55, -sign * 0.08]);
      follow = handPose([sign * 0.12, 0.04, 0], [-1.2, sign * 1.2, -sign * 0.18]);
      break;
    case 'cut':
      pull = handPose([sign * 0.1, 0.15, 0.14], [0.9, sign * 0.6, -sign * 0.15]);
      strike = handPose([sign * 0.03, -0.16, -0.18], [1.5, -sign * 0.55, sign * 0.25]);
      follow = handPose([-sign * 0.3, -0.2, -0.08], [2.2, -sign * 0.9, sign * 0.35]);
      break;
    case 'pierce':
      pull = handPose([sign * 0.1, 0.08, 0.15], [-1.1, -sign * 0.1, 0]);
      strike = handPose([-sign * 0.2, 0.2, -0.51], [-1.5, sign * 0.02, 0]);
      follow = handPose([-sign * 0.18, 0.12, -0.35], [-1.3, sign * 0.02, 0]);
      break;
    case 'fists':
      pull = handPose([sign * 0.12, 0.04, 0.3], [-0.1, -sign * 0.1, sign * 0.04]);
      strike = handPose([-sign * 0.2, 0.2, -0.04], [-0.14, sign * 0.05, -sign * 0.04]);
      follow = handPose([-sign * 0.08, 0.05, -0.38], [-0.05, sign * 0.02, 0]);
      break;
    default:
      throw new Error(`Unknown melee profile: ${action.profile}`);
  }
  const primary = swingPath(elapsed, { contact, cooldown: action.cooldown }, { pull, strike, follow });
  const support = action.twoHanded ? handPose() : blendHand(handPose(), primary, 0.2);
  const right = action.hand === 'right' ? primary : support;
  const left = action.hand === 'left' ? primary : support;
  const torsoYaw =
    action.profile === 'fists'
      ? cleanZero(
          sign *
            (Math.PI / 6) *
            (elapsed <= contact
              ? smooth(elapsed / contact)
              : 1 - smooth((elapsed - contact) / Math.max(0.001, action.cooldown - contact))),
        )
      : undefined;
  return {
    right,
    left,
    ...(torsoYaw === undefined ? {} : { torsoYaw }),
    viewOrientation: { yaw: action.aimYaw, pitch: action.aimPitch },
    ...(elapsed >= action.contactAt && !action.hitResolved
      ? { contactRay: { origin: [...action.origin] as Vec3, direction: [...action.direction] as Vec3 } }
      : {}),
  };
};

export const readyMeleePose = (
  ready: boolean,
  leading: MeleeHand = DEFAULT_HANDED_CHARACTER.handedness,
): MeleePoseFrame => {
  if (!ready) {
    return { right: handPose(), left: handPose() };
  }
  const primary = handPose([0.025, 0.085, 0.015], [0.12, -0.08, -0.04]);
  const support = handPose([-0.025, 0.075, 0.01], [0.1, 0.08, 0.04]);
  const reflect = (pose: HandPose): HandPose =>
    handPose(
      [-pose.offset[0], pose.offset[1], pose.offset[2]],
      [pose.rotation[0], -pose.rotation[1], -pose.rotation[2]],
    );
  return leading === 'right' ? { right: primary, left: support } : { left: reflect(primary), right: reflect(support) };
};

export const interpolateHandPose = (base: Vec3, pose: HandPose): { offset: Vec3; rotation: Vec3 } => ({
  offset: [base[0] + pose.offset[0], base[1] + pose.offset[1], base[2] + pose.offset[2]],
  rotation: [...pose.rotation],
});
