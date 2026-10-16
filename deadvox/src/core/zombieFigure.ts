// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { mulMV, rotY } from '@mobgen/core/math.ts';
import { cellIndex, materialOf, worldPosition } from '@mobgen/core/voxelize.ts';
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

const turnedTo = (facing: Vec3, rest: readonly [number, number, number]): Vec3 => {
  const [x, y, z] = mulMV(rotY((Math.atan2(-facing[0], -facing[2]) * 180) / Math.PI), rest);
  return [x, y, z];
};

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
  return turnedTo(facing, jaw.center);
};

const sacCentres = new WeakMap<object, readonly [number, number, number]>();

/** The centre of the acid the chest owns, which is the sac: drool and veins belong to other bones or flesh. */
const sacCentre = (model: string, seed: number): readonly [number, number, number] => {
  const figure = humanoidFigure(model, seed);
  const known = sacCentres.get(figure);
  if (known) {
    return known;
  }
  const { voxels, body } = figure.realized;
  const chest = body.bones.findIndex((bone) => bone.id === 'chest') + 1;
  const sum = [0, 0, 0];
  let count = 0;
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const cell = cellIndex(voxels.dims, i, j, k);
        if (voxels.owner[cell] === chest && materialOf(voxels.color[cell]!) === 'acid') {
          const at = worldPosition(voxels, i, j, k);
          sum[0]! += at[0];
          sum[1]! += at[1];
          sum[2]! += at[2];
          count += 1;
        }
      }
    }
  }
  if (count === 0) {
    throw new Error(`Zombie figure ${model} seed ${seed} has no acid sac`);
  }
  const centre = [sum[0]! / count, sum[1]! / count, sum[2]! / count] as const;
  sacCentres.set(figure, centre);
  return centre;
};

/** Where a humanoid's acid sac is, in metres from its ground origin, at rest pose turned to `facing`. */
export const humanoidSacOrigin = (model: string, seed: number, facing: Vec3): Vec3 =>
  turnedTo(facing, sacCentre(model, seed));
