import { describe, expect, it } from 'vitest';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { blocksAttack, meleeCombatEffects } from '../src/core/meleeCombat.ts';

const tuning = { blockChanceMinimum: 0.1, blockChanceRange: 0.7, blockChanceHalfLifeLevels: 4 } as const;

describe('melee combat blocking', () => {
  it('makes a successful block more likely with skill while legendary matches expert', () => {
    const novice = meleeCombatEffects(0, tuning);
    const expert = meleeCombatEffects(SKILL_LEVEL_MAX, tuning);
    expect(expert.blockChance).toBeGreaterThan(novice.blockChance);
    expect(meleeCombatEffects(SKILL_LEVEL_LEGENDARY, tuning)).toEqual(expert);
    const separatingRoll = (novice.blockChance + expert.blockChance) / 2;
    expect(blocksAttack(0, separatingRoll, tuning)).toBe(false);
    expect(blocksAttack(SKILL_LEVEL_MAX, separatingRoll, tuning)).toBe(true);
  });
});
