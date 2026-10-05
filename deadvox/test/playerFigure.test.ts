import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Euler,
  Frustum,
  Group,
  type InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HOLD } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { meleeContactTime, meleePoseAndContact, readyMeleePose } from '../src/core/meleePose.ts';
import { makeScale } from '../src/core/scale.ts';
import { FISTS_MELEE } from '../src/core/zombies.ts';
import { createPlayerBody, PLAYER } from '../src/game/player.ts';
import { HeldItems } from '../src/render/hands.ts';
import { renderMeleePose } from '../src/render/meleePose.ts';
import {
  createFirstPersonArm,
  FIRST_PERSON_SHOULDER,
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

describe('held light presentation', () => {
  it.each(['right', 'left'] as const)('shows a burning fallback light in the %s hand', (side) => {
    for (const type of ['candle', 'torch', 'glowstick']) {
      const inventory = new Inventory(registry);
      const light = inventory.create(type);
      expect(toggleLight(registry, light, 0)).toBeUndefined();
      expect(inventory.add(light, { kind: 'hand', side })).toBe(true);
      const held = new HeldItems(inventory, undefined, palette);
      held.update(new PerspectiveCamera());
      const { shown } = held as unknown as { shown: Map<number, Group> };
      let visibleBody = false;
      let flame = false;
      shown.get(light.uid)?.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }
        visibleBody ||=
          object.name === 'held-light-body' &&
          object.material instanceof MeshBasicMaterial &&
          !object.material.toneMapped &&
          !object.material.depthTest;
        flame ||= object.name === 'held-light-flame' && object.material instanceof MeshBasicMaterial;
      });
      expect(visibleBody, `${type} in ${side} hand`).toBe(true);
      expect(flame, `${type} in ${side} hand`).toBe(type !== 'glowstick');
      held.dispose();
    }
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

  it('keeps exactly two first-person arm chains across inventory and model rebuilds, at rest and contact', () => {
    const inventory = new Inventory(registry);
    let modelLoaded = false;
    const models = {
      version: 0,
      held: () => (modelLoaded ? new Group() : undefined),
    } as unknown as NonNullable<ConstructorParameters<typeof HeldItems>[1]>;
    const held = new HeldItems(inventory, models, palette);
    const internals = held as unknown as { scene: Group; arms: Map<'left' | 'right', Group> };
    const camera = new PerspectiveCamera();
    const renderedArmCount = () => {
      let count = 0;
      internals.scene.traverse((object) => {
        if (object.name.startsWith('first-person-arm-')) {
          count += 1;
        }
      });
      return count;
    };
    const counts: number[] = [];
    const record = (pose?: ReturnType<typeof readyMeleePose>) => {
      held.update(camera, pose);
      counts.push(renderedArmCount());
    };

    record(readyMeleePose(false));
    const originalArms = [...internals.arms.values()];
    const backpack = inventory.create('hiking_backpack');
    expect(inventory.add(backpack, { kind: 'worn' })).toBe(true);
    record(readyMeleePose(false));
    for (let index = 0; index < 3; index++) {
      expect(inventory.add(inventory.create('canned_beans'), { kind: 'pocket', owner: backpack, pocket: 0 })).toBe(
        true,
      );
      record(readyMeleePose(false));
    }

    const knife = inventory.create('kitchen_knife');
    expect(inventory.add(knife, { kind: 'hand', side: 'right' })).toBe(true);
    record(readyMeleePose(false));
    modelLoaded = true;
    models.version += 1;
    record(readyMeleePose(false));
    record(readyMeleePose(true));
    const { cooldown } = FISTS_MELEE;
    const contactAt = meleeContactTime(cooldown);
    const contact = meleePoseAndContact(
      {
        profile: 'fists',
        hand: 'right',
        twoHanded: false,
        cooldown,
        contactAt,
        aimYaw: 0,
        aimPitch: 0,
        origin: [0, 0, 0],
        direction: [0, 0, -1],
        hitResolved: false,
      },
      contactAt,
      false,
    );
    record(readyMeleePose(true));
    record(contact);

    expect(inventory.move(knife, { kind: 'hand', side: 'left' }).ok).toBe(true);
    record(readyMeleePose(false));
    expect(inventory.move(knife, { kind: 'hand', side: 'right' }).ok).toBe(true);
    record(readyMeleePose(false));
    expect(counts).toEqual(Array.from({ length: counts.length }, () => 2));
    expect(originalArms.every((arm) => arm.parent === null)).toBe(true);
  });

  it('keeps exactly two first-person chains for a two-handed bat through hand swaps and real inventory restore', () => {
    const inventory = new Inventory(registry);
    const bat = inventory.create('baseball_bat');
    expect(inventory.add(bat, { kind: 'hand', side: 'right' })).toBe(true);
    const held = new HeldItems(inventory, undefined, palette);
    const internals = held as unknown as { scene: Group };
    const camera = new PerspectiveCamera();
    const armCount = () => {
      let count = 0;
      internals.scene.traverse((object) => {
        if (object.name.startsWith('first-person-arm-')) {
          count += 1;
        }
      });
      return count;
    };

    held.update(camera, readyMeleePose(false));
    expect(armCount()).toBe(2);
    expect(inventory.move(bat, { kind: 'hand', side: 'left' }).ok).toBe(true);
    held.update(camera, readyMeleePose(false));
    expect(armCount()).toBe(2);

    const restored = Inventory.restoreState(
      registry,
      inventory.snapshotState() as Parameters<typeof Inventory.restoreState>[1],
    );
    const restoredHeld = new HeldItems(restored, undefined, palette);
    const restoredInternals = restoredHeld as unknown as { scene: Group };
    restoredHeld.update(camera, readyMeleePose(false));
    let restoredArmCount = 0;
    restoredInternals.scene.traverse((object) => {
      if (object.name.startsWith('first-person-arm-')) {
        restoredArmCount += 1;
      }
    });
    expect(restoredArmCount).toBe(2);
    const restoredBackpack = restored.create('hiking_backpack');
    expect(restored.add(restoredBackpack, { kind: 'worn' })).toBe(true);
    restoredHeld.update(camera, readyMeleePose(true));
    let rebuiltArmCount = 0;
    restoredInternals.scene.traverse((object) => {
      if (object.name.startsWith('first-person-arm-')) {
        rebuiltArmCount += 1;
      }
    });
    expect(rebuiltArmCount).toBe(2);
  });

  it('keeps the click-time aim axis through yaw and pitch without rolling a cut blade', () => {
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
    const expectedForward = new Vector3(0, 0, -1).applyQuaternion(expected).normalize();
    const actualForward = new Vector3(0, 0, -1).applyQuaternion(actualItem).normalize();
    expect(actualForward.angleTo(expectedForward) * (180 / Math.PI)).toBeLessThan(0.1);
    expect(actualArm.angleTo(actualItem) * (180 / Math.PI)).toBeLessThan(0.1);
  });

  it('keeps a left-hand flashlight attached and in its hold pose during a right-fist torso-yaw strike', () => {
    const inventory = new Inventory(registry);
    const flashlight = inventory.create('flashlight');
    expect(inventory.add(flashlight, { kind: 'hand', side: 'left' })).toBe(true);
    const held = new HeldItems(inventory, undefined, palette);
    const internals = held as unknown as {
      view: Group;
      arms: Map<'left' | 'right', Group>;
      heldByHand: Map<'left' | 'right', Group>;
    };
    const camera = new PerspectiveCamera();
    const action = {
      profile: 'fists' as const,
      hand: 'right' as const,
      twoHanded: false,
      hands: { right: null, left: flashlight.uid },
      cooldown: 0.8,
      contactAt: 0.25,
      aimYaw: 0,
      aimPitch: 0,
      origin: [0, 0, 0] as [number, number, number],
      direction: [0, 0, -1] as [number, number, number],
      hitResolved: false,
    };
    let maxTorsoYaw = 0;
    for (let step = 0; step <= 120; step++) {
      const elapsed = (action.cooldown * step) / 120;
      const pose = renderMeleePose(action, elapsed, false);
      maxTorsoYaw = Math.max(maxTorsoYaw, Math.abs(pose.torsoYaw ?? 0));
      expect(pose.left.offset).toEqual([0, 0, 0]);
      expect(pose.left.rotation).toEqual([0, 0, 0]);
      held.update(camera, pose);
      internals.view.updateMatrixWorld(true);
      const arm = internals.arms.get('left')!;
      const item = internals.heldByHand.get('left')!;
      const hand = arm.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
      const grip = item.getWorldPosition(new Vector3());
      const handOrientation = arm.getWorldQuaternion(new Quaternion());
      const itemOrientation = item.getWorldQuaternion(new Quaternion());
      expect(grip.distanceTo(hand), `frame ${step} grip/hand gap`).toBeLessThanOrEqual(0.001);
      expect(itemOrientation.angleTo(handOrientation), `frame ${step} item/hand rotation`).toBeLessThan(1e-6);
    }
    expect(maxTorsoYaw).toBeCloseTo(Math.PI / 6);
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates connected arm geometry across supported weapons and 121 poses.
  it('keeps the first-person arm chain connected through every sampled melee pose', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.01, 128);
    const cases = [
      { item: 'baseball_bat', profile: 'blunt' as const, twoHanded: true },
      { item: 'steel_pipe', profile: 'blunt' as const, twoHanded: false },
      { item: 'kitchen_knife', profile: 'cut' as const, twoHanded: false },
      { item: 'kitchen_knife', profile: 'cut' as const, twoHanded: false },
      { item: 'steel_pipe', profile: 'pierce' as const, twoHanded: false },
    ];
    for (const { item, profile, twoHanded } of cases) {
      for (const side of ['left', 'right'] as const) {
        if (side === 'left' && !twoHanded) {
          continue;
        }
        const inventory = new Inventory(registry);
        const weapon = inventory.create(item);
        inventory.add(weapon, { kind: 'hand', side });
        const held = new HeldItems(inventory, undefined, palette);
        const internals = held as unknown as {
          view: Group;
          torso: Group;
          arms: Map<'left' | 'right', Group>;
          armLengths: Map<Group, readonly [number, number]>;
        };
        held.update(camera);
        const arm = internals.arms.get(side)!;
        const expectedLengths = internals.armLengths.get(arm)!;
        const action = {
          profile,
          hand: side,
          twoHanded,
          cooldown: 1.2,
          contactAt: 0.25,
          aimYaw: 0,
          aimPitch: 0,
          origin: [0, 0, 0] as [number, number, number],
          direction: [0, 0, -1] as [number, number, number],
          hitResolved: false,
        };
        for (let step = 0; step <= 120; step++) {
          const elapsed = (action.cooldown * step) / 120;
          held.update(camera, meleePoseAndContact(action, elapsed, false));
          internals.view.updateMatrixWorld(true);
          const segments = arm.children.slice(0, 2) as Mesh[];
          const endpoints = segments.map((segment) => {
            const center = segment.getWorldPosition(new Vector3());
            const up = new Vector3(0, 1, 0).applyQuaternion(segment.getWorldQuaternion(new Quaternion()));
            const half = segment.scale.y / 2;
            return { start: center.clone().addScaledVector(up, -half), end: center.addScaledVector(up, half) };
          });
          const anchor = arm.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
          const actualLengths = endpoints.map(({ start, end }) => start.distanceTo(end));
          expect(
            Math.abs(actualLengths[0]! - expectedLengths[0]!),
            `${item}/${side} frame ${step} upper length ${actualLengths[0]} vs ${expectedLengths[0]}; reach ${endpoints[0]!.start.distanceTo(anchor)} / ${expectedLengths[0]! + expectedLengths[1]!}; shoulder ${endpoints[0]!.start.toArray()} wrist ${anchor.toArray()}`,
          ).toBeLessThanOrEqual(0.0005);
          expect(
            Math.abs(actualLengths[1]! - expectedLengths[1]!),
            `${item}/${side} frame ${step} lower length`,
          ).toBeLessThanOrEqual(0.0005);
          expect(endpoints[0]!.end.distanceTo(endpoints[1]!.start)).toBeLessThanOrEqual(0.001);
          expect(endpoints[1]!.end.distanceTo(anchor)).toBeLessThanOrEqual(0.001);
          expect(anchor.distanceTo(endpoints[0]!.start)).toBeLessThanOrEqual(
            actualLengths[0]! + actualLengths[1]! + 0.0015,
          );
          const shoulderView = internals.view.worldToLocal(endpoints[0]!.start.clone());
          const rotatedShoulder = new Vector3(...FIRST_PERSON_SHOULDER[side]).applyQuaternion(
            internals.torso.quaternion,
          );
          expect(shoulderView.distanceTo(rotatedShoulder)).toBeLessThanOrEqual(0.0805);
          const shoulder = endpoints[0]!.start;
          const elbow = endpoints[0]!.end;
          const wrist = endpoints[1]!.end;
          const axis = wrist.clone().sub(shoulder).normalize();
          const sideBend = new Vector3(side === 'right' ? 1 : -1, 0, 0);
          sideBend.addScaledVector(axis, -sideBend.dot(axis));
          if (sideBend.lengthSq() > 1e-8) {
            sideBend.normalize();
            const along = elbow.clone().sub(shoulder).dot(axis);
            const elbowBend = elbow.clone().sub(shoulder).addScaledVector(axis, -along);
            if (elbowBend.lengthSq() > 1e-8) {
              expect(elbowBend.dot(sideBend)).toBeGreaterThan(0);
            }
          }
        }
      }
    }
    const fists = new Inventory(registry);
    const fistHeld = new HeldItems(fists, undefined, palette);
    const fistInternals = fistHeld as unknown as { view: Group; torso: Group; arms: Map<'left' | 'right', Group> };
    for (const side of ['left', 'right'] as const) {
      const action = {
        profile: 'fists' as const,
        hand: side,
        twoHanded: false,
        cooldown: 1.2,
        contactAt: 0.25,
        aimYaw: 0,
        aimPitch: 0,
        origin: [0, 0, 0] as [number, number, number],
        direction: [0, 0, -1] as [number, number, number],
        hitResolved: false,
      };
      for (let step = 0; step <= 120; step++) {
        fistHeld.update(camera, meleePoseAndContact(action, (action.cooldown * step) / 120, false));
        fistInternals.view.updateMatrixWorld(true);
        const arm = fistInternals.arms.get(side)!;
        const wrist = arm.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
        const forearm = arm.children[1] as Mesh;
        const center = forearm.getWorldPosition(new Vector3());
        const up = new Vector3(0, 1, 0).applyQuaternion(forearm.getWorldQuaternion(new Quaternion()));
        expect(center.addScaledVector(up, forearm.scale.y / 2).distanceTo(wrist)).toBeLessThanOrEqual(0.001);
        const sleeve = arm.children[0] as Mesh;
        const shoulder = sleeve
          .getWorldPosition(new Vector3())
          .addScaledVector(
            new Vector3(0, 1, 0).applyQuaternion(sleeve.getWorldQuaternion(new Quaternion())),
            -sleeve.scale.y / 2,
          );
        const shoulderView = fistInternals.view.worldToLocal(shoulder);
        const rotatedShoulder = new Vector3(...FIRST_PERSON_SHOULDER[side]).applyQuaternion(
          fistInternals.torso.quaternion,
        );
        expect(shoulderView.distanceTo(rotatedShoulder)).toBeLessThanOrEqual(0.0805);
      }
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
