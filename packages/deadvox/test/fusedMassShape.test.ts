import { actorFigure } from '@skelly/engine/content';
import { FusedMassShape } from '@skelly/engine/internal/core/fusedMassShape.ts';
import { testedBricks } from '@skelly/engine/internal/core/solidBricks.ts';
import { FUSED_MASS_FIGURE_SEED, type FusedMassFigure, fusedMassTypeOf } from '@skelly/engine/pose';
import { type Body, stepBody, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
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
  it('stops a player at turned flesh extending past the unturned body box', () => {
    const figure: FusedMassFigure = {
      ...cube,
      grid: { dims: [2, 2, 6], origin: [-0.5, 0.5, -2.5], size: 1, owner: new Uint8Array(24).fill(1) },
    };
    const empty = () => false;
    const shape = new FusedMassShape(figure, 1, testedBricks(empty));
    shape.keep([], 0, () => ({ carved: new Set(), severedOwners: new Set() }));
    shape.face([1, 0, 0]);
    const mass: Body = {
      pos: [0, 0, 0],
      vel: [0, 0, 0],
      halfWidth: 1,
      halfDepth: 3,
      height: 2,
      onGround: false,
    };
    const player: Body = {
      pos: [2, 0, 2],
      vel: [0, 0, -1],
      halfWidth: 0.2,
      height: 1.5,
      onGround: false,
    };
    const inFlesh = (at: Vec3) =>
      shape.overlapsBox(
        mass.pos,
        [at[0] - player.halfWidth, at[1], at[2] - player.halfWidth],
        [at[0] + player.halfWidth, at[1] + player.height, at[2] + player.halfWidth],
      );
    expect(player.pos[0] - player.halfWidth).toBeGreaterThan(mass.pos[0] + mass.halfWidth);
    expect(inFlesh(player.pos)).toBe(false);
    expect(inFlesh([player.pos[0], player.pos[1], 0])).toBe(true);
    const [, , startZ] = player.pos;
    for (let tick = 0; tick < 8; tick++) {
      player.vel[2] = -1;
      stepBody(player, 0.25, empty, {
        gravity: 0,
        stepHeight: 0,
        obstacles: [mass],
        shapeOf: (body) => (body === mass ? shape : undefined),
      });
      expect(inFlesh(player.pos)).toBe(false);
    }
    expect(player.pos[2]).toBeLessThan(startZ);
  });

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
