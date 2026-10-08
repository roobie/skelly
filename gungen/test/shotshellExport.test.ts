import validator from 'gltf-validator';
import { Box3, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import type { Shotshell } from '../src/ammo/cartridge.ts';
import { srgbToLinear } from '../src/core/glb.ts';
import { exportCartridgeModels } from '../src/gun/cartridgeExport.ts';
import { METRES_PER_UNIT } from '../src/gun/exportFrame.ts';
import { shotshellGeometry, shotshellHullColor } from '../src/gun/shotshellGeometry.ts';
import { buildAmmoMeshes } from '../src/viewer/ammoLayer.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';
import { readGlb } from './glbReader.ts';

const shell = loadCartridgeFile('12-gauge-00-buck.json') as Shotshell;
const exported = () => {
  const result = exportCartridgeModels(shell);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }
  return result.models;
};
const parse = (bytes: Uint8Array) => new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');

describe('shotshell cartridge export', () => {
  it('exports source loaded/fired lengths and rim in metres through the common model contract', async () => {
    const before = JSON.stringify(shell);
    const models = exported();
    const entries = [
      ['round', shell.length.loaded.value!],
      ['case', shell.length.nominal.value!],
    ] as const;
    const checks = await Promise.all(
      entries.map(async ([kind, length]) => ({
        kind,
        length,
        scene: (await parse(models[kind].glb)).scene,
        report: await validator.validateBytes(models[kind].glb),
      })),
    );
    for (const { kind, length, scene, report } of checks) {
      const model = models[kind];
      const assetId = shell.id.replaceAll('-', '_h_');
      expect(model.modelEntry).toEqual({
        id: `${kind}_${assetId}`,
        file: `assets/models/${kind}-${assetId}.glb`,
        calibre: shell.id,
      });
      const bounds = new Box3().setFromObject(scene);
      expect(bounds.min.x).toBeCloseTo(0, 8);
      expect(bounds.getSize(new Vector3()).toArray()).toEqual([
        expect.closeTo(length / 1000, 7),
        expect.closeTo(shell.head.rimDiameter.value! / 1000, 7),
        expect.closeTo(shell.head.rimDiameter.value! / 1000, 7),
      ]);
      expect(report.issues.numErrors).toBe(0);
      expect(report.issues.numWarnings).toBe(0);
    }
    expect(shell.closure.value).toBeNull();
    expect(JSON.stringify(shell)).toBe(before);
  });

  it('leaves the fired mouth open but closes the loaded roll proxy with an inset card', async () => {
    const models = exported();
    const ray = new Raycaster(new Vector3(0.1, 0, 0), new Vector3(-1, 0, 0));
    const hits: number[] = [];
    const scenes = await Promise.all([models.round, models.case].map((model) => parse(model.glb)));
    for (const { scene } of scenes) {
      scene.updateMatrixWorld(true);
      const [hit] = ray.intersectObject(scene, true);
      expect(hit).toBeDefined();
      hits.push(hit!.point.x);
    }
    expect(hits[0]).toBeGreaterThan(0);
    expect(hits[0]).toBeLessThan(shell.length.loaded.value! / 1000);
    expect(hits[1]).toBeCloseTo(shell.head.height.value! / 1000, 7);
  });

  it('selects the cited hull colour rather than hardcoding red on the export path', () => {
    const blue: Shotshell = {
      ...shell,
      hull: { ...shell.hull, colors: [{ ...shell.hull.colors[0]!, value: 'blue' }] },
    };
    const result = exportCartridgeModels(blue);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { json } = readGlb(result.models.round.glb);
    const hull = json.meshes[0]!.primitives.find((primitive) => primitive.extras?.solid === 'hull')!;
    expect(json.materials[hull.material]!.pbrMetallicRoughness.baseColorFactor.slice(0, 3)).toEqual(
      shotshellHullColor(blue).map(srgbToLinear),
    );
  });

  it('uses star-fold leaves when closure is known, not the unknown-closure roll proxy', () => {
    const folded: Shotshell = { ...shell, closure: { ...shell.closure, value: 'fold-crimp' } };
    const geometry = shotshellGeometry(folded);
    expect(geometry.round.filter((solid) => solid.kind === 'extruded-polygon').length).toBeGreaterThan(0);
    expect(geometry.case.map((solid) => solid.id)).toEqual(['head', 'hull']);
  });

  it('keeps viewer loaded and fired geometry aligned with their corresponding GLBs', async () => {
    const view = buildAmmoMeshes(shell, 'brass', new Texture(), 96);
    const models = exported();
    const pairs = [
      [view.loose, models.round, view.lengthUnits],
      [view.fired, models.case, view.caseLengthUnits],
    ] as const;
    const checks = await Promise.all(
      pairs.map(async ([group, model, lengthUnits]) => ({
        group,
        lengthUnits,
        scene: (await parse(model.glb)).scene,
      })),
    );
    for (const { group, lengthUnits, scene } of checks) {
      const viewSize = new Box3().setFromObject(group).getSize(new Vector3()).multiplyScalar(METRES_PER_UNIT);
      const exportSize = new Box3().setFromObject(scene).getSize(new Vector3());
      expect(viewSize.distanceTo(exportSize)).toBeLessThan(1e-8);
      expect(viewSize.x).toBeCloseTo(lengthUnits * METRES_PER_UNIT, 7);
    }
  });
});
