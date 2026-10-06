import type { BeginMeleeSwing, PlayerCombat } from '../core/playerCombat.ts';

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

/** Refuses without cost when tired/busy; every accepted swing spends stamina, including a miss. */
export const startPlayerMelee = (
  combat: PlayerCombat,
  needs: { stamina: number },
  swing: BeginMeleeSwing,
): MeleeStartResult => {
  const cost = swing.weapon.stamina ?? 0;
  if (needs.stamina < cost) {
    return 'too-tired';
  }
  if (!combat.beginMeleeSwing(swing)) {
    return 'busy';
  }
  needs.stamina = Math.max(0, needs.stamina - cost);
  return 'started';
};
