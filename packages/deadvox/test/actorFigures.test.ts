import { readFileSync } from 'node:fs';
import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { actorFigureIssues, validateContent } from '../src/core/content.ts';
import { FUSED_MASS_FIGURE_SEED } from '../src/core/fusedMassFigure.ts';
import { type PackInput, packContentHash } from '../src/core/packAdmission.ts';
import { ActorFigureSchema, actorFigureKey } from '../src/core/schema/actors.ts';
import type { ActorFigureDef } from '../src/core/schema.ts';

type FigureContent = Parameters<typeof actorFigureIssues>[0];
type FigureActor = FigureContent['actors'] extends ReadonlyMap<string, infer T> ? T : never;

const readFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/actors/${name}`, import.meta.url), 'utf8'));

const rawBody = readFixture('fixture.body.json');
const rawClips = readFixture('fixture.clips.json');
const row = (body = rawBody, clips = rawClips) => ({
  id: actorFigureKey(body.type as string, body.seed as number),
  body,
  clips,
});
const figure = parse(ActorFigureSchema, row());

// The fixture body's type is no actor type, so an authored figure of that name admits it as the player's admits the player.
const content = (
  actorFigures: readonly ActorFigureDef[],
  actors: readonly Partial<FigureActor>[] = [],
  figures: readonly string[] = [figure.body.type],
): FigureContent => ({
  actors: new Map(actors.map((actor) => [actor.id!, actor as FigureActor])),
  figures: new Map(figures.map((id) => [id, {}])),
  actorFigures: new Map(actorFigures.map((def) => [def.id, def])),
});

describe('actor figure admission', () => {
  it('admits the fixture figure with no issues', () => {
    expect(actorFigureIssues(content([figure]))).toEqual([]);
  });

  it.each([
    ['a drawn figure seed', { id: 'drawn', model: 'humanoid', figureSeeds: [figure.body.seed + 1] }, '.figureSeeds[0]'],
    ['the fused mass seed', { id: 'mass', model: 'fused-mass' }, '.model'],
  ] as const)('reports %s with no figure', (_, actor, path) => {
    const issues = actorFigureIssues(content([figure], [actor as Partial<FigureActor>]));
    const seed = actor.model === 'fused-mass' ? FUSED_MASS_FIGURE_SEED : figure.body.seed + 1;
    expect(issues).toEqual([
      { section: 'actors', id: actor.id, path, message: `no actor figure "${actorFigureKey(actor.id, seed)}"` },
    ]);
  });

  it('reports clips that fail the body', () => {
    const { standing: _, ...crawlingOnly } = figure.clips;
    const issues = actorFigureIssues(content([{ ...figure, clips: crawlingOnly }]));
    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.every(({ section, id, path }) => section === 'actorFigures' && id === figure.id && path === '.clips'),
    ).toBe(true);
  });

  it('reports a figure whose type names neither an actor type nor an authored figure', () => {
    expect(actorFigureIssues(content([figure], [], []))).toEqual([
      {
        section: 'actorFigures',
        id: figure.id,
        path: '.body.type',
        message: `no actor type or figure "${figure.body.type}"`,
      },
    ]);
  });

  it('admits each type and seed once', () => {
    const source = 'figures.json';
    expect(validateContent({ source, data: { actorFigures: [row()] } })).toEqual([]);
    expect(validateContent({ source, data: { actorFigures: [row(), row()] } })).toEqual([
      expect.objectContaining({ path: 'actorFigures[1].id' }),
    ]);
    // Under any other id the same type and seed fail the key check, so no second id can admit them twice.
    const misKeyed = { ...row(), id: actorFigureKey(figure.body.type, figure.body.seed + 1) };
    expect(validateContent({ source, data: { actorFigures: [row(), misKeyed] } })).toEqual([
      expect.objectContaining({ path: 'actorFigures[1]' }),
    ]);
  });
});

describe('actor figure content identity', () => {
  const pack = (body: Record<string, unknown>): PackInput => ({
    source: 'fixture.figures',
    manifest: {
      id: 'fixture.figures',
      version: '1',
      tier: 'product',
      product: false,
      dependencies: [],
      overrides: [],
      files: [{ path: 'figures.json', kind: 'content' }],
    },
    files: [{ source: 'figures.json', data: { actorFigures: [row(body)] } }],
  });

  it('changes the pack content hash when one body value changes', async () => {
    const changed = { ...rawBody, scale: (rawBody.scale as number) + 1 };
    expect(await packContentHash(pack(changed))).not.toBe(await packContentHash(pack(rawBody)));
  });
});
