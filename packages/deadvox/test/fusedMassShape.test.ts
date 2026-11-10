import { describe, expect, it } from 'vitest';
import { FusedMassShape } from '../src/core/fusedMassShape.ts';
import { testedBricks } from '../src/core/solidBricks.ts';
import { actorFigure } from '../src/engine/content.ts';
import { FUSED_MASS_FIGURE_SEED, type FusedMassFigure, fusedMassTypeOf } from '../src/engine/pose.ts';
import type { Vec3 } from '../src/engine/world.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const source = actorFigure(stackActorFigureFiles(registry), fusedMassTypeOf(registry.actors)!, FUSED_MASS_FIGURE_SEED)
  .fusedMass!;
const cube: FusedMassFigure = {
  ...source,
  scale: 1,
  originOffset: [0, 0, 0],
  grid: { dims: [2, 2, 2], origin: [0, 0, 0], size: 1, owner: new Uint8Array(8).fill(1) },
};
const pos: Vec3 = [0, 0, 0];
const shapeFor = (solid: (x: number, y: number, z: number) => boolean) => {
  const shape = new FusedMassShape(cube, 1, testedBricks(solid));
  shape.keep([], 0, () => ({ carved: new Set(), severedOwners: new Set() }));
  return shape;
};

describe('fused-mass filled-leaf collision', () => {
  it('retains carved holes inside a formerly filled leaf for boxes and terrain', () => {
    const shape = shapeFor((x, y, z) => x === 0 && y === 0 && z === 0);
    const min: Vec3 = [-0.2, 0.2, -0.2];
    const max: Vec3 = [0.2, 0.8, 0.2];
    expect(shape.overlapsBox(pos, min, max)).toBe(true);
    shape.keep([0], 0, () => ({ carved: new Set([0]), severedOwners: new Set() }));
    expect(shape.overlapsBox(pos, min, max)).toBe(false);
    // A translated block entirely inside the removed voxel, not beside the remaining seven.
    expect(shape.overlapsTerrain([0.5, 0, 0.5])).toBe(false);
    expect(shape.overlapsBox(pos, [0.8, 0.2, -0.2], [1.2, 0.8, 0.2])).toBe(true);
  });

  it('does not use higher flesh to answer a below-height terrain query', () => {
    const shape = shapeFor((_x, y) => y === 1);
    expect(shape.overlapsTerrain(pos)).toBe(true);
    expect(shape.overlapsTerrainBelow(pos, 0.5)).toBe(false);
    expect(shape.overlapsTerrain(pos)).toBe(true);
  });
});
