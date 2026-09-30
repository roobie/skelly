import { describe, expect, it } from 'vitest';
import { applyPoint, type Vec3 } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Box, Solid } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCorpus } from './helpers.ts';

const corners = (solid: Solid): Vec3[] => {
  if (solid.kind === 'box') {
    const { center, half } = solid.box as Box;
    return [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [
      center[0] + x * half[0], center[1] + y * half[1], center[2] + z * half[2],
    ] as const)));
  }
  return solid.profile.flatMap((point) => [solid.z[0], solid.z[1]].map((along) =>
    solid.axis === 'x' ? [along, point[0], point[1]] as const : [point[0], point[1], along] as const));
};

const limits = (points: readonly Vec3[]) => [0, 1, 2].map((axis) => [
  Math.min(...points.map((point) => point[axis]!)),
  Math.max(...points.map((point) => point[axis]!)),
]);

describe('procedural bolt carrier', () => {
  it('uses separate pattern-specific parts for AR, AK, and pump while inheriting action and bore', () => {
    const expected = new Map([
      ['design archetype-ar.json', 'ar'],
      ['design archetype-ar-free-float.json', 'ar'],
      ['design archetype-ak.json', 'ak'],
      ['design archetype-pump-shotgun.json', 'pump'],
    ]);
    for (const { label, assembly } of loadCorpus()) {
      const pattern = expected.get(label);
      if (!pattern) continue;
      const resolved = resolve(assembly, gunDomain);
      const params = resolved.params.get('bolt-carrier')!;
      expect(params.pattern?.value, label).toBe(pattern);
      expect(params.action?.source, label).toBe('inherited');
      expect(params.bore?.source, label).toBe('inherited');
      expect(resolved.defs.get('receiver')?.solids.some(({ id }) => id === 'bolt-carrier-face'), label).toBe(false);
      expect(resolved.defs.get('bolt-carrier')?.motion, label).toMatchObject({
        kind: 'linear', axis: [1, 0, 0], rest: [0, 0, 0], rearmost: [6.5, 0, 0],
      });
    }
  });

  it('keeps every moving solid inside the receiver length at rest and rearmost', () => {
    for (const { label, assembly } of loadCorpus()) {
      if (!['design archetype-ar.json', 'design archetype-ar-free-float.json', 'design archetype-ak.json', 'design archetype-pump-shotgun.json'].includes(label)) continue;
      const resolved = resolve(assembly, gunDomain);
      const transform = resolved.placed.get('bolt-carrier')!;
      const def = resolved.defs.get('bolt-carrier')!;
      const motion = def.motion!;
      const receiverBounds = limits(resolved.defs.get('receiver')!.solids.flatMap(corners));
      for (const solid of def.solids) {
        for (const corner of corners(solid)) {
          const rest = applyPoint(transform, corner);
          const rear = applyPoint(transform, [corner[0] + motion.rearmost[0]!, corner[1], corner[2]]);
          for (const point of [rest, rear]) {
            expect(point[0], `${label}:${solid.id}`).toBeGreaterThanOrEqual(receiverBounds[0]![0]! - 1e-6);
            expect(point[0], `${label}:${solid.id}`).toBeLessThanOrEqual(receiverBounds[0]![1]! + 1e-6);
          }
        }
      }
    }
  });

  it('makes each family style produce the expected procedural features', () => {
    const build = (pattern: string) => FAMILIES['bolt-carrier']!.build({ pattern, bore: 'L', action: 'auto' });
    expect(build('ar').solids.map(({ id }) => id)).toEqual(['carrier-body', 'bolt-head', 'gas-key']);
    expect(build('ak').solids.map(({ id }) => id)).toContain('piston');
    expect(build('pump').solids.map(({ id }) => id)).toContain('action-bar-left');
    expect(build('barrett').solids.map(({ id }) => id)).toContain('heavy-carrier');
    expect(build('bolt').solids.map(({ id }) => id)).toContain('bolt-handle');
  });
});
