import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Euler,
  Frustum,
  type Group,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  type MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { meleePoseAndContact, readyMeleePose } from '../src/core/meleePose.ts';
import { makeScale } from '../src/core/scale.ts';
import { createPlayerBody, PLAYER } from '../src/game/player.ts';
import { HeldItems, HOLD } from '../src/render/hands.ts';
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

  it('keeps idle first-person grips camera-relative when the camera turns', () => {
    const inventory = new Inventory(registry);
    const held = new HeldItems(inventory, undefined, palette);
    const internals = held as unknown as { view: Group; arms: Map<'left' | 'right', Group> };
    const camera = new PerspectiveCamera();
    camera.rotation.set(0, Math.PI / 2, 0, 'YXZ');
    held.update(camera, readyMeleePose(false));
    internals.view.updateMatrixWorld(true);
    const actual = internals.arms.get('right')!.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
    const expected = new Vector3(...HOLD.right).applyQuaternion(camera.quaternion);
    expect(actual.distanceTo(expected)).toBeLessThan(0.001);
  });

  it('preserves the origin/main rest geometry through the HeldItems grip pivot', () => {
    const inventory = new Inventory(registry);
    const held = new HeldItems(inventory, undefined, palette);
    const internals = held as unknown as { view: Group; arms: Map<'left' | 'right', Group> };
    const camera = new PerspectiveCamera();
    held.update(camera);
    internals.view.updateMatrixWorld(true);
    for (const side of ['left', 'right'] as const) {
      const actual = internals.arms.get(side)!;
      const expected = createFirstPersonArm(palette, side, HOLD[side]);
      expected.updateMatrixWorld(true);
      for (let index = 0; index < expected.children.length; index++) {
        const actualPart = actual.children[index]!;
        const expectedPart = expected.children[index]!;
        const actualPosition = actualPart.getWorldPosition(new Vector3());
        const expectedPosition = expectedPart.getWorldPosition(new Vector3());
        expect(actualPosition.distanceTo(expectedPosition)).toBeLessThan(0.001);
        expect(
          actualPart.getWorldQuaternion(new Quaternion()).angleTo(expectedPart.getWorldQuaternion(new Quaternion())),
        ).toBeLessThan(0.001);
        expect(actualPart.scale.distanceTo(expectedPart.scale)).toBeLessThan(0.001);
      }
    }
  });

  it('keeps the locked click-time world quaternion through simultaneous camera yaw and pitch', () => {
    const inventory = new Inventory(registry);
    const knife = inventory.create('kitchen_knife');
    inventory.add(knife, { kind: 'hand', side: 'right' });
    const held = new HeldItems(inventory, undefined, palette);
    const internals = held as unknown as {
      view: Group;
      arms: Map<'left' | 'right', Group>;
      heldByHand: Map<'left' | 'right', Group>;
    };
    const camera = new PerspectiveCamera();
    camera.rotation.set(0.6, -0.8, 0, 'YXZ');
    const action = {
      profile: 'cut' as const,
      hand: 'right' as const,
      twoHanded: false,
      cooldown: 0.8,
      contactAt: 0.25,
      aimYaw: 0.7,
      aimPitch: -0.3,
      origin: [0, 0, 0] as [number, number, number],
      direction: [0, 0, -1] as [number, number, number],
      hitResolved: false,
    };
    const pose = meleePoseAndContact(action, action.contactAt, false);
    held.update(camera, pose);
    internals.view.updateMatrixWorld(true);
    const expected = new Quaternion().setFromEuler(new Euler(action.aimPitch, action.aimYaw, 0, 'YXZ'));
    expected.multiply(new Quaternion().setFromEuler(new Euler(...pose.right.rotation, 'YXZ')));
    const actualArm = internals.arms.get('right')!.getWorldQuaternion(new Quaternion());
    const actualItem = internals.heldByHand.get('right')!.getWorldQuaternion(new Quaternion());
    expect(actualArm.angleTo(expected) * (180 / Math.PI)).toBeLessThan(0.1);
    expect(actualItem.angleTo(expected) * (180 / Math.PI)).toBeLessThan(0.1);
  });

  it('keeps two-handed support grips attached to weapon-local grip for both sides and hold orientations', () => {
    const def = registry.items.get('baseball_bat')!;
    const model = registry.models.get(def.model!)! as { hold: 'forward' | 'upright' };
    const originalHold = model.hold;
    const camera = new PerspectiveCamera();
    try {
      for (const side of ['left', 'right'] as const) {
        for (const hold of ['forward', 'upright'] as const) {
          model.hold = hold;
          const inventory = new Inventory(registry);
          const bat = inventory.create('baseball_bat');
          inventory.add(bat, { kind: 'hand', side });
          const held = new HeldItems(inventory, undefined, palette);
          const internals = held as unknown as {
            view: Group;
            arms: Map<'left' | 'right', Group>;
            heldByHand: Map<'left' | 'right', Group>;
          };
          const swing = {
            profile: 'blunt' as const,
            hand: side,
            twoHanded: true,
            cooldown: 1.2,
            contactAt: 0.25,
            aimYaw: 0,
            aimPitch: 0,
            origin: [0, 0, 0] as [number, number, number],
            direction: [0, 0, -1] as [number, number, number],
            hitResolved: false,
          };
          const supportSide = side === 'right' ? 'left' : 'right';
          held.update(camera);
          internals.view.updateMatrixWorld(true);
          const weapon = internals.heldByHand.get(side)!;
          const anchor = internals.arms.get(supportSide)!.getObjectByName('grip-anchor')!;
          const localGrip = weapon.worldToLocal(anchor.getWorldPosition(new Vector3()));
          for (const elapsed of [0, 0.05, 0.09, 0.15, 0.25, 0.32, 0.46, 0.8, 1.2]) {
            held.update(camera, meleePoseAndContact(swing, elapsed, false));
            internals.view.updateMatrixWorld(true);
            const expected = weapon.localToWorld(localGrip.clone());
            const actual = anchor.getWorldPosition(new Vector3());
            expect(actual.distanceTo(expected)).toBeLessThanOrEqual(0.01);
          }
        }
      }
    } finally {
      model.hold = originalHold;
    }
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
