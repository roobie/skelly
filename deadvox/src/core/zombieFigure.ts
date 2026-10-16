// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { mulMV, rotY } from '@mobgen/core/math.ts';
import { zombieFigure as humanoidFigure } from '@mobgen/mob/shamblerFigure.ts';
import { amalgamFigure } from './amalgamFigure.ts';
import type { Vec3 } from './coords.ts';

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

/**
 * Where a humanoid's mouth is, in metres from its ground origin: the generated jaw's centre at rest pose, turned
 * to `facing`. The simulation reads the template rather than the rendered mesh, so the spit stays deterministic
 * while still leaving the jaw the player sees.
 */
export const humanoidMouthOrigin = (model: string, seed: number, facing: Vec3): Vec3 => {
  const jaw = humanoidFigure(model, seed).boxes.head.find((box) => box.bone === 'jaw');
  if (!jaw) {
    throw new Error(`Zombie figure ${model} seed ${seed} has no jaw to spit from`);
  }
  const [x, y, z] = mulMV(rotY((Math.atan2(-facing[0], -facing[2]) * 180) / Math.PI), jaw.center);
  return [x, y, z];
};
