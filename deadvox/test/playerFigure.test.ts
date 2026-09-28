import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Frustum,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  type MeshLambertMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { makeScale } from '../src/core/scale.ts';
import { createPlayerBody, PLAYER } from '../src/game/player.ts';
import { HOLD } from '../src/render/hands.ts';
import {
  createFirstPersonArm,
  PLAYER_ARM_PARTS,
  PLAYER_BODY_REAR_OFFSET,
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

const hasVisibleFootCorner = (feet: InstancedMesh[], torso: InstancedMesh, eye: Vector3, frustum: Frustum): boolean =>
  feet.some((foot) => {
    const instance = new Matrix4();
    foot.getMatrixAt(0, instance);
    const worldMatrix = new Matrix4().multiplyMatrices(foot.matrixWorld, instance);
    return [-0.5, 0.5].some((x) => {
      const target = new Vector3(x, 0.5, -0.5).applyMatrix4(worldMatrix);
      if (!frustum.containsPoint(target)) {
        return false;
      }
      const rayDirection = target.clone().sub(eye);
      const distance = rayDirection.length();
      rayDirection.normalize();
      const ray = new Raycaster(eye, rayDirection, 0, distance - 0.001);
      return ray.intersectObject(torso, false).length === 0;
    });
  });

describe('player figure', () => {
  it('keeps the world body outside a level/upward view, with torso 5–10 cm behind the eye', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = new PlayerMeshes(scale.blockSize, palette);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const corners = (mesh: import('three').InstancedMesh) => {
      const instance = new Matrix4();
      mesh.getMatrixAt(0, instance);
      const worldMatrix = new Matrix4().multiplyMatrices(mesh.matrixWorld, instance);
      return [-0.5, 0.5].flatMap((x) =>
        [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => new Vector3(x, y, z).applyMatrix4(worldMatrix))),
      );
    };
    const visibleByPart = (pitch: number) => {
      meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false });
      meshes.group.updateMatrixWorld(true);
      const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 128);
      camera.rotation.order = 'YXZ';
      camera.position.set(
        body.pos[0] * scale.blockSize,
        body.pos[1] * scale.blockSize + PLAYER.eye,
        body.pos[2] * scale.blockSize,
      );
      camera.rotation.set(pitch, 0, 0);
      camera.updateMatrixWorld(true);
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      return parts.map((mesh) => corners(mesh).filter((point) => frustum.containsPoint(point)));
    };

    for (const pitch of [0, 0.25, 0.5, Math.PI / 3]) {
      expect(visibleByPart(pitch).flat()).toHaveLength(0);
    }
    const eyeZ = body.pos[2] * scale.blockSize;
    const torsoBehind = Math.min(...corners(parts[0]!).map((point) => point.z - eyeZ));
    expect(torsoBehind).toBeGreaterThanOrEqual(0.05);
    expect(torsoBehind).toBeLessThanOrEqual(0.1);
    const eyeY = body.pos[1] * scale.blockSize + PLAYER.eye;
    const shoulderTop = Math.max(...[parts[1]!, parts[2]!].flatMap((part) => corners(part).map((point) => point.y)));
    expect(shoulderTop).toBeLessThan(eyeY);
  });

  it('keeps a foot front-top corner visible past the torso at -60 and -80 degrees', () => {
    const body = createPlayerBody(scale, 4, 1, 4);
    const meshes = new PlayerMeshes(scale.blockSize, palette);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const eye = new Vector3(
      body.pos[0] * scale.blockSize,
      body.pos[1] * scale.blockSize + PLAYER.eye,
      body.pos[2] * scale.blockSize,
    );
    for (const pitch of [-Math.PI / 3, (-80 * Math.PI) / 180]) {
      meshes.sync({ body, yaw: 0, stepOffset: 0, gaitPhase: 0, moving: false });
      meshes.group.updateMatrixWorld(true);
      const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 128);
      camera.rotation.order = 'YXZ';
      camera.position.copy(eye);
      camera.rotation.set(pitch, 0, 0);
      camera.updateMatrixWorld(true);
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      expect(
        hasVisibleFootCorner(parts.slice(9), parts[0]!, eye, frustum),
        `foot is visible at ${((pitch * 180) / Math.PI).toFixed(0)} degrees`,
      ).toBe(true);
    }
  });

  it('uses a 8–10 cm first-person forearm section and a 9 cm hand', () => {
    const arm = createFirstPersonArm(palette, 'right', HOLD.right);
    const forearm = arm.children[1] as Mesh;
    const hand = arm.children[2] as Mesh;
    expect(forearm.scale.x).toBeGreaterThanOrEqual(0.08);
    expect(forearm.scale.x).toBeLessThanOrEqual(0.1);
    expect(forearm.scale.z).toBeGreaterThanOrEqual(0.08);
    expect(forearm.scale.z).toBeLessThanOrEqual(0.1);
    expect((hand.geometry as import('three').BoxGeometry).parameters.width).toBeCloseTo(0.09, 3);
  });

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
    expect(center.z).toBeCloseTo(body.pos[2] * scale.blockSize + PLAYER_BODY_REAR_OFFSET);
    expect(PLAYER_BODY_REAR_OFFSET).toBe(0.19);
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
