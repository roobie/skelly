import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/content.ts';
import {
  ATTRIBUTE_AVERAGE,
  ATTRIBUTE_FLOOR,
  type AttributeFeeds,
  attributeValue,
  type ContestCurve,
  contestFactor,
  DIRECTED_EFFECTS,
  type DirectedEffect,
  type EffectActor,
  effectDirection,
  modified,
  resolve,
} from '../src/core/modifiers.ts';
import { attributeFeeds } from '../src/core/schema/attributes.ts';
import { SKILL_LEVEL_MAX } from '../src/core/skillLevels.ts';

const RATIOS = [0.01, 0.25, 0.5, 0.75, 1, 1.5, 4, 100];
const VALUES = [ATTRIBUTE_FLOOR, 50, ATTRIBUTE_AVERAGE, 150, 400];
const authorable = (effect: DirectedEffect, feeds: AttributeFeeds): boolean =>
  safeParse(attributeFeeds(effect), feeds).success;
const strong = (strength: number): EffectActor => ({ attributes: { strength } });

describe('attributes on the resolver', () => {
  it('content cannot author an exponent or contest that turns an attribute against its effect', () => {
    for (const effect of DIRECTED_EFFECTS) {
      const lower = effectDirection(effect) === 'lower';
      const falling: ContestCurve = [
        { ratio: 0.5, factor: lower ? 0 : 1 },
        { ratio: 1, factor: lower ? 1 : 0 },
      ];
      expect(authorable(effect, { strength: { exponent: lower ? 1 : -1 } }), effect).toBe(false);
      expect(authorable(effect, { strength: { contest: falling } }), effect).toBe(false);
    }
  });

  it('a higher attribute never makes an effect worse, for either shape content can author', () => {
    for (const effect of DIRECTED_EFFECTS) {
      const lower = effectDirection(effect) === 'lower';
      const shapes: AttributeFeeds[] = [
        { strength: { exponent: lower ? -1.5 : 1.5 } },
        { strength: { exponent: 0 } },
        {
          strength: {
            contest: [
              { ratio: 0.5, factor: lower ? 2 : 0 },
              { ratio: 1, factor: 1 },
              { ratio: 2, factor: lower ? 0.5 : 2 },
            ],
          },
        },
      ];
      for (const attributes of shapes.filter((shape) => authorable(effect, shape))) {
        const values = VALUES.map((value) =>
          modified(effect, 0.5, strong(value), { attributes, difficulty: ATTRIBUTE_AVERAGE }),
        );
        const worse = values.filter((value, index) => {
          const previous = values[index - 1];
          return previous !== undefined && (lower ? value > previous : value < previous);
        });
        expect(worse, effect).toEqual([]);
      }
    }
  });

  it('an average attribute leaves the content base, and a rate scales as the attribute ratio to its exponent', () => {
    const attributes = { strength: { exponent: 2 } };
    expect(modified('melee.impulse', 3, strong(ATTRIBUTE_AVERAGE), { attributes })).toBe(3);
    expect(modified('melee.impulse', 3, {}, { attributes })).toBe(3);
    expect(modified('melee.impulse', 3, strong(2 * ATTRIBUTE_AVERAGE), { attributes })).toBeCloseTo(3 * 2 ** 2);
  });

  it('a contest interpolates between its points and holds its end factors past them', () => {
    const curve: ContestCurve = [
      { ratio: 0.5, factor: 0 },
      { ratio: 1, factor: 1 },
    ];
    expect(contestFactor(curve, 0.75)).toBeCloseTo(0.5);
    expect(contestFactor(curve, 0.01)).toBe(0);
    expect(contestFactor(curve, 100)).toBe(1);
    const factors = RATIOS.map((ratio) => contestFactor(curve, ratio));
    expect(factors.every((factor, index) => index === 0 || factor >= factors[index - 1]!)).toBe(true);
  });

  it('a contest compares the attribute with the difficulty, and refuses to guess one', () => {
    const attributes: AttributeFeeds = {
      strength: {
        contest: [
          { ratio: 0.5, factor: 0 },
          { ratio: 1, factor: 1 },
        ],
      },
    };
    const share = (strength: number, difficulty: number) =>
      modified('furniture.liftShare', 1, strong(strength), { attributes, difficulty });
    expect(share(200, 200)).toBe(1);
    expect(share(100, 200)).toBe(0);
    expect(share(200, 100)).toBe(1);
    expect(() => modified('furniture.liftShare', 1, strong(100), { attributes })).toThrow();
  });

  it('an attribute modifier acts as the same innate value would, and never takes it below the floor', () => {
    const attributes = { strength: { exponent: 1 } };
    const ring = { attribute: 'strength', multiply: 2, source: 'fixture' } as const;
    expect(modified('melee.impulse', 1, { modifiers: [ring] }, { attributes })).toBe(
      modified('melee.impulse', 1, strong(2 * ATTRIBUTE_AVERAGE), { attributes }),
    );
    const curse = { attribute: 'strength', add: -10 * ATTRIBUTE_AVERAGE, source: 'fixture' } as const;
    expect(attributeValue({ modifiers: [curse] }, 'strength')).toBe(ATTRIBUTE_FLOOR);
  });

  it('resolves attributes, then skills, then modifiers, and records each source in that order', () => {
    const actor: EffectActor = {
      attributes: { dexterity: 2 * ATTRIBUTE_AVERAGE },
      skillLevel: () => SKILL_LEVEL_MAX,
      modifiers: [{ effect: 'inventory.handlingSimSeconds', multiply: 0.5, add: 1, source: 'fixture gloves' }],
      trace: new Map(),
    };
    const feeds = {
      attributes: { dexterity: { exponent: -1 } },
      skills: { firearmsCombat: { expert: 0.5, halfLifeLevels: 1 } },
    };
    const { value, steps } = resolve('inventory.handlingSimSeconds', 8, actor, feeds);
    expect(steps.map(({ stage, source }) => [stage, source])).toEqual([
      ['attribute', 'dexterity'],
      ['skill', 'firearmsCombat'],
      ['modifier', 'fixture gloves'],
    ]);
    const [attribute, skill] = steps;
    expect(value).toBeCloseTo(8 * attribute!.multiply * skill!.multiply * 0.5 + 1);
    expect(actor.trace?.get('inventory.handlingSimSeconds')?.value).toBe(value);
  });

  it('a time effect stays finite however far modifiers push its attribute down, held at the floor', () => {
    const attributes = { dexterity: { exponent: -1 } };
    const crushed = { attribute: 'dexterity', multiply: 0, add: -1e9, source: 'fixture' } as const;
    const value = modified('inventory.handlingSimSeconds', 1, { modifiers: [crushed] }, { attributes });
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBe(
      modified('inventory.handlingSimSeconds', 1, { attributes: { dexterity: ATTRIBUTE_FLOOR } }, { attributes }),
    );
  });
});

describe('attribute names in content', () => {
  const misspelled = (attributes: readonly object[]) =>
    buildRegistry([
      {
        source: 'fixture.json',
        data: {
          attributes,
          items: [
            {
              id: 'fixture_ring',
              name: 'Fixture ring',
              category: 'misc',
              size: [1, 1],
              weight: 1,
              workInProgress: false,
              modifiers: [{ attribute: 'strenght', add: 1, while: 'worn' }],
            },
          ],
        },
      },
    ]).issues.map(({ message }) => message);

  it('reports a modifier naming an attribute the stack does not define', () => {
    expect(misspelled([{ id: 'strength', name: 'Strength' }])).toEqual(['no attribute "strenght"']);
  });

  it('leaves attribute names unchecked in a stack without attributes, where every attribute reads as average', () => {
    expect(misspelled([])).toEqual([]);
  });
});
