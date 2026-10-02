import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { exportGlb, partNodeName } from '../src/core/glb.ts';
import { meshForSolid } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Domain } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { GUN_PALETTE } from '../src/gun/palette.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { readGlb } from './glbReader.ts';
import { loadFixture } from './helpers.ts';

const hints = { bevel: false, outline: false };
const gripFamily = gunDomain.families.grip!;
const hintedDomain: Domain = {
  ...gunDomain,
  families: {
    ...gunDomain.families,
    grip: {
      ...gripFamily,
      build: (params) => {
        const def = gripFamily.build(params);
        return {
          ...def,
          solids: def.solids.map((solid) => (solid.id === 'body' ? { ...solid, display: hints } : solid)),
        };
      },
    },
  },
};

const rifle = loadFixture('archetype-battle-rifle');
const ASSET = { id: 'hint-test', file: 'assets/models/hint-test.glb' } as const;

describe('per-solid display hints', () => {
  it('defaults to bevelled display and produces a plain mesh when bevel is opted out', () => {
    const solid = gunDomain.families.grip!.build({ length: 'M' }).solids.find(({ id }) => id === 'body')!;
    expect(solid.display).toBeUndefined();
    expect(meshForSolid(solid).triangleCount).toBeGreaterThan(meshForSolid({ ...solid, display: hints }).triangleCount);
  });

  it('keeps bevel and outline defaults when the solid has no hints', () => {
    const layers = buildLayers(validate(rifle, gunDomain), []);
    try {
      const grip = layers.solids.children.find((child) =>
        String(child.userData.label).includes('grip (grip) · solid body'),
      );
      expect(grip).toBeInstanceOf(Mesh);
      expect(grip?.children).toHaveLength(1);
      expect((grip as Mesh).geometry.index?.count).toBe(56 * 3);
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
  });

  it('draws a hinted viewer solid without bevel or outline geometry', () => {
    const layers = buildLayers(validate(rifle, hintedDomain), []);
    try {
      const grip = layers.solids.children.find((child) =>
        String(child.userData.label).includes('grip (grip) · solid body'),
      );
      expect(grip).toBeInstanceOf(Mesh);
      const hintedSolid = hintedDomain.families.grip!.build({ length: 'M' }).solids.find(({ id }) => id === 'body')!;
      expect(grip?.children).toHaveLength(0);
      expect((grip as Mesh).geometry.index?.count).toBe(meshForSolid(hintedSolid).indices.length);
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
  });

  it('exports the hinted solid with its unbeveled mesh', () => {
    const resolved = resolve(rifle, hintedDomain);
    const result = exportGlb({ resolved, palette: GUN_PALETTE, asset: ASSET });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected a valid glb export');
    }
    const read = readGlb(result.glb);
    const grip = read.json.nodes.find(({ name }) => name === partNodeName('grip', 'grip'))!;
    const primitive = read.json.meshes[grip.mesh!]!.primitives.find(({ extras }) => extras?.solid === 'body')!;
    const expected = meshForSolid(
      hintedDomain.families.grip!.build({ length: 'M' }).solids.find(({ id }) => id === 'body')!,
    );
    expect(read.json.accessors[primitive.indices]!.count).toBe(expected.indices.length);
  });

  it('opts curved STANAG and AK magazine display sectors out of bevels and outlines', () => {
    for (const [label, params] of [
      ['STANAG', { profile: 'stanag-curved', length: 'L' }],
      ['AK-74', { profile: 'ak-curved', variant: 'ak74', length: 'L' }],
    ] as const) {
      const magazine = gunDomain.families.magazine!.build(params);
      const sectors = magazine.displaySolids!.filter(({ id }) => id.startsWith('curve-display-'));
      expect(sectors.length, label).toBeGreaterThan(1);
      expect(
        sectors.every(({ display }) => display?.bevel === false && display.outline === false),
        label,
      ).toBe(true);
    }
  });

  it('does not change a design rule report', () => {
    expect(validate(rifle, hintedDomain).issues).toEqual(validate(rifle, gunDomain).issues);
  });

  it('does not require or retain display hints while loading a design', () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-ar.json'), 'utf8')) as {
      assembly: { parts: Record<string, Record<string, unknown>> };
    };
    raw.assembly.parts.grip!.display = hints;
    const loaded = loadGunDesign(JSON.stringify(raw));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.design.assembly.parts.grip).not.toHaveProperty('display');
    }
  });
});
