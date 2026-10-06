import { describe, expect, it } from 'vitest';
import { SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { craftingActivityTier } from '../src/core/skillTraining.ts';

describe('activity skill tiers', () => {
  it('caps crafting practice at the recipe requirement plus its configured offset', () => {
    const required = 4;
    const offset = 2;
    expect(craftingActivityTier(required, offset) - required).toBe(offset);
    expect(craftingActivityTier(SKILL_LEVEL_MAX, offset)).toBe(SKILL_LEVEL_MAX);
  });
});
