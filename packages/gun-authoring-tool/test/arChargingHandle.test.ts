import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { penetrationWorld, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import { describe, expect, it } from 'vitest';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture } from './helpers.ts';

describe('AR charging handle clearance', () => {
  it('clears all actual solids over the continuous hand stroke, including the upper, rail, scope and carrier', () => {
    const resolved = resolve(loadFixture('archetype-ar'), gunDomain);
    const handle = resolveGunAction(resolved)!.parts.handle!;
    const stroke = -handle.travel[0]!;
    expect(stroke).toBeGreaterThan(0);
    expect(handle.travel[1]).toBeCloseTo(0, 12);
    expect(handle.travel[2]).toBeCloseTo(0, 12);
    const obstacles = [...resolved.defs]
      .filter(([id]) => id !== handle.id)
      .flatMap(([id, def]) =>
        def.solids.map((solid) => ({ label: `${id}.${solid.id}`, solid: worldSolid(resolved.placed.get(id)!, solid) })),
      );
    for (const cell of handle.def.solids) {
      if (cell.kind !== 'box') {
        throw new Error('Exact axial box sweep requires box cells');
      }
      // Minkowski sum with [-stroke,0] on local X. This covers every intermediate time, not sampled poses.
      const swept = worldSolid(handle.placed, {
        ...cell,
        box: {
          center: [cell.box.center[0] - stroke / 2, cell.box.center[1], cell.box.center[2]],
          half: [cell.box.half[0] + stroke / 2, cell.box.half[1], cell.box.half[2]],
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
