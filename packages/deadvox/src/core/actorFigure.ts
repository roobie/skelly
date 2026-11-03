// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { actorFigure as humanoidFigure } from '@mobgen/mob/humanoidFigure.ts';
import { bodyPlanModel, figureVariantOf } from './actorModels.ts';
import { amalgamFigure } from './amalgamFigure.ts';

export interface ActorFigureType {
  readonly model: string;
  readonly figure?: string | undefined;
  readonly bodyScale?: number | undefined;
  readonly figureSeeds?: readonly number[] | undefined;
}

/** Every figure seed some ordinary type draws, in authored order, without repeats. */
export const figureSeedPool = (zombies: ReadonlyMap<string, ActorFigureType>): readonly number[] => [
  ...new Set([...zombies.values()].flatMap((type) => type.figureSeeds ?? [])),
];

/** The content type realized as the amalgam model, chosen by its model rather than its id. */
export const amalgamTypeOf = <T extends ActorFigureType>(zombies: ReadonlyMap<string, T>): T | undefined =>
  [...zombies.values()].find((type) => type.model === 'fused-mass');

/** One realization boundary for every content-selected actor model. */
export const actorFigure = (type: ActorFigureType, seed: number) => {
  if (type.model !== 'fused-mass') {
    return humanoidFigure(bodyPlanModel(figureVariantOf(type)), seed);
  }
  if (type.bodyScale === undefined) {
    throw new Error('Amalgam figure is missing its authored bodyScale');
  }
  return amalgamFigure(seed, type.bodyScale);
};

export type ActorFigure = ReturnType<typeof actorFigure>;
