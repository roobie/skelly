import { MELEE_DAMAGE_KINDS } from './body.ts';
import { DEFAULT_HANDED_CHARACTER, dominantSide, type HandedCharacter } from './character.ts';
import type { Vec3 } from './coords.ts';
import { MELEE_MOTIONS } from './meleeMotion.ts';
import {
  type MeleeActionPose,
  type MeleeHand,
  type MeleeProfile,
  meleeContactTime,
  meleePoseAndContact,
  meleePullEnd,
} from './meleePose.ts';
import type { MeleeCharge } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { MeleeWeapon } from './zombies.ts';

export interface MeleeActionState extends MeleeActionPose {
  elapsed: number;
  hands: { right: number | null; left: number | null };
  weapon: MeleeWeapon;
  /** Sim seconds held at the pull; present only while a charged swing waits for its release. */
  chargeHeldSimSeconds?: number | undefined;
}

/** The attack control as a charged swing sees it each tick. */
export interface MeleeChargeInput {
  /** Whether the dominant hand's attack is still held. */
  held: boolean;
  /** Where the player looks this tick; a held charge strikes where the player looks at release. */
  aim: { origin: Vec3; direction: Vec3; yaw: number; pitch: number };
}

/** The charge level, from 0 to 1, that holding at the pull for `heldSimSeconds` builds. */
const meleeChargeLevel = (charge: MeleeCharge, heldSimSeconds: number): number =>
  Math.min(1, Math.max(0, heldSimSeconds / charge.fullSimSeconds)) ** charge.curveExponent;

const withoutCharge = (weapon: MeleeWeapon): MeleeWeapon => {
  const { charge: _charge, ...rest } = weapon;
  return rest;
};

/** The strike a released charge carries: its damage and impulse scaled by the level, with nothing left to charge. */
const chargedMeleeStrike = (weapon: MeleeWeapon, charge: MeleeCharge, level: number): MeleeWeapon => ({
  ...withoutCharge(weapon),
  damage: weapon.damage * (1 + (charge.damageMultiplier - 1) * level),
  impulse: weapon.impulse * (1 + (charge.impulseMultiplier - 1) * level),
});

export interface BeginMeleeSwing {
  origin: Vec3;
  direction: Vec3;
  weapon: MeleeWeapon;
  profile: MeleeProfile;
  hand?: MeleeHand;
  twoHanded: boolean;
  hands: { right: number | null; left: number | null };
  aimYaw?: number;
  aimPitch?: number;
}

/** Copies only fields that belong to a saved melee weapon, excluding caller-owned metadata. */
export const copyMeleeWeapon = (weapon: MeleeWeapon): MeleeWeapon => ({
  motion: weapon.motion,
  damage: weapon.damage,
  reach: weapon.reach,
  cooldown: weapon.cooldown,
  contactFraction: weapon.contactFraction,
  windupCapSimSeconds: weapon.windupCapSimSeconds,
  stamina: weapon.stamina,
  impulse: weapon.impulse,
  ...(weapon.damageVariance === undefined ? {} : { damageVariance: weapon.damageVariance }),
  ...(weapon.headDamageMultiplier === undefined ? {} : { headDamageMultiplier: weapon.headDamageMultiplier }),
  ...(weapon.limbDamageMultiplier === undefined ? {} : { limbDamageMultiplier: weapon.limbDamageMultiplier }),
  ...(weapon.speedMultiplier === undefined ? {} : { speedMultiplier: weapon.speedMultiplier }),
  ...(weapon.swingSound === undefined ? {} : { swingSound: weapon.swingSound }),
  ...(weapon.hitSound === undefined ? {} : { hitSound: weapon.hitSound }),
  ...(weapon.hitLayerSound === undefined ? {} : { hitLayerSound: weapon.hitLayerSound }),
  ...(weapon.type === undefined ? {} : { type: weapon.type }),
  ...(weapon.charge === undefined ? {} : { charge: { ...weapon.charge } }),
});

export interface PlayerCombatState {
  playerAttackWait: number;
  meleeAction: MeleeActionState | null;
  nextFistHand: MeleeHand;
}

