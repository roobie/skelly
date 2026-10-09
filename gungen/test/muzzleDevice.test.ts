import { boundsOfPoints, obbPolyhedron, worldSolid } from '@skelly/engine/core/geometry.ts';
import { applyPoint, type Vec3 } from '@skelly/engine/core/math.ts';
import type { Resolved } from '@skelly/engine/core/resolve.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { describe, expect, it } from 'vitest';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { ak } from '../src/gun/templates.ts';
import { loadCorpus, loadFixture } from './helpers.ts';

const akFixture = loadFixture('archetype-ak');
const akWithDevice = (style: string) => ({
  ...akFixture,
  parts: { ...akFixture.parts, 'muzzle-device': { family: 'ak-muzzle-device', params: { style } } },
});

/** The part threaded on the barrel's muzzle port, if any. */
const deviceOnBarrel = (resolved: Resolved): string | undefined =>
  resolved.connections.find(({ from }) => from.part === 'barrel' && from.port.id === 'muzzle')?.to.part;

/** Where the selected muzzle anchor misses the device's front face, the barrel's bore, or facing out. */
const muzzleOffFront = (resolved: Resolved, device: string, label: string): string[] => {
  const placed = resolved.placed.get(device)!;
  const vertices = resolved.defs.get(device)!.solids.flatMap((solid): readonly Vec3[] => {
    const shape = worldSolid(placed, solid);
    return 'vertices' in shape ? shape.vertices : obbPolyhedron(shape).vertices;
  });
  const [, max] = boundsOfPoints(vertices);
  const barrelMuzzle = resolved.defs.get('barrel')!.ports.find(({ id }) => id === 'muzzle')!;
  const bore = applyPoint(resolved.placed.get('barrel')!, barrelMuzzle.pos);
  const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
  const muzzle = 'code' in anchors ? undefined : anchors.others.muzzle;
  if (!muzzle) {
    return [`${label}: no muzzle anchor`];
  }
  const off = (what: string, actual: number, expected: number) =>
    Math.abs(actual - expected) > 1e-9 ? [`${label}: ${what} ${actual}, expected ${expected}`] : [];
  return [
    ...off('anchor x', muzzle.position[0], max[0]),
    ...off('anchor y', muzzle.position[1], bore[1]),
    ...off('anchor z', muzzle.position[2], bore[2]),
    ...off('forward x', muzzle.forward[0], 1),
  ];
};

describe('muzzle devices', () => {
  // Every supported brake fits the AK barrel.
  it('fits every AK muzzle device on the v2 barrel, firing from its front face', () => {
    const styles = FAMILIES['ak-muzzle-device']!.params.style!.values;
    expect(styles.length).toBeGreaterThan(1);
    for (const style of styles) {
      const report = validate(akWithDevice(style), gunDomain);
      expect(report.issues, style).toEqual([]);
      expect(deviceOnBarrel(report.resolved), style).toBe('muzzle-device');
      expect(muzzleOffFront(report.resolved, 'muzzle-device', style)).toEqual([]);
    }
  });

  it('offers every AK muzzle device in the AK template', () => {
    const slot = ak.slots.find(({ family }) => family === 'ak-muzzle-device');
    const offered = slot?.params?.style;
    expect(Array.isArray(offered) ? [...offered].sort() : offered).toEqual(
      [...FAMILIES['ak-muzzle-device']!.params.style!.values].sort(),
    );
  });

  it('fires every corpus gun from the front of the device threaded on its barrel', () => {
    let checked = 0;
    for (const { label, assembly } of loadCorpus()) {
      const report = validate(assembly, gunDomain);
      const device = deviceOnBarrel(report.resolved);
      if (device) {
        expect(muzzleOffFront(report.resolved, device, label)).toEqual([]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(1);
  });
});
