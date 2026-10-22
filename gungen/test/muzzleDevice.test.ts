import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { applyPoint, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { boundsOfPoints, obbPolyhedron, worldSolid } from '@skelly/engine/shapes/geometry.ts';
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

/** Where the selected muzzle anchor misses `x` on the barrel's bore, or faces anywhere but out. */
const muzzleOff = (resolved: Resolved, x: number, label: string): string[] => {
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
    ...off('anchor x', muzzle.position[0], x),
    ...off('anchor y', muzzle.position[1], bore[1]),
    ...off('anchor z', muzzle.position[2], bore[2]),
    ...off('forward x', muzzle.forward[0], 1),
  ];
};

const barrelMuzzleX = (resolved: Resolved): number => {
  const port = resolved.defs.get('barrel')!.ports.find(({ id }) => id === 'muzzle')!;
  return applyPoint(resolved.placed.get('barrel')!, port.pos)[0];
};

const frontFaceX = (resolved: Resolved, device: string): number => {
  const placed = resolved.placed.get(device)!;
  const vertices = resolved.defs.get(device)!.solids.flatMap((solid): readonly Vec3[] => {
    const shape = worldSolid(placed, solid);
    return 'vertices' in shape ? shape.vertices : obbPolyhedron(shape).vertices;
  });
  return boundsOfPoints(vertices)[1][0];
};

describe('muzzle devices', () => {
  // An attachment is fitted and removed in play, so the gun's muzzle stays on the barrel, as with a suppressor.
  it('fits every AK muzzle device on the v2 barrel as an attachment, firing from the barrel', () => {
    const styles = FAMILIES['ak-muzzle-device']!.params.style!.values;
    expect(styles.length).toBeGreaterThan(1);
    for (const style of styles) {
      const report = validate(akWithDevice(style), gunDomain);
      expect(report.issues, style).toEqual([]);
      expect(deviceOnBarrel(report.resolved), style).toBe('muzzle-device');
      expect(muzzleOff(report.resolved, barrelMuzzleX(report.resolved), style)).toEqual([]);
    }
  });

  it('offers every AK muzzle device in the AK template', () => {
    const slot = ak.slots.find(({ family }) => family === 'ak-muzzle-device');
    const offered = slot?.params?.style;
    expect(Array.isArray(offered) ? [...offered].sort() : offered).toEqual(
      [...FAMILIES['ak-muzzle-device']!.params.style!.values].sort(),
    );
  });

  it('fires every corpus gun from the front of a built-in device threaded on its barrel', () => {
    let checked = 0;
    for (const { label, assembly } of loadCorpus()) {
      const report = validate(assembly, gunDomain);
      const device = deviceOnBarrel(report.resolved);
      if (device && !report.resolved.defs.get(device)?.tags?.includes('attachment')) {
        expect(muzzleOff(report.resolved, frontFaceX(report.resolved, device), label)).toEqual([]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