export interface PlayerCombatHooks {
  onWeaponHit?: (uid: number) => void;
  onLandedHit?: () => void;
  onCompletedSwing?: (isFist: boolean) => void;
  /** Spends up to the stamina a charge release wants and returns what it paid. */
  payChargeStamina?: (wanted: number) => number;
}

export interface MeleeTargetResolver {
  playPlayerMeleeSwing: (origin: Vec3, weapon: MeleeWeapon) => void;
  resolvePlayerMelee: (origin: Vec3, direction: Vec3, weapon: MeleeWeapon, isFist: boolean) => boolean;
}

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
};
const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
const contactTimeOf = (weapon: MeleeWeapon): number =>
  meleeContactTime(weapon.cooldown, weapon.contactFraction, weapon.windupCapSimSeconds);
// Restore accepts exactly the swings tick resolves, so a save inside the float tolerance loads.
const contactReached = (elapsed: number, contactAt: number): boolean => elapsed + 1e-9 >= contactAt;
const validMeleeCharge = (charge: MeleeCharge): boolean =>
  [charge.fullSimSeconds, charge.curveExponent, charge.damageMultiplier, charge.impulseMultiplier].every(
    (value) => Number.isFinite(value) && value > 0,
  ) &&
  Number.isFinite(charge.stamina) &&
  charge.stamina >= 0;
const validMeleeWeapon = (weapon: MeleeWeapon, actionCooldown: number): boolean =>
  MELEE_MOTIONS.includes(weapon.motion) &&
  Number.isFinite(weapon.damage) &&
  weapon.damage > 0 &&
  Number.isFinite(weapon.reach) &&
  weapon.reach > 0 &&
  weapon.cooldown === actionCooldown &&
  Number.isFinite(weapon.stamina) &&
  weapon.stamina >= 0 &&
  Number.isFinite(weapon.impulse) &&
  weapon.impulse >= 0 &&
  (weapon.damageVariance === undefined ||
    (Number.isFinite(weapon.damageVariance) && weapon.damageVariance >= 0 && weapon.damageVariance <= 1)) &&
  (weapon.headDamageMultiplier === undefined ||
    (Number.isFinite(weapon.headDamageMultiplier) && weapon.headDamageMultiplier > 0)) &&
  (weapon.limbDamageMultiplier === undefined ||
    (Number.isFinite(weapon.limbDamageMultiplier) && weapon.limbDamageMultiplier > 0)) &&
  (weapon.speedMultiplier === undefined || (Number.isFinite(weapon.speedMultiplier) && weapon.speedMultiplier > 0)) &&
  [weapon.swingSound, weapon.hitSound, weapon.hitLayerSound].every(
    (sound) => sound === undefined || sound.length > 0,
  ) &&
  (weapon.type === undefined || MELEE_DAMAGE_KINDS.includes(weapon.type)) &&
  (weapon.charge === undefined || validMeleeCharge(weapon.charge));

export class PlayerCombat {
  private playerAttackWait = 0;
  private meleeAction: MeleeActionState | null = null;
  private readonly character: HandedCharacter;
  private nextFistHand: MeleeHand;
  private readonly targets: MeleeTargetResolver;
  private readonly onWeaponHit: (uid: number) => void;
  private readonly onLandedHit: () => void;
  private readonly onCompletedSwing: (isFist: boolean) => void;
  private readonly payChargeStamina: (wanted: number) => number;

  constructor(
    targets: MeleeTargetResolver,
    character: HandedCharacter = DEFAULT_HANDED_CHARACTER,
    hooks: PlayerCombatHooks = {},
  ) {
    this.character = character;
    this.nextFistHand = dominantSide(character);
    this.targets = targets;
    this.onWeaponHit = hooks.onWeaponHit ?? (() => undefined);
    this.onLandedHit = hooks.onLandedHit ?? (() => undefined);
    this.onCompletedSwing = hooks.onCompletedSwing ?? (() => undefined);
    this.payChargeStamina = hooks.payChargeStamina ?? ((wanted) => wanted);
  }

  get activeMeleeAction(): Readonly<MeleeActionState> | undefined {
    return this.meleeAction ?? undefined;
  }

