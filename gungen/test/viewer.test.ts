import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { loadFixture } from './helpers.ts';

describe('viewer geometry', () => {
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
