import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/core/validate.ts';
import type { Solid } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { FAMILIES, FIRING_GRIP } from '../src/gun/parts.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';

const design = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-awm.json'), 'utf8'),
) as { assembly: Parameters<typeof validate>[0] };

const inside = (solid: Solid, x: number, y: number, z: number): boolean => {
  if (solid.kind === 'box') {
    return [x, y, z].every((value, axis) => Math.abs(value - solid.box.center[axis]!) <= solid.box.half[axis]!);
  }
  if (z < solid.z[0] || z > solid.z[1]) return false;
  let result = false;
  for (let i = 0, j = solid.profile.length - 1; i < solid.profile.length; j = i++) {
    const [xi, yi] = solid.profile[i]!;
    const [xj, yj] = solid.profile[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
};

describe('thumbhole stock and AWM design', () => {
  it('builds a real opening while retaining a connected stock and an interior firing-hand anchor', () => {
    const stock = FAMILIES.stock!.build({ length: 'L', style: 'thumbhole' });
    expect(stock.tags).toContain(FIRING_GRIP);
    const aperture = [-10.78, -5.49, 0] as const;
    expect(stock.solids.some((solid) => inside(solid, ...aperture))).toBe(false);
    const grip = stock.solids.find((solid) => solid.id === 'grip')!;
    const hold = GUN_ANCHORS.stock!.anchors({ length: 'L', style: 'thumbhole' }, stock).hold!;
    expect(inside(grip, ...hold.position)).toBe(true);
    expect(stock.ports.find((port) => port.id === 'front')?.pos).toEqual([0, 0, 0]);
  });

  it('validates the AWM design with its thumbhole stock as the only grip', () => {
    const loaded = loadGunDesign(JSON.stringify({ format: 1, template: 'bolt-rifle-thumbhole', assembly: design.assembly, locks: { params: {}, optionalParts: [] }, status: 'published' }));
    expect(loaded.ok).toBe(true);
    const report = validate(design.assembly, gunDomain);
    expect(report.issues).toEqual([]);
    expect(design.assembly.parts.grip).toBeUndefined();
    expect(design.assembly.parts.lower?.params?.layout).toBe('thumbhole');
    expect(design.assembly.parts.barrel?.params?.profile).toBe('heavy');
  });
});
