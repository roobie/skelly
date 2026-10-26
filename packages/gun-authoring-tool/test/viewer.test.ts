import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { MAIN_AXIS } from '@skelly/engine/foundation/conventions.ts';
import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import type { Palette } from '@skelly/thing-export/exportTypes.ts';
import { buildLayers as buildToolLayers } from '@skelly/tool-ui/scene';
import { threeRuntime } from '@skelly/tool-ui/three-runtime';
import type { Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { GUN_PALETTE } from '../src/gun/palette.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { GUN_UNITS } from '../src/gun/units.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { loadFixture } from './helpers.ts';

describe('viewer geometry', () => {
  // Builds viewer representations for the authored design corpus.
  it('defaults to archetype finishes and preserves role colours as a geometry-check mode', () => {
    const report = validate(loadFixture('archetype-ar'), gunDomain);
    const finish = buildLayers(report, [], 'finish', { appearanceProfile: 'ar' });
    const override = buildLayers(report, [], 'finish', {
      appearanceProfile: 'ar',
      finish: { furniture: 'polymer-fde' },
    });
    const role = buildLayers(report, [], 'role', { appearanceProfile: 'ar' });
    try {
      const colorOfStock = (layers: typeof finish) => {
        const mesh = layers.solids.children.find((child) =>
          String(child.userData.label).includes('stock (stock)'),
        ) as Mesh;
        const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial;
        return material.color.getHex();
      };
      expect(colorOfStock(finish)).not.toBe(colorOfStock(role));
      expect(colorOfStock(override)).not.toBe(colorOfStock(finish));
    } finally {
      for (const group of Object.values(finish)) {
        disposeGroup(group);
      }
      for (const group of Object.values(override)) {
        disposeGroup(group);
      }
      for (const group of Object.values(role)) {
        disposeGroup(group);
      }
    }
  });

  it('uses the curated AWM finish with its independent mechanical template on the viewer path', () => {
    const text = readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-awm.json'), 'utf8');
    const loaded = loadGunDesign(text);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    const template = TEMPLATES.find((candidate) => candidate.name === loaded.design.template);
    const report = validate(loaded.design.assembly, gunDomain);
    const layers = buildLayers(report, [], 'finish', {
      ...(template ? { appearanceProfile: template.name } : {}),
      ...(loaded.design.finish ? { finish: loaded.design.finish } : {}),
    });
    const role = buildLayers(report, [], 'role');
    try {
      const stock = layers.solids.children.find((child) => String(child.userData.label).startsWith('stock (')) as Mesh;
      const roleStock = role.solids.children.find((child) =>
        String(child.userData.label).startsWith('stock ('),
      ) as Mesh;
      expect((stock.material as MeshStandardMaterial).color.getHex()).not.toBe(
        (roleStock.material as MeshStandardMaterial).color.getHex(),
      );
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
      for (const group of Object.values(role)) {
        disposeGroup(group);
      }
    }
  });

  it('draws a see-through, sheened finish as glass and keeps diagnostic colouring opaque', () => {
    const palette = {
      ...GUN_PALETTE,
      materials: {
        ...GUN_PALETTE.materials,
        'fixture-glass': {
          colour: [0.2, 0.2, 0.2],
          finish: { metallic: 0, roughness: 0.1, opacity: 0.5, sheen: { colour: [1, 0.5, 0], roughness: 0.4 } },
        },
      },
    } satisfies Palette;
    const pane: Solid = {
      id: 'pane',
      kind: 'box',
      box: { center: [0, 0, 0], half: [1, 1, 1] },
      material: 'fixture-glass',
    };
    const family = { family: 'pane', solids: [pane], ports: [], keepOuts: [], axes: [] };
    const resolved = resolve(
      { name: 'glass-pane', root: 'pane', parts: { pane: { family: 'pane' } }, connections: [] },
      {
        name: 'glass-pane',
        families: { pane: { name: 'pane', params: {}, build: () => family } },
        axisRules: [],
        units: GUN_UNITS,
      },
    );
    const materialIn = (mode: 'finish' | 'role') => {
      const layers = buildToolLayers({ ok: true, resolved, issues: [] }, [], palette, threeRuntime, MAIN_AXIS, mode);
      const material = (layers.solids.children[0] as Mesh).material as MeshPhysicalMaterial;
      const { type, opacity, transparent, depthWrite, sheen } = material;
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
      return { type, opacity, transparent, depthWrite, sheen };
    };
    expect(materialIn('finish')).toEqual({
      type: 'MeshPhysicalMaterial',
      opacity: 0.5,
      transparent: true,
      depthWrite: false,
      sheen: 1,
    });
    expect(materialIn('role')).toMatchObject({ type: 'MeshStandardMaterial', opacity: 1, transparent: false });
  });

  it('renders a view-only pump action-open pose by moving the carrier and forend together', () => {
    const report = validate(loadFixture('archetype-pump-shotgun'), gunDomain);
    const travel = report.resolved.defs.get('bolt-carrier')?.motion?.end[0] ?? 0;
    const offsets = new Map<string, Vec3>([
      ['bolt-carrier', [-travel, 0, 0]],
      ['forend', [-travel, 0, 0]],
    ]);
    const rest = buildLayers(report, []);
    const open = buildLayers(report, [], 'finish', {}, undefined, offsets);
    try {
      const xOf = (layers: typeof rest, part: string) => {
        const mesh = layers.solids.children.find((child) => String(child.userData.label).startsWith(`${part} (`));
        if (!mesh) {
          throw new Error(`missing ${part} mesh`);
        }
        return mesh.matrix.elements[12];
      };
      expect(travel).toBeGreaterThan(0);
      for (const part of ['bolt-carrier', 'forend']) {
        expect(xOf(open, part)).toBe(xOf(rest, part) - travel);
      }
      expect(report.ok).toBe(true);
    } finally {
      for (const group of Object.values(rest)) {
        disposeGroup(group);
      }
      for (const group of Object.values(open)) {
        disposeGroup(group);
      }
    }
  });
});
