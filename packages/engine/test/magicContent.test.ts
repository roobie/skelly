import { describe, expect, it } from 'vitest';
import { resolveAbilityCost } from '../src/core/abilities.ts';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import { admitPacks, type PackInput } from '../src/core/packAdmission.ts';
import { FIXTURE_SHOT_LOOK } from './fixtures/shotLook.ts';

const POOL = 'fixture_mana';
const ABILITY = 'fixture_bolt';
const START = 'fixture_start';

const rule = {
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
};
const pool = { id: POOL, name: 'Fixture mana', maximum: 10, recoveryPerGameHour: 2 };
const ability = {
  id: ABILITY,
  name: 'Fixture bolt',
  rule: rule.id,
  targeting: 'aimed',
  preparationSimSeconds: 0.5,
  cost: { pool: POOL, amount: '1.0 + double(abilityLevel)' },
  projectile: FIXTURE_SHOT_LOOK,
  progression: { maximumLevel: 3, practicePerCast: 1, practicePerLevel: 2 },
};
const magic = {
  damageKinds: [{ id: 'fixture_arcane', class: 'non-melee' }],
  rules: [rule],
  pools: [pool],
  abilities: [ability],
};
const start = { id: START, site: 'forest', kit: [], wounds: [], skills: {}, recipes: [] };
const cast = {
  casterId: 'fixture_caster',
  abilityId: ABILITY,
  sourceItemUid: 1,
  hand: 'right' as const,
  abilityLevel: 1,
  origin: { x: 0, y: 0, z: 0 },
  aim: { x: 0, y: 0, z: -1 },
};

const source = (name: string, data: unknown): ContentSource => ({ source: name, data });
const startPatch = (add: object) => ({ patches: [{ section: 'starts', id: START, add }] });
const pack = (id: string, data: unknown, dependencies: string[] = []): PackInput => ({
  source: id,
  manifest: {
    id,
    version: 'fixture',
    tier: 'theme',
    product: false,
    dependencies,
    overrides: [],
    files: [{ path: 'content.json', kind: 'content' }],
  },
  files: [{ source: 'content.json', data }],
});

describe('pool admission', () => {
  it('admits zero passive recovery but refuses a negative recovery rate', () => {
    const resting = buildRegistry([source('pool.json', { pools: [{ ...pool, recoveryPerGameHour: 0 }] })]);
    expect(resting.issues).toEqual([]);
    expect(resting.registry.pools.get(POOL)?.recoveryPerGameHour).toBe(0);
    const draining = buildRegistry([source('pool.json', { pools: [{ ...pool, recoveryPerGameHour: -1 }] })]);
    expect(draining.issues).toContainEqual(expect.objectContaining({ path: 'pools[0].recoveryPerGameHour' }));
  });
});

