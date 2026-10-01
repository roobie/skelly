import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mesh, type MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/core/validate.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { loadFixture } from './helpers.ts';

describe('viewer geometry', () => {
  // Measured about 1.5 s on a loaded host (load 4-10), too much of vitest's 5 s default; the explicit timeout, about 5x that, keeps it from flaking under load.
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
    const layers = buildLayers(validate(loaded.design.assembly, gunDomain), [], 'finish', {
      ...(template ? { variant: template.name } : {}),
      ...(loaded.design.finish ? { finish: loaded.design.finish } : {}),
    });
    try {
      const stock = layers.solids.children.find((child) => String(child.userData.label).startsWith('stock (')) as Mesh;
      expect((stock.material as MeshStandardMaterial).color.getHex()).toBe(0x4b_58_36);
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
  });

  it('renders the beveled grip as one chamfered mesh (its five-vertex profile: 12*5-4 = 56 triangles)', () => {
    const layers = buildLayers(validate(loadFixture('archetype-battle-rifle'), gunDomain), []);
    try {
      const grip = layers.solids.children.find((child) =>
        String(child.userData.label).includes('grip (grip) · solid body'),
      );
      expect(grip).toBeInstanceOf(Mesh);
      const { geometry } = grip as Mesh;
      expect(geometry.type).toBe('BufferGeometry');
      expect(geometry.getIndex()?.count).toBe(56 * 3);
    } finally {
      for (const group of Object.values(layers)) {
        disposeGroup(group);
      }
    }
  });
});
