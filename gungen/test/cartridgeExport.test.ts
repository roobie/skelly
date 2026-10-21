import { MATERIALS } from '@skelly/thing-core/materials';
import { srgbToLinear } from '@skelly/thing-export/glb.ts';
import validator from 'gltf-validator';
import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { exportCartridgeModel, exportCartridgeModels } from '../src/gun/cartridgeExport.ts';
import { GUN_APPEARANCE } from '../src/gun/palette.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';

const cartridge: MetallicCartridge = {
  ...(loadCartridgeFile('7.62x39.json') as MetallicCartridge),
  id: 'fixture.7-62_case',
};

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
    for (const slot of ['case', 'bullet', 'primer'] as const) {
      expect(defaultBySolid.get(slot)).toMatchObject({ slot, material: GUN_APPEARANCE.cartridgeFinish[slot]! });
    }

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
      MATERIALS.lead!.colour.map(srgbToLinear),
    );
  });

  it('honours an explicit identity when exporting one cartridge component', () => {
    const asset = { id: 'fixture_alias', file: 'assets/models/fixture_alias.glb' };
    const result = exportCartridgeModel(cartridge, 'case', asset);
    if (!result.ok) {
      throw new Error(JSON.stringify(result.error));
    }
    expect(result.model.modelEntry).toEqual({ ...asset, gun: { calibre: cartridge.id } });
  });

  it('exports real-scale round and fired-case entries using the source calibre id', async () => {
    const result = exportCartridgeModels(cartridge);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { round, case: firedCase } = result.models;
    expect(round.modelEntry).toMatchObject({
      id: 'round_fixture_d_7_h_62_u_case',
      file: `assets/models/${round.modelEntry.id}.glb`,
      gun: { calibre: cartridge.id },
    });
    expect(round.modelEntry.grip).toBeUndefined();
    expect(firedCase.modelEntry).toMatchObject({
      id: 'case_fixture_d_7_h_62_u_case',
      file: `assets/models/${firedCase.modelEntry.id}.glb`,
      gun: { calibre: cartridge.id },
    });

    const gltf = glbJson(round.glb);
    const accessors = (gltf.accessors as { readonly min?: number[]; readonly max?: number[] }[]).filter(
      (accessor) => accessor.min?.length === 3 && accessor.max?.length === 3,
    );
    const bounds = [0, 1, 2].map((axis) => ({
      min: Math.min(...accessors.map((accessor) => accessor.min![axis]!)),
      max: Math.max(...accessors.map((accessor) => accessor.max![axis]!)),
    }));
    expect(bounds[0]!.max - bounds[0]!.min).toBeCloseTo(cartridge.overallLength.typical.value! * 0.001, 4);
    expect(bounds[1]!.max - bounds[1]!.min).toBeCloseTo(cartridge.case.rim.diameter.value! * 0.001, 4);
    expect(bounds[2]!.max - bounds[2]!.min).toBeCloseTo(cartridge.case.rim.diameter.value! * 0.001, 4);

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