  snapshotState(): Readonly<PlayerCombatState> {
    return freezeSnapshot({
      playerAttackWait: this.playerAttackWait,
      meleeAction: this.meleeAction === null ? null : structuredClone(this.meleeAction),
      nextFistHand: this.nextFistHand,
    });
  }

  restoreState(state: PlayerCombatState): void {
    if (!Number.isFinite(state.playerAttackWait) || state.playerAttackWait < 0) {
      throw new Error('Invalid player attack cooldown');
    }
    if (state.nextFistHand !== 'right' && state.nextFistHand !== 'left') {
      throw new Error('Invalid next fist hand');
    }
    this.validateAction(state.meleeAction);
    this.playerAttackWait = state.playerAttackWait;
    this.meleeAction = state.meleeAction === null ? null : structuredClone(state.meleeAction);
    this.nextFistHand = state.nextFistHand;
  }

  private resolveContact(action: MeleeActionState): void {
    const contact = meleePoseAndContact(action, action.contactAt, false).contactRay;
    if (!contact) {
      return;
    }
    const hit = this.targets.resolvePlayerMelee(
      contact.origin,
      contact.direction,
      action.weapon,
      action.profile === 'fists',
    );
    const weaponUid = action.profile === 'fists' ? null : action.hands[action.hand];
    if (hit) {
      this.onLandedHit();
      if (weaponUid !== null) {
        this.onWeaponHit(weaponUid);
      }
    }
  }

  /** Drops a held charge without a strike; a swing that is not holding a charge goes on. */
  cancelCharge(): void {
    if (this.meleeAction?.chargeHeldSimSeconds !== undefined) {
      this.meleeAction = null;
    }
  }

  private aimCharge(action: MeleeActionState, charge: MeleeChargeInput | undefined): void {
    if (charge === undefined) {
      return;
    }
    action.origin = copy(charge.aim.origin);
    action.direction = unit(charge.aim.direction);
    action.aimYaw = charge.aim.yaw;
    action.aimPitch = charge.aim.pitch;
  }

  private releaseCharge(action: MeleeActionState, heldSimSeconds: number): void {
    const { charge } = action.weapon;
    if (charge === undefined) {
      throw new Error('A held melee charge needs its weapon charge');
    }
    const level = meleeChargeLevel(charge, heldSimSeconds);
    const wanted = charge.stamina * level;
    // Stamina short of the cost caps the charge at what was paid.
    const paidLevel = wanted > 0 ? Math.min(level, this.payChargeStamina(wanted) / charge.stamina) : level;
    action.weapon = chargedMeleeStrike(action.weapon, charge, paidLevel);
    action.chargeHeldSimSeconds = undefined;
  }

  /** Returns true while the action holds at the pull, so the swing does not advance this tick. */
  private holdCharge(action: MeleeActionState, dt: number, charge: MeleeChargeInput | undefined): boolean {
    if (action.chargeHeldSimSeconds !== undefined) {
      this.aimCharge(action, charge);
      if (charge?.held) {
        action.chargeHeldSimSeconds += dt;
        return true;
      }
      this.releaseCharge(action, action.chargeHeldSimSeconds);
      return false;
    }
    if (action.weapon.charge === undefined) {
      return false;
    }
    // A swing let go before the pull, or one from the off hand, strikes as an ordinary swing.
    if (!charge?.held || action.hand !== dominantSide(this.character)) {
      action.weapon = withoutCharge(action.weapon);
      return false;
    }
    const pullEnd = meleePullEnd(action.contactAt);
    if (action.elapsed + dt < pullEnd) {
      return false;
    }
    action.chargeHeldSimSeconds = action.elapsed + dt - pullEnd;
    action.elapsed = pullEnd;
    this.aimCharge(action, charge);
    return true;
  }

