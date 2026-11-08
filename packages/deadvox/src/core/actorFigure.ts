// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { templateFigure } from '@mobgen/mob/humanoidFigure.ts';
import { bodyPlanModel, figureVariantOf } from './actorModels.ts';
import { fusedMassFigure } from './fusedMassFigure.ts';

export interface ActorFigureType {
  readonly model: string;
  readonly figure?: string | undefined;
  readonly bodyScale?: number | undefined;
  readonly figureSeeds?: readonly number[] | undefined;
}

/** Every figure seed some ordinary type draws, in authored order, without repeats. */
export const figureSeedPool = (actors: ReadonlyMap<string, ActorFigureType>): readonly number[] => [
  ...new Set([...actors.values()].flatMap((type) => type.figureSeeds ?? [])),
];

/** The content type realized as the fused-mass model, chosen by its model rather than its id. */
export const fusedMassTypeOf = <T extends ActorFigureType>(actors: ReadonlyMap<string, T>): T | undefined =>
  [...actors.values()].find((type) => type.model === 'fused-mass');

/** The mobgen realization the renderer still draws from, for every content-selected actor model. */
export const generatedActorFigure = (type: ActorFigureType, seed: number) => {
  if (type.model !== 'fused-mass') {
    return templateFigure(bodyPlanModel(figureVariantOf(type)), seed);
  }
  if (type.bodyScale === undefined) {
    throw new Error('Fused-mass figure is missing its authored bodyScale');
  }
  return fusedMassFigure(seed, type.bodyScale);
};

export type ActorFigure = ReturnType<typeof generatedActorFigure>;
