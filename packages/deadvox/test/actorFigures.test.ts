import { readFileSync } from 'node:fs';
import { actorFigure, actorFigureFileIssues, actorFigureKey } from '@skelly/engine/content';
import { actorFigureIssues, validateContent } from '@skelly/engine/internal/core/content.ts';
import type { ActorFigureDef } from '@skelly/engine/internal/core/schema.ts';
import { FUSED_MASS_FIGURE_SEED } from '@skelly/engine/pose';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

type FigureContent = Parameters<typeof actorFigureIssues>[0];
type FigureActor = FigureContent['actors'] extends ReadonlyMap<string, infer T> ? T : never;

const readFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/actors/${name}`, import.meta.url), 'utf8'));

const rawBody = readFixture('fixture.body.json');
const rawClips = readFixture('fixture.clips.json');
const type = rawBody.type as string;
const seed = rawBody.seed as number;
const figure: ActorFigureDef = {
  id: actorFigureKey(type, seed),
  body: 'actors/fixture.body.json',
  clips: 'actors/fixture.clips.json',
  mesh: 'assets/models/actors/fixture.glb',
};

// The fixture body's type is no actor type, so an authored figure of that name admits it as the player's admits the player.
const content = (
  actorFigures: readonly ActorFigureDef[],
  actors: readonly Partial<FigureActor>[] = [],
  figures: readonly string[] = [type],
): FigureContent => ({
  actors: new Map(actors.map((actor) => [actor.id!, actor as FigureActor])),
  figures: new Map(figures.map((id) => [id, {}])),
  actorFigures: new Map(actorFigures.map((def) => [def.id, def])),
});

describe('actor figure row admission', () => {
  it('admits the fixture row with no issues', () => {
    expect(actorFigureIssues(content([figure]))).toEqual([]);
  });

  it.each([
    ['a drawn figure seed', { id: 'drawn', model: 'humanoid', figureSeeds: [seed + 1] }, '.figureSeeds[0]'],
    ['the fused mass seed', { id: 'mass', model: 'fused-mass' }, '.model'],
  ] as const)('reports %s with no row', (_, actor, path) => {
    const issues = actorFigureIssues(content([figure], [actor as Partial<FigureActor>]));
    const drawn = actor.model === 'fused-mass' ? FUSED_MASS_FIGURE_SEED : seed + 1;
    expect(issues).toEqual([
      { section: 'actors', id: actor.id, path, message: `no actor figure "${actorFigureKey(actor.id, drawn)}"` },
    ]);
  });

  it('reports a row whose key names neither an actor type nor an authored figure', () => {
    expect(actorFigureIssues(content([figure], [], []))).toEqual([
      { section: 'actorFigures', id: figure.id, path: '.id', message: `no actor type or figure "${type}"` },
    ]);
  });

  it('admits each key once, as "type.seed"', () => {
    const source = 'figures.json';
    expect(validateContent({ source, data: { actorFigures: [figure] } })).toEqual([]);
    expect(validateContent({ source, data: { actorFigures: [figure, figure] } })).toEqual([
      expect.objectContaining({ path: 'actorFigures[1].id' }),
    ]);
    expect(validateContent({ source, data: { actorFigures: [figure, { ...figure, id: type }] } })).toEqual([
      expect.objectContaining({ path: 'actorFigures[1]' }),
    ]);
  });
});

describe('actor figure file checks', () => {
  const fileIssues = (id: string, body: unknown, clips: unknown, figures = [type]) =>
    actorFigureFileIssues(content([], [], figures), id, body, clips);

  it('admits the fixture body and clips with no issues', () => {
    expect(fileIssues(figure.id, rawBody, rawClips)).toEqual([]);
  });

  it('reports clips that fail the body', () => {
    const { standing: _, ...crawlingOnly } = rawClips;
    const issues = fileIssues(figure.id, rawBody, crawlingOnly);
    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.every(({ section, id, path }) => section === 'actorFigures' && id === figure.id && path === '.clips'),
    ).toBe(true);
  });

  it('admits a standing humanoid without a crawling set', () => {
    const { crawling: _, ...standingOnly } = rawClips;
    expect(fileIssues(figure.id, rawBody, standingOnly)).toEqual([]);
  });

  // A loaded shambler row: the figure fixture has neither hit boxes nor an actor type that crawls.
  const shamblerRow = () => {
    const registry = baseRegistry();
    const shambler = registry.actors.get('shambler')!;
    const drawn = shambler.figureSeeds![0]!;
    return {
      registry,
      key: actorFigureKey(shambler.id, drawn),
      ...actorFigure(stackActorFigureFiles(registry), shambler, drawn),
    };
  };

  it('reports an actor type that crawls after leg loss whose figure has no crawling set', () => {
    const { registry, key, body, clips } = shamblerRow();
    const { crawling: _, ...standingOnly } = clips;
    expect(actorFigureFileIssues(registry, key, body, standingOnly)).toEqual([
      expect.objectContaining({ id: key, path: '.clips.crawling' }),
    ]);
  });

  it('reports a hit-box bone that carries no voxels', () => {
    const { registry, key, body, clips } = shamblerRow();
    const boxed = body.boxes!.head![0]!.bone;
    const bones = body.bones.map((bone) => {
      if (bone.id !== boxed) {
        return bone;
      }
      const { voxels: _, hull: __, ...bare } = bone;
      return bare;
    });
    expect(actorFigureFileIssues(registry, key, { ...body, bones }, clips)).toEqual([
      expect.objectContaining({ id: key, path: '.body', message: expect.stringContaining(boxed) }),
    ]);
  });

  it("reports a fused mass whose content spawn envelope is not its body's collision box", () => {
    const registry = baseRegistry();
    const amalgam = [...registry.actors.values()].find((actor) => actor.model === 'fused-mass')!;
    const key = actorFigureKey(amalgam.id, FUSED_MASS_FIGURE_SEED);
    const { body, clips } = actorFigure(stackActorFigureFiles(registry), amalgam, FUSED_MASS_FIGURE_SEED);
    expect(actorFigureFileIssues(registry, key, body, clips)).toEqual([]);
    const spawnEnvelope = { halfWidthMetres: 0.5, halfDepthMetres: 0.5, heightMetres: 0.5 };
    const actors = new Map([...registry.actors, [amalgam.id, { ...amalgam, spawnEnvelope }]]);
    expect(actorFigureFileIssues({ ...registry, actors }, key, body, clips)).toEqual([
      expect.objectContaining({ id: key, path: '.body.bounds' }),
    ]);
  });

  it('reports a body file that fails its schema under the row', () => {
    const issues = fileIssues(figure.id, { ...rawBody, bones: 'none' }, rawClips);
    expect(issues).toEqual([expect.objectContaining({ id: figure.id, path: '.body.bones' })]);
  });

  // Under any other key the same type and seed fail, so no second row can admit them twice.
  it('reports a row whose key is not its body type and seed', () => {
    expect(fileIssues(actorFigureKey(type, seed + 1), rawBody, rawClips)).toEqual([
      expect.objectContaining({ path: '.id' }),
    ]);
  });

  it('reports a body whose type names neither an actor type nor an authored figure', () => {
    expect(fileIssues(figure.id, rawBody, rawClips, [])).toEqual([
      { section: 'actorFigures', id: figure.id, path: '.body.type', message: `no actor type or figure "${type}"` },
    ]);
  });
});