  /** `charge` is the attack control this tick; without it a charged weapon swings as an ordinary one. */
  tick(dt: number, hands: { right: number | null; left: number | null }, charge?: MeleeChargeInput): void {
    if (dt <= 0) {
      return;
    }
    const action = this.meleeAction;
    // Time held at the pull is not recovery: the swing's own timing resumes at release.
    if (action?.chargeHeldSimSeconds === undefined) {
      this.playerAttackWait = Math.max(0, this.playerAttackWait - dt);
    }
    if (!action) {
      return;
    }
    if (hands.right !== action.hands.right || hands.left !== action.hands.left) {
      this.meleeAction = null;
      return;
    }
    if (this.holdCharge(action, dt, charge)) {
      return;
    }
    const elapsed = Math.min(action.cooldown, action.elapsed + dt);
    if (!action.hitResolved && contactReached(elapsed, action.contactAt)) {
      this.resolveContact(action);
      action.hitResolved = true;
    }
    if (elapsed >= action.cooldown) {
      this.onCompletedSwing(action.profile === 'fists');
      this.meleeAction = null;
    } else {
      action.elapsed = elapsed;
    }
  }

  beginMeleeSwing(start: BeginMeleeSwing): boolean {
    const { weapon, profile } = start;
    if (this.playerAttackWait > 0 || this.meleeAction !== null || weapon.cooldown <= 0) {
      return false;
    }
    const hand = profile === 'fists' ? (start.hand ?? this.nextFistHand) : (start.hand ?? dominantSide(this.character));
    const direction = unit(start.direction);
    if (profile === 'fists' && start.hand === undefined) {
      this.nextFistHand = hand === 'right' ? 'left' : 'right';
    }
    this.playerAttackWait = weapon.cooldown;
    this.meleeAction = {
      profile,
      hand,
      twoHanded: start.twoHanded,
      cooldown: weapon.cooldown,
      contactAt: contactTimeOf(weapon),
      aimYaw: start.aimYaw ?? Math.atan2(-direction[0], -direction[2]),
      aimPitch: start.aimPitch ?? Math.asin(Math.max(-1, Math.min(1, direction[1]))),
      elapsed: 0,
      hitResolved: false,
      origin: copy(start.origin),
      direction,
      hands: { ...start.hands },
      weapon: copyMeleeWeapon(weapon),
    };
    this.targets.playPlayerMeleeSwing(copy(start.origin), this.meleeAction.weapon);
    return true;
  }

  private validateAction(action: MeleeActionState | null): void {
    if (action === null) {
      return;
    }
    const vector3 = (value: unknown): value is Vec3 =>
      Array.isArray(value) && value.length === 3 && value.every((component) => Number.isFinite(component));
    const validUid = (uid: number | null): boolean => uid === null || (Number.isSafeInteger(uid) && uid > 0);
    if (
      !(action.profile === 'fists' || MELEE_DAMAGE_KINDS.includes(action.profile)) ||
      (action.hand !== 'right' && action.hand !== 'left') ||
      typeof action.twoHanded !== 'boolean' ||
      !Number.isFinite(action.cooldown) ||
      action.cooldown <= 0 ||
      !Number.isFinite(action.contactAt) ||
      Math.abs(action.contactAt - contactTimeOf(action.weapon)) > 1e-9 ||
      !Number.isFinite(action.aimYaw) ||
      !Number.isFinite(action.aimPitch) ||
      !Number.isFinite(action.elapsed) ||
      action.elapsed < 0 ||
      action.elapsed >= action.cooldown ||
      typeof action.hitResolved !== 'boolean' ||
      (action.hitResolved && !contactReached(action.elapsed, action.contactAt)) ||
      !vector3(action.origin) ||
      !vector3(action.direction) ||
      !validMeleeWeapon(action.weapon, action.cooldown) ||
      !action.hands ||
      !validUid(action.hands.right) ||
      !validUid(action.hands.left) ||
      !this.validCharge(action)
    ) {
      throw new Error('Invalid player melee action');
    }
  }

  /** A charge holds exactly at the pull before contact; a swing still able to charge has not reached the pull. */
  private validCharge(action: MeleeActionState): boolean {
    const pullEnd = meleePullEnd(action.contactAt);
    if (action.chargeHeldSimSeconds === undefined) {
      return action.weapon.charge === undefined || action.elapsed < pullEnd;
    }
    return (
      action.weapon.charge !== undefined &&
      Number.isFinite(action.chargeHeldSimSeconds) &&
      action.chargeHeldSimSeconds >= 0 &&
      action.elapsed === pullEnd &&
      !action.hitResolved
    );
  }
}