describe('starts patches', () => {
  it('grant abilities and pools to the start, blaming a broken added row on the patch alone', () => {
    const base = [source('magic.json', magic), source('start.json', { starts: [start] })];
    const granted = buildRegistry([
      ...base,
      source('grant.json', startPatch({ abilities: [{ ability: ABILITY, level: 1 }], pools: [{ pool: POOL }] })),
    ]);
    expect(granted.issues).toEqual([]);
    expect(granted.registry.starts.get(START)).toMatchObject({
      abilities: [{ ability: ABILITY, level: 1 }],
      pools: [{ pool: POOL }],
    });

    const broken = buildRegistry([
      ...base,
      source('grant.json', startPatch({ abilities: [{ ability: 'missing', level: 0 }] })),
    ]);
    expect(broken.issues).toEqual([
      { source: 'grant.json', path: 'patches[0].add.abilities[0].ability', message: expect.any(String) },
    ]);
    expect(broken.registry.starts.get(START)?.abilities).toEqual([]);
  });

  it('refuse a row the start already has and rows repeated within one patch', () => {
    const owned = { ...start, pools: [{ pool: POOL }] };
    const base = [source('magic.json', magic), source('start.json', { starts: [owned] })];
    const repeated = buildRegistry([...base, source('grant.json', startPatch({ pools: [{ pool: POOL }] }))]);
    expect(repeated.issues).toEqual([
      { source: 'grant.json', path: 'patches[0].add.pools[0]', message: expect.stringContaining(`"${POOL}"`) },
    ]);
    expect(repeated.registry.starts.get(START)?.pools).toEqual(owned.pools);
    const twice = buildRegistry([
      ...base,
      source(
        'grant.json',
        startPatch({
          abilities: [
            { ability: ABILITY, level: 0 },
            { ability: ABILITY, level: 1 },
          ],
        }),
      ),
    ]);
    expect(twice.issues).toEqual([expect.objectContaining({ source: 'grant.json', path: 'patches[0].add.abilities' })]);
  });

  it('reach a start, pool or rule in another pack only through a declared dependency', () => {
    const content = pack('fixture.magic', magic);
    const owner = pack('fixture.start', { starts: [start] });
    const grant = pack('fixture.grant', startPatch({ pools: [{ pool: POOL }] }), ['fixture.magic']);
    expect(admitPacks([content, owner, grant]).issues).toContainEqual(
      expect.objectContaining({ source: 'fixture.grant', path: 'dependencies' }),
    );
    grant.manifest.dependencies.push(owner.manifest.id);
    expect(admitPacks([content, owner, grant]).issues).toEqual([]);

    const unreached = pack('fixture.grant', startPatch({ pools: [{ pool: POOL }] }), ['fixture.start']);
    expect(admitPacks([content, owner, unreached]).issues).toContainEqual(
      expect.objectContaining({ source: 'fixture.grant', path: 'dependencies' }),
    );
    const { pools, ...withoutPools } = magic;
    const split = [pack('fixture.pools', { pools }), pack('fixture.magic', withoutPools)];
    expect(admitPacks(split).issues).toContainEqual(
      expect.objectContaining({ source: 'fixture.magic', path: 'dependencies' }),
    );
  });
});

describe('ability admission', () => {
  it.each([
    ['rule', { abilities: [{ ...ability, rule: 'missing' }] }, 'abilities[0].rule'],
    ['pool', { abilities: [{ ...ability, cost: { ...ability.cost, pool: 'missing' } }] }, 'abilities[0].cost.pool'],
    [
      'cost expression',
      { abilities: [{ ...ability, cost: { ...ability.cost, amount: 'true' } }] },
      'abilities[0].cost.amount',
    ],
    [
      'casting item',
      {
        items: [
          {
            id: 'fixture_focus',
            name: 'Fixture focus',
            category: 'misc',
            size: [1, 1],
            weight: 1,
            workInProgress: false,
            casting: { ability: 'missing' },
          },
        ],
      },
      'items[0].casting.ability',
    ],
  ])('attributes an unresolved %s to its own field', (_kind, overrides, path) => {
    const { issues } = buildRegistry([source('magic.json', { ...magic, ...overrides })]);
    expect(issues).toContainEqual(expect.objectContaining({ source: 'magic.json', path }));
  });

  it('resolves a cost over the cast context and refuses one content cannot charge', () => {
    const { registry, issues } = buildRegistry([source('magic.json', magic)]);
    expect(issues).toEqual([]);
    expect(resolveAbilityCost(registry, { ...cast, abilityLevel: 2 })).toBeGreaterThan(
      resolveAbilityCost(registry, cast),
    );
    const negative = buildRegistry([
      source('magic.json', { ...magic, abilities: [{ ...ability, cost: { ...ability.cost, amount: '-1.0' } }] }),
    ]);
    expect(negative.issues).toEqual([]);
    expect(() => resolveAbilityCost(negative.registry, cast)).toThrow(
      expect.objectContaining({ issue: expect.objectContaining({ path: 'abilities[0].cost.amount' }) }),
    );
  });
});
