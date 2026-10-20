import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { applyModelMaterials } from '../src/render/modelMaterials.ts';

const table = {
  fixture: {
    colour: [0.8, 0.4, 0.2] as [number, number, number],
    finish: { metallic: 0.3, roughness: 0.6 },
    densityKgPerM3: 1000,
    source: 'fixture',
  },
};

it('resolves exported material references from shared content without losing the authored shade', () => {
  const material = new MeshStandardMaterial({ color: 0xff_ff_ff, roughness: 1, metalness: 0 });
  material.userData = { materialId: 'fixture', colourMultiplier: [0.5, 1, 0.25] };
  const scene = new Group().add(new Mesh(new BoxGeometry(), material));
  applyModelMaterials(scene, table);
  const srgbToLinear = (value: number) => (value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  expect(material.color.r).toBeCloseTo(srgbToLinear(0.4));
  expect(material.color.g).toBeCloseTo(srgbToLinear(0.4));
  expect(material.color.b).toBeCloseTo(srgbToLinear(0.05));
  expect(material.metalness).toBe(table.fixture.finish.metallic);
  expect(material.roughness).toBe(table.fixture.finish.roughness);
  const before = material.color.clone();
  applyModelMaterials(scene, table);
  expect(material.color).toEqual(before);
});

describe('material reference validation', () => {
  it('rejects unknown material IDs and malformed colour multipliers', () => {
    for (const metadata of [
      { materialId: 'unknown', colourMultiplier: [1, 1, 1] },
      { materialId: 'fixture', colourMultiplier: [1, 1] },
      { materialId: 'fixture' },
      { colourMultiplier: [1, 1, 1] },
    ]) {
      const material = new MeshStandardMaterial();
      material.userData = metadata;
      expect(() => applyModelMaterials(new Group().add(new Mesh(new BoxGeometry(), material)), table)).toThrow();
    }
  });
});
