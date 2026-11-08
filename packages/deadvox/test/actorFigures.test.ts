import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { actorFigureFileIssues, actorFigureIssues, validateContent } from '../src/core/content.ts';
import { FUSED_MASS_FIGURE_SEED } from '../src/core/fusedMassFigure.ts';
import { actorFigureKey } from '../src/core/schema/actors.ts';
import type { ActorFigureDef } from '../src/core/schema.ts';

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
