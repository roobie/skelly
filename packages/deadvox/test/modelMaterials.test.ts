import { MATERIALS } from '@skelly/thing-core/materials';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { applyModelMaterials } from '../src/render/modelMaterials.ts';
import { prepareModel } from '../src/render/models.ts';

const table = {
  fixture: {
    colour: [0.8, 0.4, 0.2] as [number, number, number],
    finish: { metallic: 0.3, roughness: 0.6 },
  },
};

it('prepares exported material references from shared content without losing the authored shade', () => {
  const [reference] = Object.entries(MATERIALS);
  if (!reference) {
    throw new Error('The shared material table has no fixture candidate');
  }
  const [materialId, definition] = reference;
  const material = new MeshStandardMaterial({
    color: 0xff_ff_ff,
    roughness: definition.finish.roughness === 0 ? 1 : 0,
    metalness: definition.finish.metallic === 0 ? 1 : 0,
  });
  const colourMultiplier = [0.5, 1, 0.25];
  material.userData = { materialId, colourMultiplier };
  const scene = new Group().add(new Mesh(new BoxGeometry(), material));
  prepareModel(
    { id: 'fixture', file: 'assets/models/fixture.glb', parts: { body: { massKg: 1, centreOfMass: [0, 0, 0] } } },
    scene,
  );
  const srgbToLinear = (value: number) => (value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  for (const [index, channel] of material.color.toArray().entries()) {
    expect(channel).toBeCloseTo(srgbToLinear(definition.colour[index]! * colourMultiplier[index]!));
  }
  expect(material.metalness).toBe(definition.finish.metallic);
  expect(material.roughness).toBe(definition.finish.roughness);
  const before = material.color.clone();
  applyModelMaterials(scene, MATERIALS);
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
