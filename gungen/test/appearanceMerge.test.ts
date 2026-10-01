import type { Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { exportGlb } from '../src/core/glb.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Solid } from '../src/core/schema.ts';
import { GUN_PALETTE } from '../src/gun/palette.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { readGlb } from './glbReader.ts';

const box = (id: string, center: [number, number, number], half: [number, number, number]): Solid => ({
  id,
  kind: 'box',
  box: { center, half },
});

const body = box('body', [0, 0, 0], [1, 1, 1]);
const pad: Solid = { ...box('pad', [1.25, 0, 0], [0.25, 1, 1]), material: 'rubber-black', slot: 'accent' };
const merged = (solids: readonly Solid[]): Solid[] =>
  solids.map((solid) => ({ ...solid, display: { mergeGroup: 'compound-stock' } }));
const assembly = () => ({
  name: 'appearance-merge-contract',
  root: 'widget',
  parts: { widget: { family: 'widget' } },
  connections: [],
});
const domain = {
  name: 'appearance-merge-contract',
  families: {
    widget: {
      name: 'widget',
      params: {},
      build: () => ({
        family: 'widget',
        material: 'polymer-fde',
        slot: 'furniture',
        solids: [],
        ports: [],
        keepOuts: [],
        axes: [],
      }),
    },
  },
  axisRules: [],
};
const resolvedFor = (solids: readonly Solid[]) => {
  const current = assembly();
  const resolved = resolve(current, {
    ...domain,
    families: {
      widget: {
        ...domain.families.widget,
        build: () => ({
          family: 'widget',
          material: 'polymer-fde',
          slot: 'furniture',
          solids: [...solids],
          ports: [],
          keepOuts: [],
          axes: [],
        }),
      },
    },
  });
  if (resolved.issues.length > 0) {
    throw new Error(JSON.stringify(resolved.issues));
  }
  return resolved;
};
const appearancePairs = (solids: readonly Solid[]) => {
  const resolved = resolvedFor(solids);
  const exported = exportGlb({
    resolved,
    palette: GUN_PALETTE,
    anchors: { hold: { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] }, others: {} },
    asset: { id: 'appearance-merge-contract', file: 'assets/models/appearance-merge-contract.glb' },
  });
  if (!exported.ok) {
    throw new Error(JSON.stringify(exported.error));
  }
  const glb = readGlb(exported.glb);
  const primitives = glb.json.meshes.flatMap((mesh) => mesh.primitives);
  const exportedPairs = primitives.map((primitive) => {
    const extras = primitive.extras as { material?: string; slot?: string };
    return `${extras.material}:${extras.slot}`;
  });
  const layers = buildLayers({ ok: true, resolved, issues: [] }, []);
  try {
    const viewerPairs = layers.solids.children.map((object) => {
      const mesh = object as Mesh;
      const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      return (material as MeshStandardMaterial).color.getHexString();
    });
    return { exportedPairs: exportedPairs.sort(), viewerPairs: viewerPairs.sort() };
  } finally {
    for (const group of Object.values(layers)) {
      disposeGroup(group);
    }
  }
};

describe('merged display appearances', () => {
  it('keeps mixed solid finishes equivalent to unmerged geometry for either member order', () => {
    const expected = appearancePairs([body, pad]);
    for (const order of [
      [body, pad],
      [pad, body],
    ]) {
      const grouped = appearancePairs(merged(order));
      expect(grouped).toEqual(expected);
      expect(grouped.exportedPairs).toEqual(['polymer-fde:furniture', 'rubber-black:accent']);
      expect(grouped.viewerPairs).toEqual(['181a1b', 'b19162']);
    }
  });
});
