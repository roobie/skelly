import { describe, expect, it } from 'vitest';
import { penetrationWorld, worldSolid } from '../src/core/geometry.ts';
import { resolve } from '../src/core/resolve.ts';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture } from './helpers.ts';

describe('AR charging handle clearance', () => {
  it('clears all actual solids over the continuous 6.5u hand stroke, including the upper, rail, scope and carrier', () => {
    const resolved = resolve(loadFixture('archetype-ar'), gunDomain);
    const handle = resolveGunAction(resolved)!.parts.handle!;
    expect(handle.travel).toEqual([-6.5, 0, 0].map((value) => expect.closeTo(value, 12)));
    const obstacles = [...resolved.defs]
      .filter(([id]) => id !== handle.id)
      .flatMap(([id, def]) =>
        def.solids.map((solid) => ({ label: `${id}.${solid.id}`, solid: worldSolid(resolved.placed.get(id)!, solid) })),
      );
    for (const cell of handle.def.solids) {
      if (cell.kind !== 'box') {
        throw new Error('Exact axial box sweep requires box cells');
      }
      // Minkowski sum with [-6.5,0] on local X. This covers every intermediate time, not sampled poses.
      const swept = worldSolid(handle.placed, {
        ...cell,
        box: {
          center: [cell.box.center[0] - 3.25, cell.box.center[1], cell.box.center[2]],
          half: [cell.box.half[0] + 3.25, cell.box.half[1], cell.box.half[2]],
        },
      });
      for (const obstacle of obstacles) {
        expect(penetrationWorld(swept, obstacle.solid), `${cell.id} swept into ${obstacle.label}`).toBeLessThanOrEqual(
          1e-7,
        );
      }
    }
  });
});
