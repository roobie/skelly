// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { zombieFigure as humanoidFigure } from '@mobgen/mob/shamblerFigure.ts';
import { amalgamFigure } from './amalgamFigure.ts';

/** One realization boundary for every content-selected Deadvox zombie model. */
export const zombieFigure = (model: string, seed: number, bodyScale?: number) => {
  if (model !== 'amalgam') {
    return humanoidFigure(model, seed);
  }
  if (bodyScale === undefined) {
    throw new Error('Amalgam figure is missing its authored bodyScale');
  }
  return amalgamFigure(seed, bodyScale);
};

export type ZombieFigure = ReturnType<typeof zombieFigure>;
