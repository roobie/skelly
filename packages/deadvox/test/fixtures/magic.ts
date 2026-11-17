import type { ContentSource } from '@skelly/engine/content';
import type { MagicGrants } from '@skelly/engine/internal/core/character.ts';

export const FIXTURE_POOL = 'fixture_magic_pool';
export const FIXTURE_ABILITY = 'fixture_magic_ability';
export const FIXTURE_WAND = 'fixture_magic_wand';
export const FIXTURE_VOLLEY_COUNT = 3;

/**
 * One opt-in pool, one ability that spends from it over a damage kind the base stack already defines, and a source
 * item that casts it. A cast is a volley of several shots, so a case can act between its launches.
 */
export const fixtureMagicSource = (): ContentSource => ({
  source: 'fixture-magic.json',
  data: {
    rules: [
      {
        id: 'fixture_magic_rule',
        trigger: { event: 'cast' },
        effects: [
          {
            verb: 'projectileVolley',
            count: `${FIXTURE_VOLLEY_COUNT}`,
            damage: '1.0',
            intervalSimSeconds: '0.2',
            speedMetresPerSimSecond: '10.0',
            rangeMetres: '12.0',
            damageKind: 'acid',
          },
        ],
      },
    ],
    items: [
      {
        id: FIXTURE_WAND,
        name: 'Fixture wand',
        category: 'misc',
        size: [1, 1],
        weight: 0.1,
        workInProgress: false,
        casting: { ability: FIXTURE_ABILITY },
      },
    ],
    pools: [{ id: FIXTURE_POOL, name: 'Fixture pool', maximum: 10, recoveryPerGameHour: 2 }],
    abilities: [
      {
        id: FIXTURE_ABILITY,
        name: 'Fixture ability',
        rule: 'fixture_magic_rule',
        targeting: 'aimed',
        preparationSimSeconds: 0.5,
        cost: { pool: FIXTURE_POOL, amount: '1.0' },
        projectile: { color: '#ffffff', radiusMetres: 0.05 },
        progression: { maximumLevel: 3, practicePerCast: 1, practicePerLevel: 2 },
      },
    ],
  },
});

export const fixtureMagicGrants = (): MagicGrants => ({
  abilities: [{ ability: FIXTURE_ABILITY, level: 1 }],
  pools: [{ pool: FIXTURE_POOL }],
});
