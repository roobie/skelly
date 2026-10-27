import { readFileSync } from 'node:fs';
import { Group, type Object3D, PerspectiveCamera, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { readyMeleePose } from '../src/core/meleePose.ts';
import { mountedOptic } from '../src/core/opticView.ts';
import { makeScale } from '../src/core/scale.ts';
import { solveArmRig } from '../src/render/armRig.ts';
import { HeldItems } from '../src/render/hands.ts';
import { HeldPresentation } from '../src/render/heldPresentation.ts';
import { createHeldViews } from '../src/render/heldViews.ts';
import { stepMagazineRaise } from '../src/render/magazineLoadPose.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { heldState } from './heldState.ts';
import { createPlayerBody } from './playerFixture.ts';

vi.mock('../src/render/magazineLoadPose.ts', { spy: true });
vi.mock('../src/render/armRig.ts', { spy: true });

const fixture = async (firearm = true, itemType?: string) => {
  const base = baseRegistry();
  const gun = itemType
    ? base.items.get(itemType)
    : [...base.items.values()].find(
        (def) =>
          def.firearm &&
          !base.models.get(def.model!)?.hands?.adsStandoffByPitch &&
          base.models
            .get(def.model!)
            ?.gun?.attachments?.some((attachment) =>
              [...base.models.values()].some(
                (model) => model.gun?.attachment?.id === attachment.id && model.gun.attachment.kind === 'optic',
              ),
            ),
      );
  if (!gun) {
    throw new Error('Need an optic-equipped firearm source');
  }
  const itemDef = firearm
    ? { ...gun, id: 'actor-fixture-item' }
    : {
        id: 'actor-fixture-item',
        name: 'Fixture item',
        category: 'misc' as const,
        weight: 100,
        economy: { usage: [], tiers: [] },
        workInProgress: false,
        notLoot: false,
        size: [2, 2] as [number, number],
        twoHanded: true,
      };
  const registry = { ...base, items: new Map(base.items).set(itemDef.id, itemDef) };
  const inventory = new Inventory(registry);
  const item = inventory.create(itemDef.id);
  if (!inventory.add(item, { kind: 'hand', side: 'right' })) {
    throw new Error('Cannot hold fixture item');
  }
  const figure = registry.figures.get('player')!;
  const models = {
    version: 0,
    ...(await loadFigureModels(registry)),
    heldLook: () => ({ root: new Group().add(new Group().add(new Group())), parts: [], slots: {} }),
  } as unknown as ModelLibrary;
  const scale = makeScale(0.5);
  const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
  const actor = {
    body: createPlayerBody(scale, 0, 0, 0),
    yaw: 0.3,
    pitch: -0.2,
    stepOffset: 0,
    gaitPhase: 0,
    moving: false,
    stance: 'standing' as const,
    dt: 0,
    thirdPerson: true,
    inventory,
  };
  world.sync(actor);
  const view = new HeldItems(inventory, models, figure);
  const update = createHeldViews(inventory, view, world);
  const camera = new PerspectiveCamera();
  const pose = readyMeleePose(false, figure.holds);
  const physical = () => world.group.getObjectByName('world-held-items')!;
  const transforms = (): number[][] => {
    const result: number[][] = [];
    physical().updateWorldMatrix(true, true);
    physical().traverse((object) => result.push([...object.matrixWorld.elements]));
    return result;
  };
  const dispose = () => {
    world.dispose();
    view.dispose();
  };
  return { registry, inventory, item, world, actor, view, update, camera, pose, physical, transforms, dispose };
};

it('world and first-person pistol joints consume one actor-space solve per frame', async () => {
  const jointsOf = (owner: HeldPresentation): Map<string, Vector3> =>
    new Map(
      [...owner.armRigs].flatMap(([side, rig]) =>
        (['shoulder', 'elbow', 'hand'] as const).map((joint) => {
          expect(rig[joint].scale.y).toBeLessThanOrEqual(1 + 1e-6);
          return [`${side}-${joint}`, owner.frame.worldToLocal(rig[joint].getWorldPosition(new Vector3()))] as const;
        }),
      ),
    );
  const f = await fixture(true, 'pistol_service');
  const solve = vi.mocked(solveArmRig);
  try {
    for (const aimingDownSights of [false, true]) {
      const actorJoints = new Map<string, Vector3>();
      for (const thirdPerson of [true, false]) {
        f.world.sync({ ...f.actor, thirdPerson });
        solve.mockClear();
        f.update(f.camera, f.pose, 0, {
          firearms: [],
          readiness: { uid: f.item.uid, progress: aimingDownSights ? 1 : 0, aimingDownSights },
        });
        expect(solve).toHaveBeenCalledTimes(2);
        const physical = (f.world as unknown as { presentation: HeldPresentation }).presentation;
        const overlay = (heldState(f.view) as { presentation: HeldPresentation }).presentation;
        expect(physical.armRigs.size).toBe(2);
        const shown = jointsOf(overlay);
        for (const [key, at] of jointsOf(physical)) {
          expect(shown.get(key)!.distanceTo(at), `${key} ADS=${aimingDownSights}`).toBeLessThan(1e-6);
          if (thirdPerson) {
            actorJoints.set(key, at);
          } else {
            expect(at.distanceTo(actorJoints.get(key)!)).toBeLessThan(1e-6);
          }
        }
      }
    }
  } finally {
    solve.mockClear();
    f.dispose();
  }
});

it('orbit and spectator orientation cannot change world handling transforms for the same actor input', async () => {
  const f = await fixture();
  const handling = {
    firearms: [],
    readiness: { uid: f.item.uid, progress: 1, aimingDownSights: false },
    aim: { yaw: 0.07, pitch: -0.04 },
  };
  try {
    f.update(f.camera, f.pose, 0.4, { ...handling, lift: 0.01 });
    const expected = f.transforms();
    for (const [pitch, yaw] of [
      [0.6, -1.1],
      [-0.7, 2.1],
    ]) {
      f.camera.rotation.set(pitch!, yaw!, 0, 'YXZ');
      f.camera.updateMatrixWorld(true);
      f.update(f.camera, f.pose, 0.4, { ...handling, lift: 0.01 });
      expect(f.transforms()).toEqual(expected);
    }
    f.world.sync({ ...f.actor, yaw: f.actor.yaw + 0.5 });
    f.update(f.camera, f.pose, 0.4, handling);
    expect(f.transforms()).not.toEqual(expected);
  } finally {
    f.dispose();
  }
});

it('the play frame poses overlay and world held views from this frame rather than the previous view', async () => {
  const source = readFileSync(new URL('../src/game/play.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const updateFrame =');
  const end = source.indexOf('const skyRoute =', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const frame = source.slice(start, end);
  const calls = [...frame.matchAll(/\b(updateVisualFeedback|updateHeldItems|finishDraw)\(/g)].map((match) => match[1]!);
  expect(new Set(calls).size).toBe(3);
  expect(calls).toHaveLength(3);
  const f = await fixture();
  const heldFrame = f.view.warmUpTarget.scene.getObjectByName('held-items-view')!;
  const next = new PerspectiveCamera();
  const worldSample = new PerspectiveCamera();
  const syncHeldView = f.world.syncHeldView.bind(f.world);
  const world = vi.spyOn(f.world, 'syncHeldView').mockImplementation((...args) => {
    const physicalPose = syncHeldView(...args);
    worldSample.position.copy(f.physical().position);
    worldSample.quaternion.copy(f.physical().quaternion);
    return physicalPose;
  });
  const steps: Record<string, () => void> = {
    updateVisualFeedback: () => {
      f.camera.position.copy(next.position);
      f.camera.quaternion.copy(next.quaternion);
      f.camera.updateMatrixWorld(true);
      f.world.sync({
        ...f.actor,
        eye: [next.position.x / 0.5, next.position.y / 0.5, next.position.z / 0.5],
        yaw: next.rotation.y,
        pitch: next.rotation.x,
      });
    },
    updateHeldItems: () =>
      f.update(f.camera, f.pose, 0, {
        firearms: [],
        readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
      }),
    finishDraw: () => {
      for (const sample of [heldFrame, f.view.warmUpTarget.camera, worldSample]) {
        expect(sample.position.distanceTo(next.position)).toBeLessThan(1e-8);
        expect(sample.quaternion.toArray()).toEqual(next.quaternion.toArray());
      }
      expect(f.view.opticLensFrame).toBeDefined();
    },
  };
  try {
    for (const [x, y, z, pitch, yaw] of [
      [1, 2, 3, 0.3, -0.7],
      [-2, 1, 4, -0.4, 1.2],
    ] as const) {
      next.position.set(x, y, z);
      next.rotation.set(pitch, yaw, 0, 'YXZ');
      for (const call of calls) {
        steps[call]!();
      }
    }
    expect(world).toHaveBeenCalledTimes(2);
  } finally {
    world.mockRestore();
    f.dispose();
  }
});

it('both adapters consume one animation advance per actor tick', async () => {
  const f = await fixture();
  const advance = vi.mocked(stepMagazineRaise);
  advance.mockClear();
  const view = vi.spyOn(f.view, 'update');
  const world = vi.spyOn(f.world, 'syncHeldView');
  try {
    f.update(f.camera, f.pose, 0, { firearms: [], dt: 1 / 60 });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(view.mock.calls[0]![3]!.magazineRaise).toBe(world.mock.calls[0]![1].magazineRaise);
    f.update(f.camera, f.pose, 0, { firearms: [], dt: 1 / 60 });
    expect(advance).toHaveBeenCalledTimes(2);
  } finally {
    advance.mockRestore();
    view.mockRestore();
    world.mockRestore();
    f.dispose();
  }
});

it('the final actor solve samples rummage output before projection and cancellation restores grips', async () => {
  const f = await fixture(false);
  f.world.sync({ ...f.actor, heldItems: { registry: f.registry, hands: f.inventory.hands } });
  const queue = new HandlingQueue(f.inventory);
  const solved: { owner: HeldPresentation; anchor: Object3D; point: Vector3; hand: Object3D }[] = [];
  const { solve } = HeldPresentation.prototype;
  const spy = vi.spyOn(HeldPresentation.prototype, 'solve').mockImplementation(function (
    this: HeldPresentation,
    side,
    shoulder,
    grip,
  ) {
    solve.call(this, side, shoulder, grip);
    solved.push({
      owner: this,
      anchor: this.gripAnchors.get(side)!,
      point: this.gripAnchors.get(side)!.getWorldPosition(new Vector3()),
      hand: this.armRigs.get(side)!.hand,
    });
  });
  try {
    f.update(f.camera, f.pose, 0, { firearms: [] });
    const rest = f.transforms();
    solved.length = 0;
    expect(queue.enqueue(f.item, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
    queue.tick(queue.remaining / 2);
    f.update(f.camera, f.pose, 0, { firearms: [], job: queue.jobs[0] });
    expect(f.transforms()).not.toEqual(rest);
    expect(solved).toHaveLength(2);
    expect(solved.every(({ owner }) => owner.frame.name === 'world-held-items')).toBe(true);
    for (const { anchor, point, hand } of solved) {
      expect(anchor.getWorldPosition(new Vector3()).distanceTo(point)).toBeLessThan(1e-8);
      expect(hand.getWorldPosition(new Vector3()).distanceTo(point)).toBeLessThan(1e-8);
    }
    queue.cancel();
    f.update(f.camera, f.pose, 0, { firearms: [] });
    expect(f.transforms()).toEqual(rest);
  } finally {
    spy.mockRestore();
    f.dispose();
  }
});

it('optic ADS hides the owner-view gun and supplies its window without hiding the world gun', async () => {
  const f = await fixture();
  try {
    expect(mountedOptic(f.registry, f.item)).toBeDefined();
    const handling = { firearms: [], readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true } };
    f.update(f.camera, f.pose, 0, handling);
    expect(f.view.opticLensFrame).toBeDefined();
    const viewGun = f.view.warmUpTarget.scene.getObjectByName('held-item-right')!;
    const worldGun = f.physical().getObjectByName('held-item-right')!;
    expect(viewGun.visible).toBe(false);
    expect(worldGun.visible).toBe(true);
    f.update(f.camera, f.pose, 0, { ...handling, readiness: { ...handling.readiness, aimingDownSights: false } });
    expect(f.view.opticLensFrame).toBeUndefined();
    expect(viewGun.visible).toBe(true);
    expect(worldGun.visible).toBe(true);
  } finally {
    f.dispose();
  }
});
