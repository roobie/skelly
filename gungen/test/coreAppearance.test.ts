import { describe, expect, it } from 'vitest';
import type { GlbAssetIdentity, Palette, SelectedAnchors } from '../src/core/design.ts';
import { exportGlb } from '../src/core/glb.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Domain, PartDef } from '../src/core/schema.ts';
import { GUN_UNITS } from '../src/gun/units.ts';
import { readGlb } from './glbReader.ts';

const ASSET: GlbAssetIdentity = { id: 'widget', file: 'assets/models/widget.glb' };
const ANCHORS: SelectedAnchors = { hold: { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] }, others: {} };
const box = (id: string) => ({
  id,
  kind: 'box' as const,
  box: { center: [0, 0, 0] as const, half: [1, 1, 1] as const },
});
const legacyPalette: Palette = {
  familyColors: { widget: [0.2, 0.3, 0.4] },
  specialColors: {},
  fallbackColor: [0.5, 0.5, 0.5],
};
const exportWidget = (def: PartDef, colors: Palette = legacyPalette) => {
  const domain: Domain = {
    name: 'widget-domain',
    families: { widget: { name: 'widget', params: {}, build: () => def } },
    axisRules: [],
    units: GUN_UNITS,
  };
  const assembly = { name: 'renamed-widget', root: 'widget', parts: { widget: { family: 'widget' } }, connections: [] };
  const resolved = resolve(assembly, domain);
  if (resolved.issues.length > 0) {
    throw new Error(`widget assembly is invalid: ${JSON.stringify(resolved.issues)}`);
  }
  const result = exportGlb({ resolved, anchors: ANCHORS, palette: colors, asset: ASSET });
  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }
  return readGlb(result.glb);
};
const widgetDef = (overrides: Partial<PartDef> = {}): PartDef => ({
  family: 'widget',
  solids: [box('body')],
  ports: [],
  keepOuts: [],
  axes: [],
  ...overrides,
});
const widgetNode = (glb: ReturnType<typeof readGlb>) => glb.json.nodes.find((node) => node.extras?.part === 'widget')!;
const primitiveBySolid = (glb: ReturnType<typeof readGlb>, id: string) => {
  const node = widgetNode(glb);
  return glb.json.meshes[node.mesh!]!.primitives.find((primitive) => primitive.extras?.solid === id)!;
};

describe('domain-agnostic core appearance', () => {
  it('exports a real non-gun widget with a colour-only palette and no invented gun metadata', () => {
    const glb = exportWidget(widgetDef());
    expect(widgetNode(glb).extras).not.toHaveProperty('material');
    expect(widgetNode(glb).extras).not.toHaveProperty('slot');
    expect(primitiveBySolid(glb, 'body').extras).not.toHaveProperty('material');
    expect(primitiveBySolid(glb, 'body').extras).not.toHaveProperty('slot');
  });

  it('keeps part-node material part-scoped and solid material on primitives regardless of solid order', () => {
    const palette: Palette = {
      ...legacyPalette,
      materials: { 'own-coat': [1, 0, 0], 'pad-coat': [0, 0, 0] },
      roleSlots: { widget: 'surface' },
      roleMaterials: { widget: 'own-coat' },
    };
    const pad = { ...box('pad'), material: 'pad-coat', slot: 'accent' };
    const body = box('body');
    const orderings = [
      exportWidget(widgetDef({ material: 'own-coat', slot: 'surface', solids: [pad, body] }), palette),
      exportWidget(widgetDef({ material: 'own-coat', slot: 'surface', solids: [body, pad] }), palette),
    ];
    for (const glb of orderings) {
      expect(widgetNode(glb).extras).toMatchObject({ material: 'own-coat', slot: 'surface' });
      expect(primitiveBySolid(glb, 'pad').extras).toMatchObject({ material: 'pad-coat', slot: 'accent' });
      expect(primitiveBySolid(glb, 'body').extras).toMatchObject({ material: 'own-coat', slot: 'surface' });
    }
    const firstNode = orderings[0]!.json.nodes.find((node) => node.extras?.part === 'widget')!.extras;
    const secondNode = orderings[1]!.json.nodes.find((node) => node.extras?.part === 'widget')!.extras;
    expect(firstNode?.material).toBe(secondNode?.material);
    expect(firstNode?.slot).toBe(secondNode?.slot);
  });
});
