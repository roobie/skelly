import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  DIRECTED_EFFECTS,
  type DirectedEffect,
  type EffectFeeds,
  effectBounds,
  effectDirection,
  modified,
  type SkillCurve,
  type SkilledActor,
  type SkillFeeds,
} from '../src/core/modifiers.ts';
import { skillFeeds } from '../src/core/schema/skillFeeds.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX } from '../src/core/skillLevels.ts';

const CURVES: readonly SkillCurve[] = [0, 0.05, 0.5, 1, 1.5, 4, 40].flatMap((expert) =>
  [0.1, 1, 4, 30].map((halfLifeLevels) => ({ expert, halfLifeLevels })),
);
const BASES = [0.2, 1, 25];
const LEVELS = Array.from({ length: SKILL_LEVEL_LEGENDARY + 1 }, (_, level) => level);

const at = (levels: Readonly<Record<string, number>>): SkilledActor => ({
  skillLevel: (role) => levels[role] ?? 0,
});
const authorable = (effect: DirectedEffect, feeds: SkillFeeds): boolean => safeParse(skillFeeds(effect), feeds).success;
const notWorse = (effect: DirectedEffect, next: number, previous: number): boolean =>
  effectDirection(effect) === 'lower' ? next <= previous : next >= previous;

/** The levels at which raising the first feeding skill made the effect worse, with the second held at `other`. */
const worseningLevels = (effect: DirectedEffect, base: number, other: number, feeds: EffectFeeds): number[] => {
  const values = LEVELS.map((level) =>
    modified(effect, base, at({ firearmsCombat: level, meleeCombat: other }), feeds),
  );
  return LEVELS.slice(1).filter((level) => !notWorse(effect, values[level]!, values[level - 1]!));
};

describe('skill curves on the resolver', () => {
  it('content cannot author a curve that turns practice against its effect', () => {
    for (const effect of DIRECTED_EFFECTS) {
      const worsening = { expert: effectDirection(effect) === 'lower' ? 2 : 0.5, halfLifeLevels: 4 };
      expect(authorable(effect, { firearmsCombat: worsening }), effect).toBe(false);
    }
  });

  it('more skill never makes an effect worse, for every curve content can author and with two skills feeding', () => {
    for (const effect of DIRECTED_EFFECTS) {
      const pairs = CURVES.map((curve, index) => ({
        firearmsCombat: curve,
        meleeCombat: CURVES[(index * 7 + 3) % CURVES.length]!,
      })).filter((feeds) => authorable(effect, feeds));
      expect(pairs.length, effect).toBeGreaterThan(1);
      const worsenings = pairs.flatMap((feeds) =>
        BASES.flatMap((base) =>
          [0, SKILL_LEVEL_MAX].flatMap((other) => worseningLevels(effect, base, other, { skills: feeds })),
        ),
      );
      expect(worsenings, effect).toEqual([]);
    }
  });

  it('skill zero keeps the content base, and legendary skill matches the top ordinary level', () => {
    for (const effect of DIRECTED_EFFECTS) {
      for (const curve of CURVES.filter((candidate) => authorable(effect, { firearmsCombat: candidate }))) {
        const feeds = { skills: { firearmsCombat: curve } };
        const [min, max] = effectBounds(effect);
        expect(modified(effect, 0.2, at({}), feeds)).toBe(Math.min(max, Math.max(min, 0.2)));
        expect(modified(effect, 0.2, at({ firearmsCombat: SKILL_LEVEL_LEGENDARY }), feeds)).toBe(
          modified(effect, 0.2, at({ firearmsCombat: SKILL_LEVEL_MAX }), feeds),
        );
      }
    }
  });

  it('each effect keeps its bound whatever skills and modifiers push it toward', () => {
    for (const effect of DIRECTED_EFFECTS) {
      const [min, max] = effectBounds(effect);
      for (const modifier of [
        { multiply: 1e6, add: 1e6 },
        { multiply: -1e6, add: -1e6 },
        { multiply: 0, add: 0 },
      ]) {
        const value = modified(
          effect,
          1,
          { modifiers: [{ effect, source: 'fixture', ...modifier }], skillLevel: () => SKILL_LEVEL_MAX },
          { skills: { firearmsCombat: { expert: 40, halfLifeLevels: 1 } } },
        );
        expect(value, effect).toBeGreaterThanOrEqual(min);
        expect(value, effect).toBeLessThanOrEqual(max);
      }
    }
  });
});
