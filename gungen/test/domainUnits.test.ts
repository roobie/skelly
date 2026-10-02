import { describe, expect, it } from 'vitest';
import type { GlbAssetIdentity, Palette, SelectedAnchors } from '../src/core/design.ts';
import { exportGlb } from '../src/core/glb.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Domain, DomainUnits, PartDef } from '../src/core/schema.ts';
import { readGlb } from './glbReader.ts';

// Each test here protects one thing a domain's units decide, using a synthetic domain whose numbers
// differ from the gun's (1 u = 11.5 mm, 0.25 u grid, 0.125 u bevel), so a stray read of a gun constant fails.

const MILLIMETRE_UNITS: DomainUnits = { metresPerUnit: 0.001, grid: 0.05, bevel: 0.025 };

const widgetDomain = (units: DomainUnits, def: PartDef): Domain => ({
  name: 'widget-domain',
  families: { widget: { name: 'widget', params: {}, build: () => def } },
  axisRules: [],
  units,
});

const widgetAssembly = { name: 'widget', root: 'widget', parts: { widget: { family: 'widget' } }, connections: [] };

const widgetDef: PartDef = {
  family: 'widget',
  solids: [{ id: 'body', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } }],
  ports: [{ id: 'mate', mount: 'test', gender: 'male', pos: [2, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] }],
  keepOuts: [],
  axes: [],
};

const ASSET: GlbAssetIdentity = { id: 'widget', file: 'assets/models/widget.glb' };
const ANCHORS: SelectedAnchors = { hold: { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] }, others: {} };
const PALETTE: Palette = {
  familyColors: { widget: [0.2, 0.3, 0.4] },
  specialColors: {},
  fallbackColor: [0.5, 0.5, 0.5],
};

describe('domain units', () => {
  it('scales exported positions, node translations and the recorded unit by the domain, not the gun constant', () => {
    const resolved = resolve(widgetAssembly, widgetDomain(MILLIMETRE_UNITS, widgetDef));
    const result = exportGlb({ resolved, anchors: ANCHORS, palette: PALETTE, asset: ASSET });
    if (!result.ok) {
      throw new Error(JSON.stringify(result.error));
    }
    const glb = readGlb(result.glb);
    const part = glb.json.nodes.find((node) => node.extras?.part === 'widget')!;
    const primitive = glb.json.meshes[part.mesh!]!.primitives[0]!;
    const portNode = glb.json.nodes.find((node) => node.name === 'widget.mate')!;
    // Positions are float32 in the file, so compare to float precision.
    for (const extent of glb.json.accessors[primitive.attributes.POSITION]!.max!) {
      expect(extent).toBeCloseTo(0.001, 7);
    }
    expect(portNode.translation).toEqual([0.002, 0, 0]);
    expect(glb.json.nodes[0]!.extras).toMatchObject({ gungen: { metresPerUnit: 0.001 } });
  });
});
