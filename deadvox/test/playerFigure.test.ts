import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Matrix4, type Mesh, type MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { makeScale } from '../src/core/scale.ts';
import { createPlayerBody } from '../src/game/player.ts';
import { HOLD } from '../src/render/hands.ts';
import {
  createFirstPersonArm,
  PLAYER_ARM_PARTS,
  PLAYER_BODY_FORWARD_OFFSET,
  PlayerMeshes,
} from '../src/render/playerFigure.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const scale = makeScale(0.5);
const { palette } = registry.figures.get('player')!;

describe('player figure', () => {
  it('uses the content palette, shared headless body layout, and the configured view offset', () => {
    const meshes = new PlayerMeshes(scale.blockSize, palette);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    expect(PLAYER_ARM_PARTS).not.toContain('head');
    expect(parts).toHaveLength(PLAYER_ARM_PARTS.length);
    expect(parts.map((mesh) => (mesh.material as MeshLambertMaterial).color.getHex())).toEqual(
      [
        palette.shirt,
        palette.shirt,
        palette.shirt,
        palette.skin,
        palette.skin,
        palette.skin,
        palette.skin,
        palette.trousers,
        palette.trousers,
      ].map((hex) => Number.parseInt(hex.slice(1), 16)),
    );

    const body = createPlayerBody(scale, 4, 1, 4);
    body.onGround = true;
    meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false });
    const bodyMatrix = new Matrix4();
    parts[0]!.getMatrixAt(0, bodyMatrix);
    const center = new Vector3().setFromMatrixPosition(bodyMatrix);
    expect(center.z).toBeCloseTo(body.pos[2] * scale.blockSize - PLAYER_BODY_FORWARD_OFFSET);
    expect(PLAYER_BODY_FORWARD_OFFSET).toBe(0.4);
    expect(parts.every((mesh) => mesh.count === 1)).toBe(true);
  });

  it('hides held arms from the world body, including both arms for a two-handed item', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const inventory = new Inventory(registry);
    const knife = inventory.create('kitchen_knife');
    inventory.add(knife, { kind: 'hand', side: 'right' });
    const meshes = new PlayerMeshes(scale.blockSize, palette);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const indexes = Object.fromEntries(PLAYER_ARM_PARTS.map((part, index) => [part, index])) as Record<
      (typeof PLAYER_ARM_PARTS)[number],
      number
    >;

    meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false, inventory });
    expect(parts[indexes.rightUpperArm]!.count).toBe(0);
    expect(parts[indexes.rightForearm]!.count).toBe(0);
    expect(parts[indexes.rightHand]!.count).toBe(0);
    expect(parts[indexes.leftUpperArm]!.count).toBe(1);

    const batInventory = new Inventory(registry);
    const bat = batInventory.create('baseball_bat');
    batInventory.add(bat, { kind: 'hand', side: 'left' });
    meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false, inventory: batInventory });
    expect(parts[indexes.leftForearm]!.count).toBe(0);
    expect(parts[indexes.rightForearm]!.count).toBe(0);
    expect(parts[indexes.leftHand]!.count).toBe(0);
    expect(parts[indexes.rightHand]!.count).toBe(0);
  });

  it('ends each first-person arm at the held grip for forward and upright weapons', () => {
    const cases = [
      { item: 'kitchen_knife', hold: 'forward' as const },
      { item: 'hammer', hold: 'upright' as const },
    ];
    for (const { item, hold } of cases) {
      const def = registry.items.get(item)!;
      expect(registry.models.get(def.model!)!.hold).toBe(hold);
      const grip = HOLD.right;
      const arm = createFirstPersonArm(palette, 'right', grip);
      arm.updateMatrixWorld(true);
      const endpoint = new Vector3();
      arm.getObjectByName('grip-anchor')!.getWorldPosition(endpoint);
      expect(endpoint.distanceTo(new Vector3(...grip))).toBeLessThanOrEqual(0.02);
      const colors = arm.children.map((part) => (part as Mesh).material as MeshLambertMaterial);
      expect(colors.some((material) => material.color.getHex() === Number.parseInt(palette.shirt.slice(1), 16))).toBe(
        true,
      );
      expect(colors.some((material) => material.color.getHex() === Number.parseInt(palette.skin.slice(1), 16))).toBe(
        true,
      );
    }
  });
});
