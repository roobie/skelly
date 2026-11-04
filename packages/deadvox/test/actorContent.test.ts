import { expect, it } from 'vitest';
import { actorFigure } from '../src/core/actorFigure.ts';
import { claimed } from '../src/core/capabilities.ts';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { footstepSoundId } from '../src/core/footsteps.ts';
import type { ActorDef } from '../src/core/schema.ts';
import { settlementActorSpawns, settlementHordeSpawn } from '../src/core/settlementSpawns.ts';
import { FIXTURE_BLOW_SOUND, fixtureSounds } from './economyFixtures.ts';
import { fixtureScenarioSources } from './fixtures/scenario.ts';

// The small scenario stack, not the bundled content: these rules need only actor admission, and a build
// of the bundled content runs every reference and spatial check over every bundled site.
const stackActors = (): ActorDef[] => (fixtureScenarioSources()[0]!.data as { actors: ActorDef[] }).actors;
const stackActor = (role: 'settlementHorde' | 'settlementWanderer'): ActorDef =>
  claimed(new Map(stackActors().map((actor) => [actor.id, actor])), role)!;

it('admits an independent actor id selecting an existing body plan', () => {
  const source = stackActors().find((type) => type.figureSeeds?.length)!;
  const actor = {
    ...source,
    id: 'fixture_independent_actor',
    model: 'humanoid',
    capability: undefined,
    authoredOnly: true,
  };
  const { registry, issues } = buildRegistry([
    ...fixtureScenarioSources(),
    { source: 'fixture-actor', data: { actors: [actor] } },
  ]);
  expect(issues).toEqual([]);
  const admitted = registry.actors.get(actor.id)!;
  expect(admitted).toBeDefined();
  expect(actorFigure(admitted, admitted.figureSeeds![0]!).realized.body.bones.length).toBeGreaterThan(0);
});

it.each(['slim-humanoid', 'legless-humanoid', 'broad-humanoid'] as const)(
  'admits a %s figure as a property of humanoid anatomy',
  (figure) => {
    const source = stackActor('settlementHorde');
    const actor = {
      ...source,
      id: 'fixture_humanoid_variant',
      capability: undefined,
      model: 'humanoid',
      figure,
      figureSeeds: [1],
    };
    const { registry, issues } = buildRegistry([
      ...fixtureScenarioSources(),
      { source: 'fixture-variant', data: { actors: [actor] } },
    ]);
    expect(issues).toEqual([]);
    const admitted = registry.actors.get(actor.id)!;
    expect(admitted.model).toBe('humanoid');
    expect(actorFigure(admitted, 1).genome.template).toBe(figure);
    const invalid = validateContent({
      source: 'fixture-invalid-plan',
      data: { actors: [{ ...actor, model: figure }] },
    });
    expect(
      invalid.some(({ source: origin, path }) => origin === 'fixture-invalid-plan' && path === 'actors[0].model'),
    ).toBe(true);
  },
);

it('rejects a figure property whose anatomy differs from the selected body plan', () => {
  const source = stackActor('settlementHorde');
  const { issues } = buildRegistry([
    ...fixtureScenarioSources(),
    {
      source: 'fixture-anatomy',
      data: { actors: [{ ...source, id: 'fixture_wrong_anatomy', capability: undefined, figure: 'fused-mass' }] },
    },
  ]);
  expect(issues.some(({ source: origin, path }) => origin === 'fixture-anatomy' && path === 'actors[0].figure')).toBe(
    true,
  );
});

it('uses independently named providers for horde and wanderer settlement roles', () => {
  const template = stackActor('settlementHorde');
  const horde = { ...template, id: 'fixture_horde_actor', capability: ['settlementHorde'] };
  const wanderer = { ...template, id: 'fixture_wanderer_actor', capability: ['settlementWanderer'] };
  const { registry, issues } = buildRegistry([
    ...fixtureScenarioSources(),
    {
      source: 'fixture-roles',
      data: {
        actors: [{ ...template, capability: undefined }, horde, wanderer],
      },
    },
  ]);
  expect(issues).toEqual([]);
  const road = { x0: 0, x1: 10, z0: 0, z1: 4 };
  expect(settlementHordeSpawn(registry, 1, road, { roadHeightAt: () => 0, id: 'fixture_horde' }).type).toBe(horde.id);
  const spawns = settlementActorSpawns(registry, 1, road, { markers: [], roadHeightAt: () => 0 });
  expect(spawns.length).toBeGreaterThan(0);
  expect(spawns.every(({ type }) => type === wanderer.id)).toBe(true);
});

it.each(['settlementHorde', 'settlementWanderer'] as const)(
  'refuses a population request with no %s provider',
  (role) => {
    const provider = stackActor(role);
    const capability = provider.capability!.filter((claim) => claim !== role);
    const { issues } = buildRegistry([
      ...fixtureScenarioSources(),
      { source: 'fixture-missing-role', data: { actors: [{ ...provider, capability }] } },
    ]);
    expect(issues.some(({ path, message }) => path.includes('population.') && message.includes(`"${role}"`))).toBe(
      true,
    );
  },
);

it('refuses competing actor role claims instead of choosing a spawn by load order', () => {
  const provider = stackActor('settlementHorde');
  const { issues } = buildRegistry([
    ...fixtureScenarioSources(),
    { source: 'fixture-competing-role', data: { actors: [{ ...provider, id: 'fixture_competitor' }] } },
  ]);
  expect(issues.some(({ message }) => message.includes('competing claimants for capability "settlementHorde"'))).toBe(
    true,
  );
});

it('refuses a block that authors footsteps with no row for a family a loaded actor walks with', () => {
  const family = 'fixture_steps';
  const sources = fixtureScenarioSources();
  const { actors, blocks } = sources[0]!.data as { actors: object[]; blocks: { footsteps?: object }[] };
  // The stack's own solid block authors no footsteps, so it needs no row; the unused family needs none either.
  expect(blocks.some(({ footsteps }) => footsteps)).toBe(false);
  const fixtureBlock = {
    ...blocks[0]!,
    id: 'fixture_moss',
    name: 'Fixture moss',
    footsteps: { player: FIXTURE_BLOW_SOUND },
  };
  const build = (footstepSounds: unknown[]) =>
    buildRegistry([
      ...sources,
      {
        source: 'fixture-block-mod',
        data: {
          soundFamilies: [{ id: 'player' }, { id: family }, { id: 'fixture_unused_family' }],
          sounds: fixtureSounds(),
          actors: [{ ...actors[0]!, footstepSound: family }],
          blocks: [fixtureBlock],
          footstepSounds,
        },
      },
    ]).issues;

  const row = {
    id: footstepSoundId(family, fixtureBlock.id),
    family,
    block: fixtureBlock.id,
    sound: FIXTURE_BLOW_SOUND,
  };
  expect(build([])).toEqual([
    {
      source: 'fixture-block-mod',
      path: 'blocks[0].footsteps',
      message: `no footstep row for family "${family}" on block "${fixtureBlock.id}"`,
    },
  ]);
  expect(build([row])).toEqual([]);
});

it('rejects an actor selecting an undeclared footstep family', () => {
  const source = stackActor('settlementWanderer');
  const { issues } = buildRegistry([
    ...fixtureScenarioSources(),
    {
      source: 'fixture-missing-family',
      data: {
        actors: [{ ...source, id: 'fixture_no_family', capability: undefined, footstepSound: 'fixture_absent_family' }],
      },
    },
  ]);
  expect(
    issues.some(
      ({ source: origin, path }) => origin === 'fixture-missing-family' && path === 'actors[0].footstepSound',
    ),
  ).toBe(true);
});
