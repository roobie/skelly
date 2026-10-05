import { DEFAULT_HANDED_CHARACTER, dominantSide, type HandedCharacter } from './character.ts';
import type { Vec3 } from './coords.ts';
import {
  type MeleeActionPose,
  type MeleeHand,
  type MeleeProfile,
  meleeContactTime,
  meleePoseAndContact,
} from './meleePose.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { MeleeWeapon } from './zombies.ts';

export interface MeleeActionState extends MeleeActionPose {
  elapsed: number;
  hands: { right: number | null; left: number | null };
  weapon: MeleeWeapon;
}

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

export interface PlayerCombatState {
  playerAttackWait: number;
  meleeAction: MeleeActionState | null;
  nextFistHand: MeleeHand;
}

export interface MeleeTargetResolver {
  playPlayerMeleeSwing: (origin: Vec3) => void;
  resolvePlayerMelee: (origin: Vec3, direction: Vec3, weapon: MeleeWeapon, isFist: boolean) => boolean;
}

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
};
const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

export class PlayerCombat {
  private playerAttackWait = 0;
  private meleeAction: MeleeActionState | null = null;
  private readonly character: HandedCharacter;
  private nextFistHand: MeleeHand;
  private readonly targets: MeleeTargetResolver;
  private readonly onWeaponHit: (uid: number) => void;

  constructor(
    targets: MeleeTargetResolver,
    onWeaponHit: (uid: number) => void = () => undefined,
    character: HandedCharacter = DEFAULT_HANDED_CHARACTER,
  ) {
    this.character = character;
    this.nextFistHand = dominantSide(character);
    this.targets = targets;
    this.onWeaponHit = onWeaponHit;
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
    if (hit && weaponUid !== null) {
      this.onWeaponHit(weaponUid);
    }
  }

  tick(dt: number, hands: { right: number | null; left: number | null }): void {
    if (dt <= 0) {
      return;
    }
    this.playerAttackWait = Math.max(0, this.playerAttackWait - dt);
    const action = this.meleeAction;
    if (!action) {
      return;
    }
    if (hands.right !== action.hands.right || hands.left !== action.hands.left) {
      this.meleeAction = null;
      return;
    }
    const elapsed = Math.min(action.cooldown, action.elapsed + dt);
    if (!action.hitResolved && elapsed + 1e-9 >= action.contactAt) {
      this.resolveContact(action);
      action.hitResolved = true;
    }
    if (elapsed >= action.cooldown) {
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
      contactAt: meleeContactTime(weapon.cooldown),
      aimYaw: start.aimYaw ?? Math.atan2(-direction[0], -direction[2]),
      aimPitch: start.aimPitch ?? Math.asin(Math.max(-1, Math.min(1, direction[1]))),
      elapsed: 0,
      hitResolved: false,
      origin: copy(start.origin),
      direction,
      hands: { ...start.hands },
      weapon: { ...weapon },
    };
    this.targets.playPlayerMeleeSwing(copy(start.origin));
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
      !['blunt', 'cut', 'pierce', 'fists'].includes(action.profile) ||
      (action.hand !== 'right' && action.hand !== 'left') ||
      typeof action.twoHanded !== 'boolean' ||
      !Number.isFinite(action.cooldown) ||
      action.cooldown <= 0 ||
      !Number.isFinite(action.contactAt) ||
      Math.abs(action.contactAt - meleeContactTime(action.cooldown)) > 1e-9 ||
      !Number.isFinite(action.aimYaw) ||
      !Number.isFinite(action.aimPitch) ||
      !Number.isFinite(action.elapsed) ||
      action.elapsed < 0 ||
      action.elapsed >= action.cooldown ||
      typeof action.hitResolved !== 'boolean' ||
      (action.hitResolved && action.elapsed < action.contactAt) ||
      !vector3(action.origin) ||
      !vector3(action.direction) ||
      !Number.isFinite(action.weapon.damage) ||
      action.weapon.damage <= 0 ||
      !Number.isFinite(action.weapon.reach) ||
      action.weapon.reach <= 0 ||
      action.weapon.cooldown !== action.cooldown ||
      (action.weapon.stamina !== undefined && (!Number.isFinite(action.weapon.stamina) || action.weapon.stamina < 0)) ||
      (action.weapon.impulse !== undefined && (!Number.isFinite(action.weapon.impulse) || action.weapon.impulse < 0)) ||
      (action.weapon.type !== undefined && !['blunt', 'cut', 'pierce'].includes(action.weapon.type)) ||
      !action.hands ||
      !validUid(action.hands.right) ||
      !validUid(action.hands.left)
    ) {
      throw new Error('Invalid player melee action');
    }
  }
}
