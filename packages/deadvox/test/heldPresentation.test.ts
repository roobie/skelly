// biome-ignore-all lint/suspicious/noMisplacedAssertion: helper assertions run only from the item-hold test.
import { Group, type Object3D, PerspectiveCamera, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { dominantSide } from '../src/core/character.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { readyMeleePose } from '../src/core/meleePose.ts';
import { makeScale } from '../src/core/scale.ts';
import { createAvatarMannequin } from '../src/render/avatarMannequin.ts';
import { HeldItems } from '../src/render/hands.ts';
import { HeldPresentation, heldItemPoses, type ItemHoldPose } from '../src/render/heldPresentation.ts';
import { renderMeleePose } from '../src/render/meleePose.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { heldState } from './heldState.ts';
import { createPlayerBody } from './playerFixture.ts';

// The compass label's canvas is unrelated to its grip; pixels are checked in the held browser stage.
vi.mock('../src/render/compass.ts', () => ({
  createCompass: ({ root }: { root: Object3D }) => ({ group: root, update: () => undefined, dispose: () => undefined }),
}));

/** A two-handed firearm keeps its model-authored support grip while it is readied. */
const expectTwoHandedAimSupport = (view: HeldItems, sample: ItemHoldPose, mountedSupport: boolean): void => {
  if (!mountedSupport) {
    return;
  }
  const support = sample.side === 'right' ? 'left' : 'right';
  const held = heldState(view) as {
    handsOff: Set<'left' | 'right'>;
    holds: Map<'left' | 'right', { at: readonly number[] }>;
    gripAnchors: Map<'left' | 'right', Object3D>;
  };
  expect(held.handsOff.has(support), sample.name).toBe(false);
  expect(held.gripAnchors.get(support)!.position.toArray(), sample.name).toEqual(held.holds.get(support)!.at);
};

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
    candidates.find((item) => item.firearm && base.models.get(item.model!)?.hands?.butt),
    candidates.find(
      (item) => item.firearm && base.models.get(item.model!)?.hands && !base.models.get(item.model!)?.hands?.butt,
    ),
    candidates.find(
      (item) => item.firearm && !item.twoHanded && item.model && !base.models.get(item.model)?.gun?.attachments?.length,
    ),
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
  const modelDefinitions = new Map(
    [...base.models].map(([id, model]) => [
      id,
      model.gun ? { ...model, gun: { ...model.gun, attachments: [] } } : model,
    ]),
  );
  const registry = { ...base, items, models: modelDefinitions, figures: new Map([[figure.id, figure]]) };
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
        const def = items.get(sample.itemType)!;
        expectTwoHandedAimSupport(
          view,
          sample,
          Boolean(def.firearm && def.twoHanded && registry.models.get(def.model!)?.hands),
        );
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
        view.update(new PerspectiveCamera(), pose, 0, { ...handling, stockSeats: world.stockSeats });
        const firstModel = firstOwner.heldByHand.get(sample.side)!;
        const worldModel = worldOwner.heldByHand.get(sample.side)!;
        expect(worldModel.position.distanceTo(firstModel.position), sample.name).toBeLessThan(1e-8);
        expect(worldModel.quaternion.angleTo(firstModel.quaternion), sample.name).toBeLessThan(1e-7);
        if (items.get(sample.itemType)!.model) {
          expect(worldModel.getObjectByName('fixture-held-model'), sample.name).toBeDefined();
        }
        for (const side of worldOwner.arms.keys()) {
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

it.each([
  { name: 'raises both empty fists into a boxer guard', itemType: undefined },
  { name: 'raises the empty offhand alongside a melee weapon in en-garde', itemType: 'steel_pipe' },
])('$name', async ({ itemType }) => {
  const registry = baseRegistry();
  const figure = registry.figures.get('player')!;
  const models = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
  const inventory = new Inventory(registry);
  if (itemType) {
    expect(inventory.add(inventory.create(itemType), { kind: 'hand', side: 'right' })).toBe(true);
  }
  const scale = makeScale(0.5);
  const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
  try {
    world.sync({
      body: createPlayerBody(scale, 0, 0, 0),
      yaw: 0,
      stepOffset: 0,
      gaitPhase: 0,
      moving: false,
      stance: 'standing',
      dt: 0,
      inventory,
    });
    const pose = (ready: boolean) => renderMeleePose(undefined, 0, ready, { holds: figure.holds });
    const owner = world.syncHeldView(pose(true), { firearms: [] })!;
    for (const side of ['right', 'left'] as const) {
      expect(owner.arms.has(side), `${side} guard arm`).toBe(true);
      expect(owner.arms.get(side)!.position.y, `${side} raised above rest`).toBeGreaterThan(
        owner.handBases.get(side)![1],
      );
    }
    world.syncHeldView(pose(false), { firearms: [] });
    expect(owner.arms.has('left')).toBe(false);
    expect(owner.arms.has('right')).toBe(Boolean(itemType));
  } finally {
    world.dispose();
  }
});

it('keeps active and resting firearm off-hand poses equal across first and third person readiness', async () => {
  const registry = baseRegistry();
  const figure = registry.figures.get('player')!;
  const models = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
  const inventory = new Inventory(registry);
  const gun = inventory.create('revolver_357');
  const light = inventory.create('flashlight');
  expect(inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.add(light, { kind: 'hand', side: 'left' })).toBe(true);
  const scale = makeScale(0.5);
  const build = vi.spyOn(HeldPresentation.prototype, 'addItem');
  try {
    for (const [on, progress] of [
      [false, 0.4],
      [false, 1],
      [true, 0.4],
      [true, 1],
    ] as const) {
      if (Boolean(light.on) !== on) {
        expect(toggleLight(registry, light)).toBeUndefined();
      }
      const handling = { firearms: [], readiness: { uid: gun.uid, progress, aimingDownSights: false } } as const;
      const view = new HeldItems(inventory, models, figure);
      build.mockClear();
      view.update(new PerspectiveCamera(), undefined, 0, handling);
      const firstOwner = build.mock.contexts[0] as HeldPresentation;
      const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
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
      });
      world.syncHeldView(undefined, handling);
      const worldOwner = build.mock.contexts.at(-1) as HeldPresentation;
      expect(
        worldOwner.arms.get('left')!.position.distanceTo(firstOwner.arms.get('left')!.position),
        `on=${on} readiness=${progress}`,
      ).toBeLessThan(1e-7);
      view.dispose();
      world.dispose();
    }
  } finally {
    build.mockRestore();
  }
});
