import validator from 'gltf-validator';
import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { srgbToLinear } from '../src/core/glb.ts';
import { exportCartridgeModels } from '../src/gun/cartridgeExport.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';

const cartridge = loadCartridgeFile('7.62x39.json') as MetallicCartridge;

const glbJson = (bytes: Uint8Array): Record<string, unknown> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength))) as Record<string, unknown>;
};

describe('standalone cartridge GLBs', () => {
  it('routes case, bullet, and primer finish overrides to their GLB materials', () => {
    const result = exportCartridgeModels(cartridge, {
      finish: { case: 'steel', bullet: 'lead', primer: 'brass' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const defaults = exportCartridgeModels(cartridge);
    expect(defaults.ok).toBe(true);
    if (!defaults.ok) {
      return;
    }
    expect(defaults.models.round.glb).not.toEqual(result.models.round.glb);
    const defaultGltf = glbJson(defaults.models.round.glb);
    const defaultPrimitives = (defaultGltf.meshes as { primitives: { extras: Record<string, string> }[] }[])[0]!
      .primitives;
    const defaultBySolid = new Map(defaultPrimitives.map(({ extras }) => [extras.solid!, extras]));
    expect(defaultBySolid.get('case')).toMatchObject({ slot: 'case', material: 'brass' });
    expect(defaultBySolid.get('bullet')).toMatchObject({ slot: 'bullet', material: 'copper' });
    expect(defaultBySolid.get('primer')).toMatchObject({ slot: 'primer', material: 'brass' });

    const gltf = glbJson(result.models.round.glb);
    const primitiveMaterials = (
      gltf.meshes as { primitives: { material: number; extras: Record<string, string> }[] }[]
    )[0]!.primitives;
    const bySolid = new Map(primitiveMaterials.map(({ material, extras }) => [extras.solid!, { material, extras }]));

    expect(bySolid.get('case')?.extras).toMatchObject({ slot: 'case', material: 'steel' });
    expect(bySolid.get('bullet')?.extras).toMatchObject({ slot: 'bullet', material: 'lead' });
    expect(bySolid.get('primer')?.extras).toMatchObject({ slot: 'primer', material: 'brass' });
    const bulletMaterial = (gltf.materials as { pbrMetallicRoughness: { baseColorFactor: number[] } }[])[
      bySolid.get('bullet')!.material
    ]!;
    expect(bulletMaterial.pbrMetallicRoughness.baseColorFactor.slice(0, 3)).toEqual(
      [0.38, 0.4, 0.42].map(srgbToLinear),
    );
  });

  it('exports real-scale round and fired-case entries using the source calibre id', async () => {
    const result = exportCartridgeModels(cartridge);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { round, case: firedCase } = result.models;
    expect(round.modelEntry).toMatchObject({
      id: 'round_7_d_62x39',
      file: 'assets/models/round-7_d_62x39.glb',
      calibre: '7.62x39',
    });
    expect(round.modelEntry.grip).toBeUndefined();
    expect(firedCase.modelEntry).toMatchObject({
      id: 'case_7_d_62x39',
      file: 'assets/models/case-7_d_62x39.glb',
      calibre: '7.62x39',
    });

    const gltf = glbJson(round.glb);
    const accessors = (gltf.accessors as { readonly min?: number[]; readonly max?: number[] }[]).filter(
      (accessor) => accessor.min?.length === 3 && accessor.max?.length === 3,
    );
    const bounds = [0, 1, 2].map((axis) => ({
      min: Math.min(...accessors.map((accessor) => accessor.min![axis]!)),
      max: Math.max(...accessors.map((accessor) => accessor.max![axis]!)),
    }));
    expect(bounds[0]!.max - bounds[0]!.min).toBeCloseTo(0.056, 4);
    expect(bounds[1]!.max - bounds[1]!.min).toBeCloseTo(0.011_35, 4);
    expect(bounds[2]!.max - bounds[2]!.min).toBeCloseTo(0.011_35, 4);

    const validations = await Promise.all(
      Object.entries({ round, case: firedCase }).map(async ([name, model]) => ({
        name,
        report: await validator.validateBytes(model.glb, { uri: `${name}.glb` }),
      })),
    );
    for (const { name, report } of validations) {
      expect(report.issues.numErrors, name).toBe(0);
      expect(report.issues.numWarnings, name).toBe(0);
    }
  });
});
