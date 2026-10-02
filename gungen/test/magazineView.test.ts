import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Group, InstancedMesh, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import { validate } from '../src/core/validate.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
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
    expect(detached!.group.children).toHaveLength(2);
    const rounds = detached!.group.children.find(
      (child) => child instanceof Group && child.children.some((inner) => inner instanceof InstancedMesh),
    ) as Group;
    const instances = rounds.children.filter((child) => child instanceof InstancedMesh) as InstancedMesh[];
    expect(instances).toHaveLength(3);
    expect(instances.every((mesh) => mesh.count === detached!.capacity)).toBe(true);
  });
});
