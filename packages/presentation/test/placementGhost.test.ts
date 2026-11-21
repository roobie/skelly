import type { FurnitureDef } from '@skelly/engine/content';
import { Group } from 'three';
import { expect, it, vi } from 'vitest';
import { PlacementGhost, placementPieceGhost } from '../src/render/placementGhost.ts';

it('builds a turned asymmetric ghost with the placed piece’s world extents at the pinned corner', () => {
  const def: FurnitureDef = {
    id: 'ghost_fixture',
    name: 'Fixture',
    size: [2, 4, 1],
    color: '#777777',
    material: 'fixture',
    breach: { minimumStrength: 1, durability: 1 },
  };
  const destination = { kind: 'entity' as const, pos: [3, 0, 5] as [number, number, number], facing: 'e' as const };
  const build = vi.fn(() => new Group());
  const ghost = new PlacementGhost(build, { validTint: '#00ff00', refusedTint: '#ff0000', opacity: 0.4 });
  try {
    ghost.update(placementPieceGhost(def, destination, true));
    expect(build).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ size: [1, 4, 2], pos: destination.pos, facing: destination.facing }),
      def,
    );
  } finally {
    ghost.dispose();
  }
});
