import { describe, expect, it } from 'vitest';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { blockJolt, type MeleeCombatTuning, meleeBlock, meleeCombatEffects } from '../src/core/meleeCombat.ts';

const tuning: MeleeCombatTuning = {
  blockChanceMinimum: 0.1,
  blockChanceRange: 0.7,
  blockChanceHalfLifeLevels: 4,
  mitigationMinimum: 0.2,
  mitigationRange: 0.6,
  mitigationHalfLifeLevels: 3,
  staminaPerAbsorbedPoint: 2,
  staminaCostFloor: 0.3,
  staminaCostHalfLifeLevels: 3,
  joltPerAbsorbedPoint: 0.1,
  joltRealSeconds: 0.08,
  deflectRiseMetres: 0.04,
  deflectRealSeconds: 0.25,
};
const WINDED_BELOW = 10;
const FRESH = 100;
/** A roll above every full-block chance, so the block stays partial. */
const PARTIAL_ROLL = 0.999;

const block = (level: number, damage: number, roll: number, stamina = FRESH) =>
  meleeBlock({ level, damage, roll, stamina, windedBelow: WINDED_BELOW }, tuning);

describe('melee combat blocking', () => {
  it('absorbs more of a blow for less stamina per point as skill rises, legendary matching expert', () => {
    const novice = block(0, 10, PARTIAL_ROLL);
    const expert = block(SKILL_LEVEL_MAX, 10, PARTIAL_ROLL);
    expect(novice.absorbed).toBeGreaterThan(0);
    expect(expert.absorbed).toBeGreaterThan(novice.absorbed);
    expect(expert.absorbed).toBeLessThan(10);
    expect(expert.staminaCost / expert.absorbed).toBeLessThan(novice.staminaCost / novice.absorbed);
    expect(meleeCombatEffects(SKILL_LEVEL_LEGENDARY, tuning)).toEqual(meleeCombatEffects(SKILL_LEVEL_MAX, tuning));
  });

  it('upgrades a block to a full block on a roll under the skill’s full-block chance', () => {
    const novice = meleeCombatEffects(0, tuning);
    const expert = meleeCombatEffects(SKILL_LEVEL_MAX, tuning);
    const separatingRoll = (novice.blockChance + expert.blockChance) / 2;
    expect(block(0, 10, separatingRoll).full).toBe(false);
    expect(block(SKILL_LEVEL_MAX, 10, separatingRoll)).toMatchObject({
      full: true,
      absorbed: 10,
    });
  });

  it('absorbs nothing while winded, even on a certain full block', () => {
    expect(block(SKILL_LEVEL_MAX, 10, 0, WINDED_BELOW - 1)).toEqual({
      absorbed: 0,
      staminaCost: 0,
      full: false,
    });
  });

  it('absorbs only what the stamina left can pay for, and then is not a full block', () => {
    const stamina = WINDED_BELOW + 1;
    const capped = block(0, 1000, 0, stamina);
    expect(capped.full).toBe(false);
    expect(capped.absorbed).toBeLessThan(1000);
    expect(capped.staminaCost).toBeCloseTo(stamina);
  });

  it('jolts harder for a bigger absorbed blow, never past full strength', () => {
    expect(blockJolt(4, tuning).strength).toBeGreaterThan(blockJolt(2, tuning).strength);
    expect(blockJolt(1e6, tuning).strength).toBe(1);
  });
});
