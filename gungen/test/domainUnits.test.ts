import type { GlbAssetIdentity, Palette } from '@skelly/engine/core/design.ts';
import { boxFromMinMax } from '@skelly/engine/core/geometry.ts';
import { exportGlb } from '@skelly/engine/core/glb.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Domain, DomainUnits, PartDef } from '@skelly/engine/core/schema.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { describe, expect, it } from 'vitest';
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
const PALETTE: Palette = {
  familyColors: { widget: [0.2, 0.3, 0.4] },
  specialColors: {},
  fallbackColor: [0.5, 0.5, 0.5],
};

/** Two parts joined at a port, with their boxes `gap` apart along the connection normal. */
const gappedPair = (units: DomainUnits, gap: number): Domain => ({
  name: 'gapped-pair',
  families: {
    source: {
      name: 'source',
      params: {},
      build: () => ({
        family: 'source',
        solids: [{ id: 'body', kind: 'box', box: boxFromMinMax([-1, -0.5, -0.5], [0, 0.5, 0.5]) }],
        ports: [{ id: 'mate', mount: 'test', gender: 'female', pos: [0, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] }],
        keepOuts: [],
        axes: [],
      }),
    },
    target: {
      name: 'target',
      params: {},
      build: () => ({
        family: 'target',
        solids: [{ id: 'body', kind: 'box', box: boxFromMinMax([gap, -0.5, -0.5], [gap + 1, 0.5, 0.5]) }],
        ports: [{ id: 'mate', mount: 'test', gender: 'male', pos: [0, 0, 0], normal: [-1, 0, 0], up: [0, 1, 0] }],
        keepOuts: [],
        axes: [],
      }),
    },
  },
  axisRules: [],
  units,
});

const pairAssembly = {
  name: 'pair',
  root: 'source',
  parts: { source: { family: 'source' }, target: { family: 'target' } },
  connections: [{ from: 'source.mate', to: 'target.mate' }],
};

describe('domain units', () => {
  it('scales exported positions, node translations and the recorded unit by the domain, not the gun constant', () => {
    const resolved = resolve(widgetAssembly, widgetDomain(MILLIMETRE_UNITS, widgetDef));
    const result = exportGlb({ resolved, palette: PALETTE, asset: ASSET });
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
    expect(glb.json.nodes[0]!.extras).toMatchObject({ assembly: { metresPerUnit: 0.001 } });
  });

  it('insets the cap of an exported box by the domain bevel', () => {
    const resolved = resolve(widgetAssembly, widgetDomain(MILLIMETRE_UNITS, widgetDef));
    const result = exportGlb({ resolved, palette: PALETTE, asset: ASSET });
    if (!result.ok) {
      throw new Error(JSON.stringify(result.error));
    }
    const glb = readGlb(result.glb);
    const part = glb.json.nodes.find((node) => node.extras?.part === 'widget')!;
    const positions = glb.floats(glb.json.meshes[part.mesh!]!.primitives[0]!.attributes.POSITION);
    // Vertices on the top cap (z at its maximum): the cap's widest x is the half-width less the bevel.
    const top = Math.max(...positions.filter((_, i) => i % 3 === 2));
    const capX = positions.filter((_, i) => i % 3 === 0 && positions[i + 2] === top).map(Math.abs);
    expect(Math.max(...capX)).toBeCloseTo((1 - MILLIMETRE_UNITS.bevel) * MILLIMETRE_UNITS.metresPerUnit, 8);
  });

  it('takes the largest gap between connected solids from the domain grid', () => {
    const contactIssues = (units: DomainUnits) =>
      validate(pairAssembly, gappedPair(units, 0.1)).issues.filter((issue) => issue.rule === 'connection-contact');
    expect(contactIssues({ ...MILLIMETRE_UNITS, grid: 0.25 })).toEqual([]);
    expect(contactIssues({ ...MILLIMETRE_UNITS, grid: 0.05 })).toHaveLength(1);
  });
});
