import { readFileSync } from 'node:fs';
import { FUSED_MASS_FIGURE_SEED } from '../../src/core/fusedMassFigure.ts';
import { actorFigureKey } from '../../src/core/schema/actors.ts';

const BUILT_ACTORS = new URL('../../../skelly-assets/built/skelly.deadvox.actors/actors/', import.meta.url);
const readBuilt = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(name, BUILT_ACTORS), 'utf8'));

interface FixtureActor {
  readonly id: string;
  readonly model?: string | undefined;
  readonly figureSeeds?: readonly number[] | undefined;
}

/**
 * A fixture actor type cloned from a base type admits only with a built figure for each seed it draws, so it borrows
 * the base type's own figures under its id: they match the clone's figure variant and regions.
 */
export const fixtureActorFigures = (baseType: string, ...actors: readonly FixtureActor[]) =>
  actors.flatMap(({ id, model, figureSeeds }) =>
    (model === 'fused-mass' ? [FUSED_MASS_FIGURE_SEED] : (figureSeeds ?? [])).map((seed) => {
      const body = readBuilt(`${actorFigureKey(baseType, seed)}.body.json`);
      return {
        id: actorFigureKey(id, seed),
        body: { ...body, type: id },
        clips: readBuilt(`${actorFigureKey(baseType, seed)}.clips.json`),
      };
    }),
  );
