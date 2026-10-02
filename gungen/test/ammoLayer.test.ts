import { Mesh, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { buildAmmoMeshes, caseFinishFromQuery } from '../src/viewer/ammoLayer.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';

const cartridge = loadCartridgeFile('7.62x39.json') as MetallicCartridge;

describe('viewer ammunition orientation', () => {
  it('defaults the case finish to brass and supports a steel-case selection', () => {
    expect(caseFinishFromQuery(null)).toBe('brass');
    expect(caseFinishFromQuery('steel')).toBe('steel');
  });

  it('places cartridge length along local +X like exported revolved solids', () => {
    const ammo = buildAmmoMeshes(cartridge, 'brass', new Texture());
    const meshes = ammo.loose.children.filter((child): child is Mesh => child instanceof Mesh);
    const bounds = meshes.map((mesh) => {
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox!;
    });
    const min = [0, 1, 2].map((axis) => Math.min(...bounds.map((box) => box.min.getComponent(axis))));
    const max = [0, 1, 2].map((axis) => Math.max(...bounds.map((box) => box.max.getComponent(axis))));
    const dimensions = max.map((value, axis) => value - min[axis]!);

    expect(dimensions[0]).toBeCloseTo(ammo.lengthUnits, 6);
    expect(dimensions[1]).toBeCloseTo(ammo.headDiameterUnits, 6);
    expect(dimensions[2]).toBeCloseTo(ammo.headDiameterUnits, 6);
  });
});
