// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { zombieFigure as humanoidFigure } from '@mobgen/mob/shamblerFigure.ts';
import { amalgamFigure } from './amalgamFigure.ts';

export interface ZombieFigureType {
  readonly model: string;
  readonly bodyScale?: number | undefined;
  readonly figureSeeds?: readonly number[] | undefined;
}

/** Every figure seed some ordinary type draws, in authored order, without repeats. */
export const figureSeedPool = (zombies: ReadonlyMap<string, ZombieFigureType>): readonly number[] => [
  ...new Set([...zombies.values()].flatMap((type) => type.figureSeeds ?? [])),
];

/** The content type realized as the amalgam model, chosen by its model rather than its id. */
export const amalgamTypeOf = <T extends ZombieFigureType>(zombies: ReadonlyMap<string, T>): T | undefined =>
  [...zombies.values()].find((type) => type.model === 'amalgam');

/** One realization boundary for every content-selected Deadvox zombie model. */
export const zombieFigure = (type: ZombieFigureType, seed: number) => {
  if (type.model !== 'amalgam') {
    return humanoidFigure(type.model, seed);
  }
  if (type.bodyScale === undefined) {
    throw new Error('Amalgam figure is missing its authored bodyScale');
  }
  return amalgamFigure(seed, type.bodyScale);
};

export type ZombieFigure = ReturnType<typeof zombieFigure>;
