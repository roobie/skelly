import { zombieFigure as humanoidFigure } from '@mobgen/mob/shamblerFigure.ts';
import { amalgamFigure } from './amalgamFigure.ts';

/** One realization boundary for every content-selected Deadvox zombie model. */
export const zombieFigure = (model: string, seed: number) =>
  model === 'amalgam' ? amalgamFigure(seed) : humanoidFigure(model, seed);

export type ZombieFigure = ReturnType<typeof zombieFigure>;
