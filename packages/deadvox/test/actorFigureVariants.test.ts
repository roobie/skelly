import { describe, expect, it } from 'vitest';
import { actorFigureGeometry } from '../../presentation/src/render/actorFigureGeometry.ts';
import { figureVariants } from '../../presentation/src/render/actorFigureVariants.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

const FIGURES = [...stackActorFigureFiles(baseRegistry()).entries()].map(([key, figure]) => ({
  key,
  type: figure.body.type,
  figure,
}));

/** Two figures that different content types bake from one figure model and seed. */
const sharedFigurePair = () => {
  for (const left of FIGURES) {
    const right = FIGURES.find(
      ({ figure }) =>
        figure.body.type !== left.figure.body.type &&
        figure.body.model === left.figure.body.model &&
        figure.body.seed === left.figure.body.seed,
    );
    if (right) {
      return [left, right] as const;
    }
  }
  throw new Error('no two content types bake the same figure model and seed');
};

describe('actorFigureGeometry', () => {
  it('reads finite vertices from the mesh bytes, with every index inside them', () => {
    const { figure } = FIGURES[0]!;
    const geometry = actorFigureGeometry(figure.mesh, figure.body);
    const positions = geometry.getAttribute('position');
    const index = geometry.getIndex()!;
    expect(positions.count).toBeGreaterThan(0);
    expect(index.count).toBeGreaterThan(0);
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    expect(Array.from(index.array).every((vertex) => vertex < positions.count)).toBe(true);
    geometry.dispose();
  });
});

describe('figureVariants', () => {
  it('draws a figure that two content types bake alike once, under both keys', () => {
    const pair = sharedFigurePair();
    const variants = figureVariants(pair);
    expect(variants.map(({ keys }) => keys)).toEqual([pair.map(({ key }) => key)]);
    for (const { geometry } of variants) {
      geometry.dispose();
    }
  });
});
