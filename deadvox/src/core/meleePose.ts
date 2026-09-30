import type { Vec3 } from './coords.ts';

export type MeleeProfile = 'blunt' | 'cut' | 'pierce' | 'fists';
export type MeleeHand = 'right' | 'left';

/** Contact is quick for heavy weapons too; recovery still fills the item's full cooldown. */
export const MELEE_WINDUP_FRACTION = 0.4;
export const MELEE_WINDUP_CAP_SECONDS = 0.25;
/** Maximum click offset inside one 20 Hz zombie simulation step. */
export const MELEE_START_OFFSET_MAX_SECONDS = 0.05;

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
  viewOrientation?: { yaw: number; pitch: number };
  /** The same click-locked ray consumed by the simulation at the contact phase. */
  contactRay?: { origin: Vec3; direction: Vec3 };
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const cleanZero = (value: number): number => (Object.is(value, -0) ? 0 : value);
const handPose = (offset: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0]): HandPose => ({
  offset: offset.map(cleanZero) as Vec3,
  rotation: rotation.map(cleanZero) as Vec3,
});

/** Pure pose-and-contact contract shared by first-person rendering and hit resolution. */
export const meleePoseAndContact = (action: MeleeActionPose, elapsed: number, ready: boolean): MeleePoseFrame => {
  const neutral = { right: handPose(), left: handPose() };
  if (ready && elapsed <= 0) {
    return {
      right: handPose([0.025, 0.085, 0.015], [0.12, -0.08, -0.04]),
      left: handPose([-0.025, 0.075, 0.01], [0.1, 0.08, 0.04]),
    };
  }
  if (elapsed < 0) {
    return { ...neutral, viewOrientation: { yaw: action.aimYaw, pitch: action.aimPitch } };
  }

  const contact = Math.max(0.001, action.contactAt);
  const recovery = Math.max(0.001, action.cooldown - contact);
  const windup = clamp01(elapsed / contact);
  const recover = clamp01((elapsed - contact) / recovery);
  const envelope = elapsed < contact ? windup : 1 - recover;
  const sign = action.hand === 'right' ? 1 : -1;
  let reach = 0;
  let lateral = 0;
  let rise = 0;
  let yaw = 0;
  let pitch = 0;
  let roll = 0;

  switch (action.profile) {
    case 'blunt':
      reach = -0.13 * envelope;
      lateral = sign * 0.11 * envelope;
      rise = 0.04 * envelope;
      yaw = sign * 0.55 * envelope;
      pitch = 0.28 * envelope;
      roll = -sign * 0.18 * envelope;
      break;
    case 'cut':
      reach = -0.16 * envelope;
      lateral = sign * 0.16 * envelope;
      rise = 0.015 * envelope;
      yaw = -sign * 0.72 * envelope;
      pitch = 0.12 * envelope;
      roll = sign * 0.23 * envelope;
      break;
    case 'pierce':
      reach = -0.23 * envelope;
      pitch = -0.08 * envelope;
      break;
    case 'fists':
      reach = -0.2 * envelope;
      lateral = sign * 0.025 * envelope;
      pitch = -0.08 * envelope;
      break;
    default:
      break;
  }

  const primary = handPose([sign * lateral, rise, reach], [pitch, yaw, roll]);
  const support = action.twoHanded
    ? handPose()
    : handPose([-sign * lateral * 0.35, rise * 0.5, reach * 0.15], [pitch * 0.5, yaw * 0.3, -roll * 0.4]);
  const right = action.hand === 'right' ? primary : support;
  const left = action.hand === 'left' ? primary : support;
  return {
    right,
    left,
    viewOrientation: { yaw: action.aimYaw, pitch: action.aimPitch },
    ...(elapsed >= action.contactAt && !action.hitResolved
      ? { contactRay: { origin: [...action.origin] as Vec3, direction: [...action.direction] as Vec3 } }
      : {}),
  };
};

export const readyMeleePose = (ready: boolean): MeleePoseFrame =>
  ready
    ? {
        right: handPose([0.025, 0.085, 0.015], [0.12, -0.08, -0.04]),
        left: handPose([-0.025, 0.075, 0.01], [0.1, 0.08, 0.04]),
      }
    : { right: handPose(), left: handPose() };

export const interpolateHandPose = (base: Vec3, pose: HandPose): { offset: Vec3; rotation: Vec3 } => ({
  offset: [base[0] + pose.offset[0], base[1] + pose.offset[1], base[2] + pose.offset[2]],
  rotation: [...pose.rotation],
});
