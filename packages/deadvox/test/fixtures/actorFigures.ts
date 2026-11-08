import { FUSED_MASS_FIGURE_SEED } from '../../src/core/fusedMassFigure.ts';
import { actorFigureKey } from '../../src/core/schema/actors.ts';

interface FixtureActor {
  readonly id: string;
  readonly model?: string | undefined;
  readonly figureSeeds?: readonly number[] | undefined;
}

/**
 * A fixture actor type admits only with a figure row for each seed it draws. The browser registry checks only that
 * coverage, so the rows name files no test reads.
 */
export const fixtureActorFigures = (...actors: readonly FixtureActor[]) =>
  actors.flatMap(({ id, model, figureSeeds }) =>
    (model === 'fused-mass' ? [FUSED_MASS_FIGURE_SEED] : (figureSeeds ?? [])).map((seed) => {
      const key = actorFigureKey(id, seed);
      return { id: key, body: `actors/${key}.body.json`, clips: `actors/${key}.clips.json` };
    }),
  );
