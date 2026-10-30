import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { LIGHT_MOUNT_SLOT } from '../src/core/firearmFitting.ts';
import { Inventory } from '../src/core/inventory.ts';
import { itemPresentationIssues, modelPresentationAssetIssues } from '../src/core/itemPresentation.ts';
import { ItemFactory, snapshotItem } from '../src/core/items.ts';
import { chargeShare, supplyShare, toggleLight } from '../src/core/lights.ts';
import { type ItemLook, itemLook } from '../src/render/itemLook.ts';
import { ItemPictures } from '../src/render/itemPictures.ts';
import { applyItemStateLook, disposeItemStateMaterials, fittedStateGroup } from '../src/render/itemStateLook.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { baseRegistry } from './baseRegistry.ts';

const fixture = () => {
  const light = { radius: 2, seenFrom: 4, color: '#ffcc88', intensity: 1 };
  const vessel = {
    capacityMicrolitres: 100,
    accepts: ['liquid'],
    initialContents: { kind: 'filled', liquid: 'liquid', volumeMicrolitres: 100 },
  };
  const base = {
    name: 'fixture',
    category: 'misc',
    workInProgress: false,
    notLoot: false,
    economy: { usage: [], tiers: [] },
    weight: 1,
    size: [1, 1],
  };
  const presentation = { materials: ['metal', 'cloth'], wear: 'wear', supply: { kind: 'none' } };
  const fill = {
    ...presentation,
    supply: {
      kind: 'fill',
      piece: 'fill',
      axis: 'y',
      bands: [
        { from: 0, scale: 0.2 },
        { from: 0.5, scale: 1 },
      ],
    },
  };
  const result = buildRegistry([
    {
      source: 'state-fixture',
      data: {
        itemWear: [
          {
            id: 'wear',
            bands: [
              { from: 0, tints: { metal: { color: '#ff0000', mix: 0.8 }, cloth: { color: '#ffffff', mix: 0.8 } } },
              { from: 0.5, tints: { metal: { color: '#ff0000', mix: 0 }, cloth: { color: '#ffffff', mix: 0 } } },
            ],
          },
        ],
        liquids: [{ id: 'liquid', name: 'liquid', densityGramsPerMillilitre: 1 }],
        models: [
          { id: 'plain', file: 'assets/models/plain.glb', itemPresentation: presentation },
          { id: 'filled', file: 'assets/models/filled.glb', itemPresentation: fill },
          {
            id: 'lit',
            file: 'assets/models/lit.glb',
            itemPresentation: fill,
            emissiveMaterial: 'surface',
            anchors: { flame: [0, 1, 0] },
          },
        ],
        items: [
          { ...base, id: 'plain', model: 'plain' },
          { ...base, id: 'battery', model: 'plain', battery: { capacity: 100 } },
          { ...base, id: 'canister', model: 'plain', canister: { capacity: 100 } },
          {
            ...base,
            id: 'tool',
            model: 'plain',
            tool: { qualities: {}, fuel: { canister: 'canister', swapSimSeconds: 1 } },
          },
          {
            ...base,
            id: 'powered',
            model: 'plain',
            light: { ...light, power: { battery: 'battery', chargePerGameHour: 1, swapSimSeconds: 1 } },
          },
          { ...base, id: 'igniter', model: 'filled', igniter: { capacity: 100, perIgnition: 1 } },
          { ...base, id: 'vessel', model: 'filled', vessel },
          {
            ...base,
            id: 'liquid_light',
            model: 'lit',
            vessel,
            light: {
              ...light,
              emissive: 1,
              liquidFuel: { accepts: ['liquid'], microlitresPerGameSecond: 1 },
              burning: {
                ignition: 'firestarter',
                douse: true,
                sprint: 'stay',
                stow: 'stay',
                drop: 'stay',
                relight: true,
              },
              flame: { heightMetres: 0.3, radiusMetres: 0.1 },
            },
          },
          { ...base, id: 'burn', model: 'plain', light: { ...light, burnTimeGameHours: 2 } },
        ].map((item) => ({ ...item, name: item.id })),
      },
    },
  ]);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  const factory = new ItemFactory();
  return {
    registry: result.registry,
    create: (type: string, condition = 1) => factory.create(result.registry, type, 1, { condition }),
  };
};

const sceneFactory = () => {
  const shared = new MeshStandardMaterial({ color: '#808080' });
  shared.name = 'surface';
  shared.userData.itemMaterialIndex = 0;
  const fabric = shared.clone();
  fabric.userData.itemMaterialIndex = 1;
  const model = (look: ItemLook): Object3D => {
    const root = new Group();
    const frame = new Group();
    root.add(frame);
    frame.add(new Mesh(new BoxGeometry(), shared));
    const fill = new Mesh(new BoxGeometry(0.5, 1, 0.5), fabric);
    fill.name = 'fill';
    frame.add(fill);
    for (const slot of look.slots) {
      const part = new Group();
      part.name = fittedStateGroup(slot.slot);
      part.add(new Mesh(new BoxGeometry(), shared));
      frame.add(part);
    }
    return root;
  };
  return { shared, models: { version: 1, has: () => true, groundLook: model } as unknown as ModelLibrary };
};
const firstMaterial = (root: Object3D): MeshStandardMaterial => {
  let found: MeshStandardMaterial | undefined;
  root.traverse((object) => {
    if (!found && object instanceof Mesh) {
      found = object.material as MeshStandardMaterial;
    }
  });
  if (!found) {
    throw new Error('Fixture model has no surface');
  }
  return found;
};

