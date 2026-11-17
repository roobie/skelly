import type { ContentSource } from '@skelly/engine/content';
import type { MagicGrants } from '@skelly/engine/internal/core/character.ts';

export const FIXTURE_POOL = 'fixture_magic_pool';
export const FIXTURE_ABILITY = 'fixture_magic_ability';

/** One opt-in pool and one ability that spends from it, over a damage kind the base stack already defines. */
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
            count: '1',
            damage: '1.0',
            intervalSimSeconds: '0.1',
            speedMetresPerSimSecond: '10.0',
            rangeMetres: '10.0',
            damageKind: 'acid',
          },
        ],
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
        progression: { maximumLevel: 3, practicePerCast: 1, practicePerLevel: 2 },
      },
    ],
  },
});

export const fixtureMagicGrants = (): MagicGrants => ({
  abilities: [{ ability: FIXTURE_ABILITY, level: 1 }],
  pools: [{ pool: FIXTURE_POOL }],
});
