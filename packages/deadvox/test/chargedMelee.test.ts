import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { type MeleeTargetResolver, PlayerCombat, type PlayerCombatState } from '../src/core/playerCombat.ts';
import { simSeconds } from '../src/core/time.ts';
import type { MeleeWeapon } from '../src/core/zombies.ts';

const DT = 1 / 60;
const HANDS = { right: 7, left: null };
const AIM = { origin: [0, 1, 0] as Vec3, direction: [0, 0, -1] as Vec3, yaw: 0, pitch: 0 };
const WEAPON: MeleeWeapon = {
  motion: 'swing',
  damage: 10,
  reach: 3,
  cooldown: 0.8,
  stamina: 4,
  impulse: 4,
  type: 'blunt',
  contactFraction: 0.4,
  windupCapSimSeconds: 0.25,
  charge: { fullSimSeconds: simSeconds(1), curveExponent: 1, damageMultiplier: 2, impulseMultiplier: 3, stamina: 6 },
};

const recorder = (payChargeStamina?: (wanted: number) => number) => {
  const strikes: MeleeWeapon[] = [];
  const targets: MeleeTargetResolver = {
    playPlayerMeleeSwing: () => undefined,
    resolvePlayerMelee: (_origin, _direction, weapon) => {
      strikes.push(weapon);
      return true;
    },
  };
  const combat = new PlayerCombat(targets, undefined, payChargeStamina ? { payChargeStamina } : {});
  return { strikes, combat };
};
const swing = (combat: PlayerCombat): void => {
  const started = combat.beginMeleeSwing({
    origin: AIM.origin,
    direction: AIM.direction,
    weapon: WEAPON,
    profile: 'blunt',
    twoHanded: false,
    hands: HANDS,
  });
  if (!started) {
    throw new Error('The fixture swing did not start');
  }
};
const run = (combat: PlayerCombat, seconds: number, held: boolean): void => {
  for (let step = Math.round(seconds / DT); step > 0; step -= 1) {
    combat.tick(DT, HANDS, { held, aim: AIM });
  }
};
const roundTrip = (state: Readonly<PlayerCombatState>): PlayerCombatState => JSON.parse(JSON.stringify(state));

describe('charged melee', () => {
  it('strikes harder after a held charge than after a tap, which keeps the ordinary strike', () => {
    const tap = recorder();
    swing(tap.combat);
    run(tap.combat, 1, false);
    const charged = recorder();
    swing(charged.combat);
    run(charged.combat, 1.5, true);
    run(charged.combat, 1, false);

    expect(tap.strikes).toHaveLength(1);
    expect(tap.strikes[0]!.damage).toBe(WEAPON.damage);
    expect(tap.strikes[0]!.impulse).toBe(WEAPON.impulse);
    expect(charged.strikes).toHaveLength(1);
    expect(charged.strikes[0]!.damage).toBeGreaterThan(WEAPON.damage);
    expect(charged.strikes[0]!.impulse).toBeGreaterThan(WEAPON.impulse!);
  });

  it('caps a release short of stamina at the level it could pay for', () => {
    const paid = recorder((wanted) => wanted / 2);
    swing(paid.combat);
    run(paid.combat, 1.5, true);
    run(paid.combat, 1, false);
    const full = recorder();
    swing(full.combat);
    run(full.combat, 1.5, true);
    run(full.combat, 1, false);

    expect(paid.strikes[0]!.damage).toBeGreaterThan(WEAPON.damage);
    expect(paid.strikes[0]!.damage).toBeLessThan(full.strikes[0]!.damage);
  });

  it.each([
    ['a hit taken', (combat: PlayerCombat) => combat.cancelCharge()],
    ['a held-item swap', (combat: PlayerCombat) => combat.tick(DT, { right: 8, left: null }, { held: true, aim: AIM })],
  ])('drops a held charge without a strike on %s', (_cause, interrupt) => {
    const { strikes, combat } = recorder();
    swing(combat);
    run(combat, 0.5, true);
    expect(combat.activeMeleeAction?.chargeHeldSimSeconds).toBeDefined();
    interrupt(combat);
    run(combat, 2, false);

    expect(strikes).toHaveLength(0);
    expect(combat.activeMeleeAction).toBeUndefined();
  });

  it('restores a save made mid-charge to the same charge, striking once on release', () => {
    const uninterrupted = recorder();
    swing(uninterrupted.combat);
    run(uninterrupted.combat, 1.5, true);
    run(uninterrupted.combat, 1, false);

    const saved = recorder();
    swing(saved.combat);
    run(saved.combat, 0.5, true);
    const state = roundTrip(saved.combat.snapshotState());
    const restored = recorder();
    restored.combat.restoreState(state);
    expect(restored.combat.activeMeleeAction?.chargeHeldSimSeconds).toBe(state.meleeAction?.chargeHeldSimSeconds);
    run(restored.combat, 1, true);
    run(restored.combat, 1, false);

    expect(restored.strikes).toHaveLength(1);
    expect(restored.strikes[0]!.damage).toBeCloseTo(uninterrupted.strikes[0]!.damage, 9);
  });
});
