import { readFileSync } from 'node:fs';
import { buildRegistry } from '@skelly/engine/content';
import { FIGURE_VARIANTS } from '@skelly/engine/internal/core/actorModels.ts';
import { validateContent } from '@skelly/engine/internal/core/content.ts';
import { describe, expect, it } from 'vitest';
import { fixtureActorFigures } from './fixtures/actorFigures.ts';

// Shipped actor rows as authored, so each witness carries the fields its body plan requires.
const source = 'mods/skelly.deadvox.actors/enemies.json';
const { actors } = JSON.parse(readFileSync(source, 'utf8')) as {
  actors: {
    readonly id: string;
    readonly model: string;
    readonly figureSeeds?: readonly number[];
    readonly capability?: readonly string[];
  }[];
};

/** One witness actor type per figure variant: the first shipped row of its body plan, selecting that figure. */
const witnesses = Object.entries(FIGURE_VARIANTS).map(([figure, { bodyPlan }]) => {
  const row = actors.find((actor) => actor.model === bodyPlan);
  if (!row) {
    throw new Error(`no shipped actor row has body plan "${bodyPlan}"`);
  }
  // Capabilities are dropped: four witnesses of one plan would otherwise compete for the row's claims.
  const { capability: _capability, ...rest } = row;
  return { ...rest, id: `witness_${figure.replaceAll('-', '_')}`, figure };
});

describe('actor models', () => {
  it('lets content select every figure variant the renderer draws', () => {
    const parsed = witnesses.map((witness) => ({
      figure: witness.figure,
      issues: validateContent({ source, data: { actors: [witness] } }),
    }));
    expect(parsed).toEqual(witnesses.map(({ figure }) => ({ figure, issues: [] })));

    const { issues } = buildRegistry([
      { source: 'witnesses.json', data: { actors: witnesses, actorFigures: fixtureActorFigures(...witnesses) } },
    ]);
    const selection = issues.filter(
      ({ source: file, path }) => file === 'witnesses.json' && (path.endsWith('.figure') || path.endsWith('.model')),
    );
    expect(selection).toEqual([]);
  });
});
