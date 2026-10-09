import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Vec3 } from '@skelly/engine/core/math.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import type { Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { loadFixture } from './helpers.ts';

describe('viewer geometry', () => {
  // Builds viewer representations for the authored design corpus.
  it('defaults to archetype finishes and preserves role colours as a geometry-check mode', { timeout: 10_000 }, () => {
    const report = validate(loadFixture('archetype-ar'), gunDomain);
    const finish = buildLayers(report, [], 'finish', { variant: 'ar' });
    const override = buildLayers(report, [], 'finish', { variant: 'ar', finish: { furniture: 'polymer-fde' } });
    const role = buildLayers(report, [], 'role', { variant: 'ar' });
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
      ...(template ? { variant: template.name } : {}),
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