it.each(['wear', 'fill'] as const)(
  'bounds %s variants by content bands and changes the selected surface in their direction',
  (state) => {
    const { registry, create } = fixture();
    const make = (share: number) => {
      const item = create(state === 'wear' ? 'plain' : 'igniter', state === 'wear' ? share : 1);
      if (state === 'fill') {
        item.charges = share * 100;
      }
      return itemLook(registry, item)!;
    };
    const low = make(0.2);
    const inside = make(0.3);
    const high = make(0.8);
    expect(low.key).toBe(inside.key);
    expect(low.key).not.toBe(high.key);
    const { models, shared } = sceneFactory();
    const lowModel = models.groundLook(low)!;
    const highModel = models.groundLook(high)!;
    applyItemStateLook(lowModel, low, registry);
    applyItemStateLook(highModel, high, registry);
    if (state === 'wear') {
      expect(firstMaterial(lowModel).color.r).toBeGreaterThan(firstMaterial(highModel).color.r);
      expect(firstMaterial(lowModel).color.g).toBeLessThan(firstMaterial(highModel).color.g);
      expect(firstMaterial(lowModel.getObjectByName('fill')!).color.g).toBeGreaterThan(
        firstMaterial(highModel.getObjectByName('fill')!).color.g,
      );
    } else {
      expect(lowModel.getObjectByName('fill')!.scale.y).toBeLessThan(highModel.getObjectByName('fill')!.scale.y);
    }
    expect(shared.color.r).toBe(shared.color.g);
    disposeItemStateMaterials(lowModel);
    disposeItemStateMaterials(highModel);
  },
);

it('resolves every supply capability without conflating absent supplies, empty vessels or never-lit clocks', () => {
  const { registry, create } = fixture();
  for (const type of ['battery', 'powered', 'canister', 'tool', 'igniter', 'vessel', 'liquid_light', 'burn']) {
    const item = create(type);
    if (type === 'tool') {
      item.slots = { canister: create('canister') };
    }
    expect(supplyShare(registry, item)).toEqual({ kind: 'share', share: 1 });
    if (type === 'burn') {
      item.burnRemainingGameSeconds = registry.items.get(type)!.light!.burnTimeGameHours! / 2;
    } else if (type === 'vessel' || type === 'liquid_light') {
      item.liquidContents = { kind: 'empty' };
    } else if (type === 'powered') {
      item.slots!.battery!.charges = 0;
    } else if (type === 'tool') {
      item.slots!.canister!.charges = 0;
    } else {
      item.charges = 0;
    }
    const value = supplyShare(registry, item);
    expect(value?.kind).toBe('share');
    expect(value?.kind === 'share' && value.share).toBeLessThan(1);
  }
  const powered = create('powered');
  powered.slots!.battery!.charges = 0;
  const emptyKey = itemLook(registry, powered)!.key;
  powered.slots = {};
  expect(chargeShare(registry, powered)).toBeUndefined();
  expect(supplyShare(registry, powered)).toEqual({ kind: 'absent' });
  expect(itemLook(registry, powered)!.key).not.toBe(emptyKey);
  expect(supplyShare(registry, create('plain'))).toBeUndefined();
});

it('keeps battery level text-only while activation changes the still cache within one band', () => {
  const { registry, create } = fixture();
  const battery = create('battery');
  const full = itemLook(registry, battery)!.key;
  battery.charges = 0;
  expect(itemLook(registry, battery)!.key).toBe(full);
  const { models } = sceneFactory();
  const paint = vi.fn(() => 'still');
  const pictures = new ItemPictures(registry, models, 4, { painter: { paint, view: vi.fn(), dispose: vi.fn() } });
  const item = create('powered');
  const off = itemLook(registry, item)!.key;
  pictures.picture(item);
  expect(toggleLight(registry, item)).toBeUndefined();
  expect(itemLook(registry, item)!.key).not.toBe(off);
  pictures.picture(item);
  pictures.picture(item);
  expect(paint).toHaveBeenCalledTimes(2);
  pictures.dispose();
});

