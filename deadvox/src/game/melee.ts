import type { MeleeClassDef } from '../core/content.ts';
import type { Needs } from '../core/needs.ts';
import { spendStamina } from '../core/needs.ts';
import type { BeginMeleeSwing, PlayerCombat } from '../core/playerCombat.ts';
import type { MeleeWeapon } from '../core/zombies.ts';

export type MeleeStartResult = 'started' | 'too-tired' | 'busy';

export const shouldEnterMeleeReady = (input: {
  rightMouseHeld: boolean;
  meleeWeaponHeld: boolean;
  handsEmpty: boolean;
  debugBuild: boolean;
  inputLocked: boolean;
}): boolean =>
  input.rightMouseHeld && (input.meleeWeaponHeld || input.handsEmpty) && !input.debugBuild && !input.inputLocked;

export const shouldBlockFromEnGarde = (enGarde: boolean, backingOff: boolean): boolean => enGarde && backingOff;

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
