import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { describe, expect, it } from 'vitest';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import gunVoxel from '../src/gun/gunVoxel.json' with { type: 'json' };
import { readGlb } from './glbReader.ts';
import { loadDesigns, type MutableAssembly, partTriangles } from './helpers.ts';

const ASSET = { id: 'support_underside_test', file: 'assets/models/support_underside_test.glb' };

/** A design without any sight-axis parts: this test reads the forend, and a sight line needs its own profile. */
const sightless = (assembly: Parameters<typeof exportGunGlb>[0]): typeof assembly => {
  const copy = structuredClone(assembly) as MutableAssembly;
  const resolved = resolve(copy, gunDomain);
  for (const [id, def] of resolved.defs) {
    if (def.axes.some(({ kind }) => kind === 'sight')) {
      delete copy.parts[id];
      copy.connections = copy.connections.filter(
        ({ from, to }) => !(from.startsWith(`${id}.`) || to.startsWith(`${id}.`)),
      );
    }
  }
  return copy;
};

/** Every published design that selects a support anchor, with the part that declares it. */
const supportForends = loadDesigns().flatMap(({ label, assembly }) => {
  const selected = selectGunAnchors(resolve(assembly, gunDomain), GUN_ANCHORS, GUN_ANCHOR_POLICY);
  return !('code' in selected) && selected.supportPart !== undefined
    ? [{ label, assembly, partId: selected.supportPart }]
    : [];
});

describe('the exported support anchor rides the underside the voxelized file draws', () => {
  it('has support anchors to check', () => {
    expect(supportForends.length).toBeGreaterThan(0);
  });

  it.each(supportForends)('sits on the forend part’s lowest drawn face: $label, $partId', ({ assembly, partId }) => {
    const result = exportGunGlb(
      sightless(assembly),
      ASSET,
      { appearanceProfile: 'ar' },
      { voxelGrain: gunVoxel.grain, voxelDetailGrain: gunVoxel.detailGrain },
    );
    if (!result.ok) {
      throw new Error(`export failed: ${JSON.stringify(result.error)}`);
    }
    const read = readGlb(result.glb);
    const triangles = partTriangles(read.json, read, partId);
    const lowest = Math.min(...triangles.flatMap((tri) => tri.map((p) => p[1]!)));
    expect(Number.isFinite(lowest), `${partId} draws faces`).toBe(true);
    // A hand copying the height would drift at the next re-export; the anchor must sit on the drawn underside.
    expect(result.modelEntry.anchors!.support![1]).toBeCloseTo(lowest, 6);
  });
});