it('keys fitted child wear independently and applies it only inside the named child group', () => {
  const base = baseRegistry();
  const parentDef = [...base.items.values()].find((def) => def.firearm && def.twoHanded && def.lightMountSite)!;
  const childDef = [...base.items.values()].find((def) => def.lightMount?.kind === parentDef.lightMountSite!.kind)!;
  const own = fixture().registry;
  const registry = { ...base, models: new Map(base.models), itemWear: new Map([...base.itemWear, ...own.itemWear]) };
  for (const def of [parentDef, childDef]) {
    const model = registry.models.get(def.model!)!;
    registry.models.set(model.id, {
      ...model,
      itemPresentation: {
        materials: model.itemPresentation!.materials.map(() => 'metal'),
        wear: 'wear',
        supply: { kind: 'none' },
      },
    });
  }
  const inventory = new Inventory(registry);
  const parent = inventory.create(parentDef.id);
  const child = inventory.create(childDef.id, 1, 0.2);
  inventory.fitSlot(parent, LIGHT_MOUNT_SLOT, child);
  expect(inventory.add(parent, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
  const low = itemLook(registry, parent)!;
  const before = snapshotItem(parent);
  const { models, shared } = sceneFactory();
  const model = models.groundLook(low)!;
  applyItemStateLook(model, low, registry);
  const part = model.getObjectByName(fittedStateGroup(LIGHT_MOUNT_SLOT))!;
  expect(firstMaterial(part).color.g).toBeLessThan(firstMaterial(model).color.g);
  expect(firstMaterial(model).color).toEqual(shared.color);
  expect(snapshotItem(parent)).toEqual(before);
  expect(inventory.changeCondition(child.uid, 0.6)).toBe(true);
  const high = itemLook(registry, parent)!;
  expect(high.state).toEqual(low.state);
  expect(high.key).not.toBe(low.key);
  disposeItemStateMaterials(model);
});

it('gives the viewer and actual pile path the same instance tint, fill and authored flame without changing inventory', () => {
  const { registry: own, create } = fixture();
  const base = baseRegistry();
  const registry = {
    ...base,
    items: new Map([...base.items, ...own.items]),
    models: new Map([...base.models, ...own.models]),
    itemWear: new Map([...base.itemWear, ...own.itemWear]),
    liquids: new Map([...base.liquids, ...own.liquids]),
  };
  const inv = new Inventory(registry);
  const item = create('liquid_light', 0.2);
  item.liquidContents = { kind: 'filled', liquid: 'liquid', volumeMicrolitres: 20 };
  expect(toggleLight(registry, item)).toBeUndefined();
  expect(inv.add(item, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
  const before = inv.snapshotState();
  const { models } = sceneFactory();
  const piles = new PileMeshes(1, models);
  piles.sync(inv);
  const world = piles.drawnModel(item.uid)!;
  expect(world).toBeDefined();
  const pictures = new ItemPictures(registry, models, 2, {
    painter: { paint: vi.fn(), view: vi.fn(), dispose: vi.fn() },
  });
  const viewer = pictures.model(item)!;
  expect(firstMaterial(viewer).color).toEqual(firstMaterial(world).color);
  expect(firstMaterial(viewer).emissive).toEqual(firstMaterial(world).emissive);
  expect(viewer.getObjectByName('fill')!.scale).toEqual(world.getObjectByName('fill')!.scale);
  const flames = (root: Object3D) => {
    const found: Object3D[] = [];
    root.traverse((part) => {
      if (part.name.endsWith('light-flame')) {
        found.push(part);
      }
    });
    return found;
  };
  expect(flames(viewer)).toHaveLength(1);
  expect(flames(world)).toHaveLength(1);
  expect(flames(viewer)[0]!.scale).toEqual(flames(world)[0]!.scale);
  pictures.disposeModel(viewer);
  pictures.dispose();
  piles.dispose();
  expect(inv.snapshotState()).toEqual(before);
});

it('disposes still-owned material copies even when painting throws, without disposing library materials', () => {
  const { registry, create } = fixture();
  const { models, shared } = sceneFactory();
  const sharedDispose = vi.spyOn(shared, 'dispose');
  let dispose: ReturnType<typeof vi.spyOn> | undefined;
  const pictures = new ItemPictures(registry, models, 2, {
    painter: {
      paint: (model) => {
        dispose = vi.spyOn(firstMaterial(model), 'dispose');
        throw new Error('paint failed');
      },
      view: vi.fn(),
      dispose: vi.fn(),
    },
  });
  expect(() => pictures.picture(create('plain', 0.2))).toThrow('paint failed');
  expect(dispose).toHaveBeenCalledOnce();
  expect(sharedDispose).not.toHaveBeenCalled();
  pictures.dispose();
});

it('rejects untagged asset materials, missing fill pieces and missing material-class tints', () => {
  const { registry } = fixture();
  const model = registry.models.get('filled')!;
  expect(modelPresentationAssetIssues(model, { materials: [{}, {}], nodes: [{ name: 'fill' }] })).toEqual([]);
  expect(modelPresentationAssetIssues(model, { materials: [{}], nodes: [{ name: 'fill' }] })).not.toEqual([]);
  expect(modelPresentationAssetIssues(model, { materials: [{}, {}], nodes: [] })).not.toEqual([]);
  expect(
    modelPresentationAssetIssues(
      { ...model, emissiveMaterial: 'missing' },
      { materials: [{}, {}], nodes: [{ name: 'fill' }] },
    ),
  ).not.toEqual([]);
  expect(modelPresentationAssetIssues({ ...model, itemPresentation: undefined }, { materials: [{}] })).not.toEqual([]);
  registry.models.set(model.id, { ...model, itemPresentation: { ...model.itemPresentation!, materials: ['missing'] } });
  expect(itemPresentationIssues(registry)).not.toEqual([]);
});
