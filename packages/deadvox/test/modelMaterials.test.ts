import { MATERIALS } from '@skelly/thing-core/materials';
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { glowingCopy } from '../src/render/itemEmissive.ts';
import { applyModelMaterials, modelMaterialWarmUp } from '../src/render/modelMaterials.ts';
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

it('warm-up stand-ins share a program with every model material a scene can draw, lit or not', () => {
  const tableWithGlass = {
    ...table,
    glass: {
      colour: [0.6, 0.7, 0.8] as [number, number, number],
      finish: { metallic: 0, roughness: 0.1, opacity: 0.35 },
    },
  };
  // The parts of a model mesh three.js keys its program on that a material table or a glow can vary.
  const programKey = (mesh: Mesh) => {
    const material = mesh.material as MeshStandardMaterial;
    return [
      material.transparent,
      material.toneMapped,
      mesh instanceof InstancedMesh,
      mesh.geometry.hasAttribute('normal'),
    ].join();
  };
  for (const instanced of [false, true]) {
    const warm = modelMaterialWarmUp(instanced, tableWithGlass).children as Mesh[];
    expect(warm.every((mesh) => !mesh.visible)).toBe(true);
    const warmed = new Set(warm.map(programKey));
    for (const materialId of Object.keys(tableWithGlass)) {
      const material = new MeshStandardMaterial();
      material.userData = { materialId, colourMultiplier: [1, 1, 1] };
      applyModelMaterials(new Group().add(new Mesh(new BoxGeometry(), material)), tableWithGlass);
      for (const drawn of [material, glowingCopy(material, 0xff_00_00, 2)]) {
        const meshes = [new Mesh(new BoxGeometry(), drawn)];
        if (instanced) {
          meshes.push(new InstancedMesh(new BoxGeometry(), drawn, 2));
        }
        for (const mesh of meshes) {
          expect(warmed).toContain(programKey(mesh));
        }
      }
    }
  }
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
