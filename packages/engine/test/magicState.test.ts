import { describe, expect, it } from 'vitest';
import { Character, type MagicGrants } from '../src/core/character.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import type { Modifier } from '../src/core/modifiers.ts';
import { gameSeconds } from '../src/core/time.ts';

const INTELLECT = 'fixture_intellect';
const POOL = 'fixture_mana';
const ABILITY = 'fixture_bolt';
const progression = { maximumLevel: 3, practicePerCast: 1, practicePerLevel: 2 };

const registry: Registry = (() => {
  const built = buildRegistry([
    {
      source: 'magic.json',
      data: {
        attributes: [{ id: INTELLECT, name: 'Fixture intellect' }],
        damageKinds: [{ id: 'fixture_arcane', class: 'non-melee' }],
        rules: [
          {
            id: 'fixture_rule',
            trigger: { event: 'cast' },
            effects: [
              {
                verb: 'projectileVolley',
                count: '1',
                damage: '1.0',
                intervalSimSeconds: '0.1',
                speedMetresPerSimSecond: '10.0',
                rangeMetres: '10.0',
                damageKind: 'fixture_arcane',
              },
            ],
          },
        ],
        pools: [
          {
            id: POOL,
            name: 'Fixture mana',
            maximum: 10,
            recoveryPerGameHour: 2,
            attributes: { maximum: { [INTELLECT]: { exponent: 1 } } },
          },
        ],
        abilities: [
          {
            id: ABILITY,
            name: 'Fixture bolt',
            rule: 'fixture_rule',
            targeting: 'aimed',
            preparationSimSeconds: 0.5,
            cost: { pool: POOL, amount: '1.0' },
            progression,
          },
        ],
      },
    },
  ]);
  if (built.issues.length > 0) {
    throw new Error(`Magic state fixture did not admit: ${JSON.stringify(built.issues)}`);
  }
  return built.registry;
})();

const grants: MagicGrants = { abilities: [{ ability: ABILITY, level: 0 }], pools: [{ pool: POOL }] };

const granted = (modifiers: readonly Modifier[] = []): Character => {
  const character = new Character(registry, { modifierSource: () => modifiers });
  character.initializeMagic(grants);
  return character;
};

const half = (character: Character): number => character.poolMaximum(POOL)! / 2;

describe('character pools', () => {
  it('fill to a maximum that a higher intellect raises, and are absent from an ordinary character', () => {
    expect(new Character(registry).heldPools()).toEqual([]);
    const average = granted();
    const clever = new Character(registry);
    clever.initializeAttributes({ [INTELLECT]: average.attributes[INTELLECT]! * 2 });
    clever.initializeMagic(grants);
    expect(clever.poolMaximum(POOL)).toBeGreaterThan(average.poolMaximum(POOL)!);
    for (const character of [average, clever]) {
      expect(character.poolAmount(POOL)).toBe(character.poolMaximum(POOL));
    }
  });

  it('refuse a spend the pool cannot cover without changing it', () => {
    const character = granted();
    const full = character.poolAmount(POOL)!;
    const excess = full + 1;
    expect(character.canSpend(POOL, excess)).toBe(false);
    expect(character.spend(POOL, excess)).toBe(false);
    expect(character.poolAmount(POOL)).toBe(full);
    expect(character.spend('fixture_unheld', 0)).toBe(false);
    expect(character.spend(POOL, half(character))).toBe(true);
    expect(character.poolAmount(POOL)).toBe(full - half(character));
  });

  it('recover in closed form: one long span matches many short ones, and stops at the maximum', () => {
    const once = granted();
    const stepped = granted();
    for (const character of [once, stepped]) {
      character.spend(POOL, half(character));
    }
    const span = 600;
    const steps = 7;
    once.recoverPools(gameSeconds(span));
    for (let step = 0; step < steps; step++) {
      stepped.recoverPools(gameSeconds(span / steps));
    }
    expect(once.poolAmount(POOL)).toBeGreaterThan(half(once));
    expect(stepped.poolAmount(POOL)).toBeCloseTo(once.poolAmount(POOL)!, 9);
    once.recoverPools(gameSeconds(Number.MAX_SAFE_INTEGER));
    expect(once.poolAmount(POOL)).toBe(once.poolMaximum(POOL));
  });

  it('drain an excess left by a lost maximum toward the new maximum, not below it', () => {
    const modifiers: Modifier[] = [{ source: 'fixture_focus', effect: 'pool.maximum', multiply: 2 }];
    const character = granted(modifiers);
    const raised = character.poolAmount(POOL)!;
    modifiers.length = 0;
    expect(raised).toBeGreaterThan(character.poolMaximum(POOL)!);
    character.recoverPools(gameSeconds(60));
    expect(character.poolAmount(POOL)).toBeLessThan(raised);
    expect(character.poolAmount(POOL)).toBeGreaterThan(character.poolMaximum(POOL)!);
    character.recoverPools(gameSeconds(Number.MAX_SAFE_INTEGER));
    expect(character.poolAmount(POOL)).toBe(character.poolMaximum(POOL));
  });
});

describe('ability practice', () => {
  it('levels at each threshold and stops learning at the ability cap', () => {
    const character = granted();
    const castsPerLevel = Math.ceil(progression.practicePerLevel / progression.practicePerCast);
    for (let level = 0; level < progression.maximumLevel; level++) {
      for (let cast = 1; cast < castsPerLevel; cast++) {
        character.awardAbilityPractice(ABILITY);
      }
      expect(character.abilityLevel(ABILITY)).toBe(level);
      character.awardAbilityPractice(ABILITY);
      expect(character.abilityLevel(ABILITY)).toBe(level + 1);
    }
    character.awardAbilityPractice(ABILITY);
    expect(character.snapshotState().abilities[ABILITY]).toEqual({ level: progression.maximumLevel, practice: 0 });
  });
});
