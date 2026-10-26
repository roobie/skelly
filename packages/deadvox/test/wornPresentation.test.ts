import { Group, type Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type FigureDef, type ItemDef } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { FIGURE_PIVOT, type PlayerFigurePose, PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { createPlayerBody } from './playerFixture.ts';

const base = baseRegistry();
const figure = base.figures.get('player')!;
const bodyModels = await loadFigureModels(base);
const segment = {
  model: 'fixture_worn',
  frame: 'shin',
  pivot: [0.03, -0.07, 0.02] as Vec3,
  at: [0.01, 0.04, -0.03] as Vec3,
  turn: [20, 35, -10] as Vec3,
};
const fixtureFigure: FigureDef = {
  ...figure,
  attachmentFrames: {
    ...figure.attachmentFrames,
    shin: {
      part: 'leftLeg',
      pivot: figure.legRig.shin.pivot,
      at: [0.02, -0.05, 0.01],
      turn: [5, 15, 0],
      insideView: false,
    },
  },
};
const fixtureItem: ItemDef = {
  ...base.items.get('baseball_cap')!,
  id: 'fixture_garment',
  wearable: { slot: 'torso', encumbrance: 0 },
  figureModels: [segment, { ...segment, frame: 'head' }],
};
const carriedItem: ItemDef = {
  id: 'fixture_carry',
  name: 'Fixture carry',
  category: 'tool',
  weight: 1,
  size: [1, 1],
  workInProgress: false,
  notLoot: false,
  economy: fixtureItem.economy,
  figureModels: [segment],
};
const registry = {
  ...base,
  items: new Map([...base.items, [fixtureItem.id, fixtureItem], [carriedItem.id, carriedItem]]),
};
const pose = (inventory?: Inventory): PlayerFigurePose => ({
  body: createPlayerBody(makeScale(0.5), 2, 0, 3),
  yaw: 0.6,
  stepOffset: 0,
  gaitPhase: 0.8,
  moving: false,
  stance: 'standing',
  dt: 1,
  thirdPerson: true,
  ...(inventory ? { inventory } : {}),
});
const library = () => {
  const available = new Set(['fixture_worn', 'baseball_cap', 'headlamp', 'night_vision_goggles', 'riot_helmet']);
  const models = {
    ...bodyModels,
    version: 1,
    part: (id: string) => {
      if (bodyModels.has(id)) {
        return bodyModels.part(id);
      }
      if (!available.has(id)) {
        return;
      }
      const model = new Group();
      model.name = 'fixture-item-model';
      return model;
    },
  };
  return { available, models: models as unknown as ModelLibrary };
};

describe('shared worn presentation', () => {
  it('keeps an authored item pivot on a posed attachment frame for an inventory-independent consumer', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create(fixtureItem.id);
    const source = { registry, worn: { torso: item, shoulder: inventory.create(carriedItem.id) } };
    const { models } = library();
    const meshes = new PlayerMeshes(0.5, fixtureFigure, registry.models, models);
    meshes.setLayer(0);
    const positions: Vector3[] = [];
    for (const stance of ['standing', 'crouching', 'prone'] as const) {
      meshes.sync({ ...pose(), stance, moving: true, wornItems: source });
      meshes.group.updateMatrixWorld(true);
      expect(meshes.group.getObjectByName('worn-shoulder')).toBeDefined();
      expect(meshes.group.getObjectsByProperty('name', 'worn-torso')).toHaveLength(fixtureItem.figureModels!.length);
      const frame = meshes.group.getObjectByName('wear-frame-shin')!;
      const attachment = frame.getObjectByName('worn-torso')!;
      expect(frame.parent?.name).toBe(FIGURE_PIVOT.shin);
      expect(
        frame
          .getWorldPosition(new Vector3())
          .distanceTo(frame.parent!.localToWorld(new Vector3(...fixtureFigure.attachmentFrames.shin!.at))),
      ).toBeLessThan(1e-8);
      const model = attachment.children[0]!;
      const pivot = model.localToWorld(new Vector3(...segment.pivot));
      expect(pivot.distanceTo(frame.localToWorld(new Vector3(...segment.at)))).toBeLessThan(1e-8);
      const expected = frame.getWorldQuaternion(new Quaternion()).multiply(attachment.quaternion);
      expect(model.getWorldQuaternion(new Quaternion()).angleTo(expected)).toBeLessThan(1e-7);
      expect(model.layers.mask).toBe(1);
      positions.push(pivot);
    }
    expect(positions[0]!.distanceTo(positions[1]!)).toBeGreaterThan(0.01);
    expect(positions[1]!.distanceTo(positions[2]!)).toBeGreaterThan(0.01);
    const shoulder = meshes.group.getObjectByName('worn-shoulder');
    meshes.sync({ ...pose(), wornItems: { registry, worn: { shoulder: source.worn.shoulder } } });
    expect(meshes.group.getObjectsByProperty('name', 'worn-torso')).toHaveLength(0);
    expect(meshes.group.getObjectByName('worn-shoulder')).toBe(shoulder);
  });

  it('reconciles delayed model loads with equip and removal without replacing another worn item', () => {
    const inventory = new Inventory(registry);
    const { models, available } = library();
    available.clear();
    const meshes = new PlayerMeshes(0.5, figure, registry.models, models);
    const cap = inventory.create('baseball_cap');
    expect(inventory.add(cap, { kind: 'worn' })).toBe(true);
    meshes.sync(pose(inventory));
    expect(meshes.group.getObjectByName('worn-head')).toBeUndefined();
    expect(inventory.move(cap, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    const lamp = inventory.create('headlamp');
    const goggles = inventory.create('night_vision_goggles');
    expect(inventory.add(lamp, { kind: 'worn' })).toBe(true);
    expect(inventory.add(goggles, { kind: 'worn' })).toBe(true);
    available.add('baseball_cap');
    available.add('night_vision_goggles');
    models.version += 1;
    meshes.sync(pose(inventory));
    expect(meshes.group.getObjectByName('worn-head')).toBeUndefined();
    expect(meshes.group.getObjectByName('worn-eyes')).toBeDefined();
    available.add('headlamp');
    models.version += 1;
    meshes.sync(pose(inventory));
    const eyes = meshes.group.getObjectByName('worn-eyes')!;
    expect(meshes.group.getObjectByName('worn-head')).toBeDefined();
    expect(inventory.move(lamp, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    meshes.sync(pose(inventory));
    expect(meshes.group.getObjectByName('worn-head')).toBeUndefined();
    expect(meshes.group.getObjectByName('worn-eyes')).toBe(eyes);
    meshes.sync({ ...pose(inventory), thirdPerson: false });
    expect(eyes.parent?.visible).toBe(false);
  });

  it('waits for the figure frame as well as the worn model', () => {
    const inventory = new Inventory(registry);
    expect(inventory.add(inventory.create('baseball_cap'), { kind: 'worn' })).toBe(true);
    const { models } = library();
    let ready = false;
    const delayed = { ...models, has: (id: string) => ready && bodyModels.has(id) } as ModelLibrary;
    const meshes = new PlayerMeshes(0.5, figure, registry.models, delayed);
    meshes.sync(pose(inventory));
    expect(meshes.group.getObjectByName('worn-head')).toBeUndefined();
    ready = true;
    meshes.sync(pose(inventory));
    expect(meshes.group.getObjectByName('worn-head')).toBeDefined();
  });

  it('suppresses only loaded garment coverage and restores it after the last covering item is removed', () => {
    const covering = (id: string, slot: 'legs' | 'feet'): ItemDef => ({
      ...fixtureItem,
      id,
      wearable: { slot, encumbrance: 0 },
      figureModels: [{ ...segment, covers: [figure.legRig.shin.part] }],
    });
    const trousers = covering('fixture_trousers', 'legs');
    const boots = covering('fixture_boots', 'feet');
    const coveredRegistry = {
      ...registry,
      items: new Map([...registry.items, [trousers.id, trousers], [boots.id, boots]]),
    };
    const inventory = new Inventory(coveredRegistry);
    const { models, available } = library();
    available.clear();
    const meshes = new PlayerMeshes(0.5, fixtureFigure, coveredRegistry.models, models);
    const pants = inventory.create(trousers.id);
    const shoes = inventory.create(boots.id);
    expect(inventory.add(pants, { kind: 'worn' })).toBe(true);
    meshes.sync(pose(inventory));
    const leg = meshes.group.getObjectByName('figure-leftLeg')!;
    const baseNodes: Object3D[] = [];
    leg.traverse((node) => {
      if (node.userData.part === figure.legRig.shin.part) {
        baseNodes.push(node);
      }
    });
    expect(baseNodes.length).toBeGreaterThan(0);
    expect(baseNodes.every((node) => node.visible)).toBe(true);
    available.add(segment.model);
    models.version += 1;
    meshes.sync(pose(inventory));
    expect(baseNodes.every((node) => !node.visible)).toBe(true);
    const otherLeg = meshes.group.getObjectByName('figure-rightLeg')!;
    expect(otherLeg.visible).toBe(true);
    otherLeg.traverse((node) => expect(node.visible).toBe(true));
    expect(inventory.add(shoes, { kind: 'worn' })).toBe(true);
    meshes.sync(pose(inventory));
    expect(inventory.move(pants, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    meshes.sync(pose(inventory));
    expect(baseNodes.every((node) => !node.visible)).toBe(true);
    expect(inventory.move(shoes, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    meshes.sync(pose(inventory));
    expect(baseNodes.every((node) => node.visible)).toBe(true);
  });

  it('keeps paired garment segments on independently swinging limbs through stance and corpse placement', () => {
    const otherFrame = 'other_shin';
    const pairedFigure: FigureDef = {
      ...fixtureFigure,
      attachmentFrames: {
        ...fixtureFigure.attachmentFrames,
        [otherFrame]: { ...fixtureFigure.attachmentFrames.shin!, part: 'rightLeg' },
      },
    };
    const item: ItemDef = {
      ...fixtureItem,
      figureModels: [segment, { ...segment, frame: 'other_shin' }],
    };
    const pairedRegistry = { ...registry, items: new Map([...registry.items, [item.id, item]]) };
    const inventory = new Inventory(pairedRegistry);
    expect(inventory.add(inventory.create(item.id), { kind: 'worn' })).toBe(true);
    const { models } = library();
    const meshes = new PlayerMeshes(0.5, pairedFigure, pairedRegistry.models, models);
    const relativeTurns: Quaternion[] = [];
    for (const stance of ['standing', 'crouching', 'prone'] as const) {
      meshes.sync({ ...pose(inventory), stance, moving: true });
      meshes.group.updateMatrixWorld(true);
      const frames = ['shin', 'other_shin'].map((name) => meshes.group.getObjectByName(`wear-frame-${name}`)!);
      const [left, right] = frames.map((frame) => frame.getWorldQuaternion(new Quaternion()));
      expect(left!.angleTo(right!)).toBeGreaterThan(0);
      relativeTurns.push(left!.clone().invert().multiply(right!));
      for (const frame of frames) {
        const attachment = frame.getObjectByName('worn-torso')!;
        expect(attachment).toBeDefined();
        const pivot = attachment.children[0]!.localToWorld(new Vector3(...segment.pivot));
        expect(pivot.distanceTo(frame.localToWorld(new Vector3(...segment.at)))).toBeLessThan(1e-8);
      }
    }
    meshes.group.rotation.set(0.2, 0.7, Math.PI / 2);
    meshes.group.updateMatrixWorld(true);
    const left = meshes.group.getObjectByName('wear-frame-shin')!.getWorldQuaternion(new Quaternion());
    const right = meshes.group.getObjectByName('wear-frame-other_shin')!.getWorldQuaternion(new Quaternion());
    expect(left.invert().multiply(right).angleTo(relativeTurns.at(-1)!)).toBeLessThan(1e-7);
  });

  it('rejects missing worn models, frames, covered parts and posed pivots at the content boundary', () => {
    const broken = structuredClone(fixtureFigure);
    broken.attachmentFrames.shin!.pivot = 'fixture_missing_pivot';
    const item = {
      ...fixtureItem,
      figureModels: [
        { ...segment, model: 'fixture_missing_model', frame: 'fixture_missing_frame' },
        { ...segment, frame: 'head', covers: ['fixture_missing_part'] },
      ],
    };
    const { issues } = buildRegistry([
      {
        source: 'fixture.json',
        data: {
          figures: [broken],
          models: [...base.models.values()],
          items: [item],
        },
      },
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'items[0].figureModels[0].model',
          message: 'no model "fixture_missing_model"',
        }),
        expect.objectContaining({
          path: 'items[0].figureModels[0].frame',
          message: expect.stringContaining('fixture_missing_frame'),
        }),
        expect.objectContaining({
          path: 'items[0].figureModels[1].covers[0]',
          message: expect.stringContaining('fixture_missing_part'),
        }),
        expect.objectContaining({
          path: 'figures[0].attachmentFrames.shin.pivot',
          message: expect.stringContaining('fixture_missing_pivot'),
        }),
      ]),
    );
  });
});
