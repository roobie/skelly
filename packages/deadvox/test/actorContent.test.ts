import { buildRegistry, type ContentSource } from '@skelly/engine/content';
import { type ActorModel, FIGURE_VARIANTS } from '@skelly/engine/internal/core/actorModels.ts';
import { validateContent } from '@skelly/engine/internal/core/content.ts';
import { footstepSoundId } from '@skelly/engine/internal/core/footsteps.ts';
import { settlementActorSpawns, settlementHordeSpawn } from '@skelly/engine/internal/core/settlementSpawns.ts';
import { figureVariantOf } from '@skelly/engine/pose';
import { expect, it } from 'vitest';
import { FIXTURE_BLOW_SOUND, fixtureSounds } from './economyFixtures.ts';
import { fixtureActorFigures } from './fixtures/actorFigures.ts';
import { fixtureScenarioSources } from './fixtures/scenario.ts';

type FixtureActor = {
  id: string;
  capability?: string[] | undefined;
  model?: string | undefined;
  figureSeeds?: number[] | undefined;
} & Record<string, unknown>;

/** The settlement actor the fixture stack carries. A case copies it, or edits its claims in its own built sources. */
const fixtureActorOf = (sources: readonly ContentSource[]): FixtureActor =>
  (sources[0]!.data as { actors: FixtureActor[] }).actors[0]!;

it('admits a figure variant as a property of humanoid anatomy, not as a body plan', () => {
  const figure = (Object.keys(FIGURE_VARIANTS) as ActorModel[]).find(
    (variant) => variant !== 'humanoid' && FIGURE_VARIANTS[variant].bodyPlan === 'humanoid',
  )!;
  const sources = fixtureScenarioSources();
  const source = fixtureActorOf(sources);
  const actor = {
    ...source,
    id: 'fixture_humanoid_variant',
    capability: undefined,
    model: 'humanoid',
    figure,
    figureSeeds: [1],
  };
  const { registry, issues } = buildRegistry([
    ...sources,
    { source: 'fixture-variant', data: { actors: [actor], actorFigures: fixtureActorFigures(actor) } },
  ]);
  expect(issues).toEqual([]);
  const admitted = registry.actors.get(actor.id)!;
  expect(admitted.model).toBe('humanoid');
  expect(figureVariantOf(admitted)).toBe(figure);
  const invalid = validateContent({
    source: 'fixture-invalid-plan',
    data: { actors: [{ ...actor, model: figure }] },
  });
  expect(
    invalid.some(({ source: origin, path }) => origin === 'fixture-invalid-plan' && path === 'actors[0].model'),
  ).toBe(true);
});

it('rejects a figure property whose anatomy differs from the selected body plan', () => {
  const sources = fixtureScenarioSources();
  const source = fixtureActorOf(sources);
  const { issues } = buildRegistry([
    ...sources,
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
  // The fixture's settlement actor claims both roles, so this case drops that claim from its copy and names two providers.
  const sources = fixtureScenarioSources();
  fixtureActorOf(sources).capability = undefined;
  const template = fixtureActorOf(sources);
  const horde = { ...template, id: 'fixture_horde_actor', capability: ['settlementHorde'] };
  const wanderer = { ...template, id: 'fixture_wanderer_actor', capability: ['settlementWanderer'] };
  const { registry, issues } = buildRegistry([
    ...sources,
    {
      source: 'fixture-roles',
      data: {
        actors: [horde, wanderer],
        actorFigures: fixtureActorFigures(horde, wanderer),
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
    const sources = fixtureScenarioSources();
    const provider = fixtureActorOf(sources);
    provider.capability = provider.capability!.filter((claim) => claim !== role);
    const { issues } = buildRegistry(sources);
    expect(issues.some(({ path, message }) => path.includes('population.') && message.includes(`"${role}"`))).toBe(
      true,
    );
  },
);

it('refuses competing actor role claims instead of choosing a spawn by load order', () => {
  const sources = fixtureScenarioSources();
  const provider = fixtureActorOf(sources);
  const { issues } = buildRegistry([
    ...sources,
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
  const sources = fixtureScenarioSources();
  const source = fixtureActorOf(sources);
  const { issues } = buildRegistry([
    ...sources,
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
