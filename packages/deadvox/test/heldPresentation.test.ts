import { Group, type Object3D, PerspectiveCamera, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { dominantSide } from '../src/core/character.ts';
import { Inventory } from '../src/core/inventory.ts';
import { readyMeleePose } from '../src/core/meleePose.ts';
import { makeScale } from '../src/core/scale.ts';
import { createAvatarMannequin } from '../src/render/avatarMannequin.ts';
import { HeldItems } from '../src/render/hands.ts';
import { HeldPresentation, heldItemPoses, type ItemHoldPose } from '../src/render/heldPresentation.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { createPlayerBody } from './playerFixture.ts';

// The compass label's canvas is unrelated to its grip; pixels are checked in the held browser stage.
vi.mock('../src/render/compass.ts', () => ({
  createCompass: ({ root }: { root: Object3D }) => ({ group: root, update: () => undefined, dispose: () => undefined }),
}));

it('both views resolve registry item holds through one owner, including the mannequin catalogue', async () => {
  const expectSupportMirror = (owner: HeldPresentation, sample: ItemHoldPose): void => {
    const def = owner.registry.items.get(sample.itemType)!;
    const model = owner.registry.models.get(def.model!);
    if (!def.twoHanded || model?.hands) {
      return;
    }
    const support = sample.side === 'right' ? 'left' : 'right';
    const { holds } = owner.figure;
    const expected = new Vector3(...(model?.hold === 'upright' ? holds.supportUpright : holds.supportForward));
    expected.x *= sample.side === 'right' ? 1 : -1;
    expect(owner.arms.get(support)!.position.distanceTo(expected), sample.name).toBeLessThan(1e-8);
  };
  const base = baseRegistry();
  const candidates = [...base.items.values()];
  const sources = [
    candidates.find((item) => item.model && !item.twoHanded && !item.firearm && !item.heldDisplay),
    candidates.find((item) => item.model && item.twoHanded && !item.firearm),
    candidates.find((item) => item.firearm && base.models.get(item.model!)?.hands),
    candidates.find((item) => item.firearm && !item.twoHanded && item.model),
    candidates.find((item) => item.heldDisplay && base.models.get(item.model!)?.display),
    candidates.find((item) => !item.model),
  ];
  expect(sources.every(Boolean)).toBe(true);
  const items = new Map(
    sources.map((source, index) => {
      const id = `fixture_hold_${index}`;
      return [id, { ...source!, id }];
    }),
  );
  const figure = structuredClone(base.figures.get('player')!);
  // Different tuning makes a view that retains the old constants disagree with the owner.
  figure.holds.oneHand[0] *= 0.8;
  figure.holds.twoHand[1] *= 0.9;
  figure.holds.guardPrimary.offset[1] *= 0.7;
  figure.holds.supportUpright[0] += figure.holds.oneHand[0] * 0.2;
  figure.holds.supportForward[0] += figure.holds.oneHand[0] * 0.2;
  const registry = { ...base, items, figures: new Map([[figure.id, figure]]) };
  const models = {
    version: 0,
    ...(await loadFigureModels(registry)),
    heldLook: () => ({
      root: Object.assign(new Group().add(new Group().add(new Group())), { name: 'fixture-held-model' }),
      parts: [],
      slots: {},
    }),
  } as unknown as ModelLibrary;
  const scale = makeScale(0.5);
  const catalogue = heldItemPoses(registry);
  const mannequin = createAvatarMannequin(
    new Group(),
    {
      debug: true,
      blockSize: scale.blockSize,
      figure,
      modelDefs: registry.models,
      models,
      registry,
    },
    '?mannequin=',
  )!;
  expect(mannequin.poses.filter((pose) => pose.catalogue).flatMap((pose) => (pose.hold ? [pose.hold] : []))).toEqual(
    catalogue,
  );
  expect(new Set(catalogue.map((pose) => pose.itemType))).toEqual(new Set(items.keys()));
  const build = vi.spyOn(HeldPresentation.prototype, 'addItem');
  try {
    for (const sample of catalogue) {
      const inventory = new Inventory(registry);
      const item = inventory.create(sample.itemType);
      expect(inventory.add(item, { kind: 'hand', side: sample.side })).toBe(true);
      const pose = readyMeleePose(sample.ready, figure.holds, dominantSide(inventory.character));
      const handling = {
        firearms: [],
        ...(items.get(sample.itemType)!.firearm
          ? {
              readiness: { uid: item.uid, progress: sample.ready ? 1 : 0, aimingDownSights: false },
            }
          : {}),
      };
      const view = new HeldItems(inventory, models, figure);
      const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
      try {
        build.mockClear();
        view.update(new PerspectiveCamera(), pose, 0, handling);
        expect(
          build.mock.calls.map(([side, held]) => [side, held]),
          sample.name,
        ).toEqual([[sample.side, item]]);
        const firstOwner = build.mock.contexts[0] as HeldPresentation;
        build.mockClear();
        world.sync({
          body: createPlayerBody(scale, 0, 0, 0),
          yaw: 0,
          stepOffset: 0,
          gaitPhase: 0,
          moving: false,
          stance: 'standing',
          dt: 0,
          thirdPerson: true,
          inventory,
          holdReady: sample.ready,
        });
        expect(
          build.mock.calls.map(([side, held]) => [side, held]),
          sample.name,
        ).toEqual([[sample.side, item]]);
        const worldOwner = build.mock.contexts[0] as HeldPresentation;
        expect(worldOwner.holds, sample.name).toEqual(firstOwner.holds);
        expectSupportMirror(worldOwner, sample);
        const firstModel = firstOwner.heldByHand.get(sample.side)!;
        const worldModel = worldOwner.heldByHand.get(sample.side)!;
        expect(worldModel.position.distanceTo(firstModel.position), sample.name).toBeLessThan(1e-8);
        expect(worldModel.quaternion.angleTo(firstModel.quaternion), sample.name).toBeLessThan(1e-7);
        if (items.get(sample.itemType)!.model) {
          expect(worldModel.getObjectByName('fixture-held-model'), sample.name).toBeDefined();
        }
        for (const [side, arm] of worldOwner.arms) {
          if (arm.parent !== worldOwner.torso) {
            continue;
          }
          const localGrip = (owner: HeldPresentation) =>
            owner.frame.worldToLocal(owner.gripAnchors.get(side)!.getWorldPosition(new Vector3()));
          expect(localGrip(worldOwner).distanceTo(localGrip(firstOwner)), `${sample.name}/${side}`).toBeLessThan(1e-7);
        }
      } finally {
        view.dispose();
        world.dispose();
      }
    }
  } finally {
    mannequin.dispose();
    build.mockRestore();
  }
});
