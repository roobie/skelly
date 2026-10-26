import type { MeleeClassDef } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Needs } from '../core/needs.ts';
import { spendStamina } from '../core/needs.ts';
import { type BeginMeleeSwing, copyMeleeWeapon, type PlayerCombat } from '../core/playerCombat.ts';
import type { ItemDef } from '../core/schema.ts';
import type { MeleeWeapon } from '../core/zombies.ts';

export type MeleeStartResult = 'started' | 'too-tired' | 'busy';

type ContentMeleeWeapon = NonNullable<NonNullable<ItemDef['weapon']>['melee']>;

export const meleeWeaponFromContent = (weapon: ContentMeleeWeapon): MeleeWeapon =>
  copyMeleeWeapon({
    damage: weapon.damage,
    reach: weapon.reach,
    cooldown: weapon.cooldownSimSeconds,
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
    ...(weapon.charge === undefined ? {} : { charge: weapon.charge }),
    type: weapon.type,
    motion: weapon.motion,
  });

/** The bare-handed attack from the required fists class; its absence is a content error, never a code default. */
export const unarmedMeleeWeapon = (meleeClasses: ReadonlyMap<string, MeleeClassDef>): MeleeWeapon => {
  const unarmed = meleeClasses.get(CORE_CONTENT_IDS.fistsMeleeClass)?.unarmed;
  if (unarmed === undefined) {
    throw new Error(`Missing required melee class "${CORE_CONTENT_IDS.fistsMeleeClass}"`);
  }
  return copyMeleeWeapon({
    motion: unarmed.motion,
    damage: unarmed.damage,
    reach: unarmed.reach,
    cooldown: unarmed.cooldownSimSeconds,
    contactFraction: unarmed.contactFraction,
    windupCapSimSeconds: unarmed.windupCapSimSeconds,
    stamina: unarmed.stamina,
    impulse: unarmed.impulse,
  });
};

export interface MeleeReadinessInput {
  rightMouseHeld: boolean;
  meleeWeaponHeld: boolean;
  handsEmpty: boolean;
  debugBuild: boolean;
  inputLocked: boolean;
}

/** En-garde is available for defence regardless of what occupies the player's hands. */
export const shouldEnterMeleeGuard = (input: MeleeReadinessInput): boolean =>
  input.rightMouseHeld && !input.debugBuild && !input.inputLocked;

export const shouldEnterMeleeReady = (input: MeleeReadinessInput): boolean =>
  shouldEnterMeleeGuard(input) && (input.meleeWeaponHeld || input.handsEmpty);

/** An active punch keeps bare hands raised after the player releases en-garde. */
export const emptyHandsPresentationReady = (ready: boolean, action: { profile: string } | undefined): boolean =>
  ready || action?.profile === 'fists';

/** Applies content class defaults and per-weapon overrides once, before the action is saved. */
export const resolveMeleeWeapon = (weapon: MeleeWeapon, defaults: MeleeClassDef): MeleeWeapon => {
  const speedMultiplier = weapon.speedMultiplier ?? defaults.speedMultiplier;
  return {
    ...weapon,
    cooldown: weapon.cooldown / speedMultiplier,
    damageVariance: weapon.damageVariance ?? defaults.damageVariance,
    headDamageMultiplier: weapon.headDamageMultiplier ?? defaults.headDamageMultiplier,
    limbDamageMultiplier: weapon.limbDamageMultiplier ?? defaults.limbDamageMultiplier,
    speedMultiplier,
  };
};

export const resolvePlayerMeleeWeapon = (
  weapon: MeleeWeapon,
  defaults: MeleeClassDef | undefined,
  swingSlowdown: number,
): MeleeWeapon => {
  const resolved = defaults ? resolveMeleeWeapon(weapon, defaults) : weapon;
  return { ...resolved, cooldown: resolved.cooldown * swingSlowdown };
};

/** Refuses without cost when tired/busy; every accepted swing spends stamina, including a miss. */
export const startPlayerMelee = (
  combat: PlayerCombat,
  needs: Pick<Needs, 'stamina' | 'staminaRegenDelayRemainingSimSeconds'>,
  swing: BeginMeleeSwing,
  staminaRegenDelaySimSeconds = 0,
): MeleeStartResult => {
  const cost = swing.weapon.stamina ?? 0;
  if (needs.stamina <= 0 || needs.stamina < cost) {
    return 'too-tired';
  }
  if (!combat.beginMeleeSwing(swing)) {
    return 'busy';
  }
  spendStamina(needs, cost, staminaRegenDelaySimSeconds);
  return 'started';
};
