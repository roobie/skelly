import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import type { GlbAssetIdentity, Palette } from '@skelly/engine/export/exportTypes.ts';
import { exportGlb } from '@skelly/engine/export/glb.ts';
import { describe, expect, it } from 'vitest';
import { GUN_UNITS } from '../src/gun/units.ts';
import { readGlb } from './glbReader.ts';

const ASSET: GlbAssetIdentity = { id: 'widget', file: 'assets/models/widget.glb' };
const box = (id: string) => ({
  id,
  kind: 'box' as const,
  box: { center: [0, 0, 0] as const, half: [1, 1, 1] as const },
});
const legacyPalette: Palette = {
  familyColors: { widget: [0.2, 0.3, 0.4] },
  specialColors: {},
  fallbackColor: [0.5, 0.5, 0.5],
  fallbackFinish: { metallic: 0, roughness: 0.85 },
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
  const result = exportGlb({ resolved, palette: colors, asset: ASSET });
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

  it('refuses out-of-range or nonfinite material finishes before writing a GLB', () => {
    for (const roughness of [-1, 2, Number.NaN]) {
      expect(() =>
        exportWidget(widgetDef(), {
          ...legacyPalette,
          fallbackFinish: { metallic: 0, roughness },
        }),
      ).toThrow('invalid-palette-finish');
    }
  });

  it('keeps equal-colour materials distinct by identity and finish', () => {
    const palette: Palette = {
      ...legacyPalette,
      materials: {
        'fixture-paint': { colour: [0.2, 0.3, 0.4], finish: { metallic: 0, roughness: 0.8 } },
        'fixture-metal': { colour: [0.2, 0.3, 0.4], finish: { metallic: 0.9, roughness: 0.2 } },
      },
    };
    const exported = exportWidget(
      widgetDef({
        solids: [
          { ...box('body'), material: 'fixture-paint' },
          { ...box('pad'), material: 'fixture-metal' },
        ],
      }),
      palette,
    );
    const first = primitiveBySolid(exported, 'body').material;
    const second = primitiveBySolid(exported, 'pad').material;
    expect(first).not.toBe(second);
    expect(exported.json.materials[first]).toMatchObject({
      extras: { materialId: 'fixture-paint', colourMultiplier: [1, 1, 1] },
      pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 },
    });
    expect(exported.json.materials[second]).toMatchObject({
      extras: { materialId: 'fixture-metal' },
      pbrMetallicRoughness: { metallicFactor: 0.9, roughnessFactor: 0.2 },
    });
  });

  it('keeps part-node material part-scoped and solid material on primitives regardless of solid order', () => {
    const palette: Palette = {
      ...legacyPalette,
      materials: {
        'own-coat': { colour: [1, 0, 0], finish: { metallic: 0.2, roughness: 0.4 } },
        'pad-coat': { colour: [0, 0, 0], finish: { metallic: 0, roughness: 0.6 } },
      },
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
