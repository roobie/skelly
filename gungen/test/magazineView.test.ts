import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Group, InstancedMesh, Matrix4, Mesh, Texture, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { validate } from '../src/core/validate.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { magazineRoundColumn } from '../src/gun/magazineGeometry.ts';
import { buildAmmoMeshes } from '../src/viewer/ammoLayer.ts';
import { buildDetachedMagazine } from '../src/viewer/magazineView.ts';
import { buildLayers } from '../src/viewer/scene.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';

const designPath = join(import.meta.dirname, '..', 'designs', 'archetype-ak.json');
const cartridge = loadCartridgeFile('7.62x39.json') as MetallicCartridge;

describe('detached magazine viewer', () => {
  it('shows a translucent shell and instanced rounds fitted to the generated magazine', () => {
    const loaded = loadGunDesign(readFileSync(designPath, 'utf8'));
    if (!loaded.ok) {
      throw new Error(loaded.error.message);
    }
    const report = validate(loaded.design.assembly, gunDomain);
    const layers = buildLayers(report, report.issues, 'finish', { variant: 'ak' }, 8);
    const ammo = buildAmmoMeshes(cartridge, 'steel', new Texture(), 8);
    const detached = buildDetachedMagazine(report, layers.solids, cartridge, ammo);
    expect(detached).toBeDefined();
    expect(detached!.capacity).toBeGreaterThan(0);
    const shell = detached!.group.children.find((child) => child instanceof Group && child.children.length > 0);
    const rounds = detached!.group.children.find(
      (child) => child instanceof Group && child.children.some((inner) => inner instanceof InstancedMesh),
    ) as Group | undefined;
    expect(shell).toBeDefined();
    expect(rounds).toBeDefined();
    const instances = rounds!.children.filter((child) => child instanceof InstancedMesh) as InstancedMesh[];
    const ammoParts = ammo.loose.children.filter((child) => child instanceof Mesh);
    expect(instances).toHaveLength(ammoParts.length);
    expect(instances.every((mesh) => mesh.count === detached!.capacity)).toBe(true);

    const caseGeometry = instances[0]!.geometry;
    caseGeometry.computeBoundingBox();
    const caseExtents = caseGeometry.boundingBox!.getSize(new Vector3());
    expect(caseExtents.x).toBeCloseTo(ammo.caseLengthUnits, 6);
    expect(caseExtents.y).toBeCloseTo(ammo.headDiameterUnits, 6);
    expect(caseExtents.z).toBeCloseTo(ammo.headDiameterUnits, 6);

    const magazineEntry = [...report.resolved.placed.keys()].find(
      (part) => report.resolved.defs.get(part)?.family === 'magazine',
    )!;
    const magazineDef = report.resolved.defs.get(magazineEntry)!;
    const params = Object.fromEntries(
      Object.entries(report.resolved.params.get(magazineEntry) ?? {}).map(([key, param]) => [key, param.value]),
    );
    const { column } = magazineRoundColumn(
      magazineDef.displaySolids ?? magazineDef.solids,
      cartridge,
      params,
      magazineDef.solids,
    );
    const firstRound = column.rounds[0]!;
    const instanceTransform = new Matrix4();
    instances[0]!.getMatrixAt(0, instanceTransform);
    const { elements } = instanceTransform;
    expect(elements[12]).toBeCloseTo(firstRound.position[0], 6);
    expect(elements[13]).toBeCloseTo(firstRound.position[1], 6);
    expect(elements[14]).toBeCloseTo(firstRound.z, 6);
    expect(elements[0]).toBeCloseTo(Math.cos(firstRound.angle), 6);
    expect(elements[1]).toBeCloseTo(Math.sin(firstRound.angle), 6);
  });
});
