import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight } from 'three';
import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { worldGravity } from '../src/core/gravity.ts';
import type { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import {
  flightForItem,
  hasMetThrowMinimumHold,
  itemFlightPoint,
  steppedItemFlight,
  throwDistanceForItem,
} from '../src/core/itemThrow.ts';
import { pileItemPosition } from '../src/core/pileLayout.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { ItemThrows } from '../src/render/itemThrows.ts';
import { baseRegistry } from './baseRegistry.ts';
import { presentationFlight } from './itemFlightFixture.ts';

const base = baseRegistry();
const gravityMetresPerSimSecondSquared = worldGravity(base);

const testItem = (type: string): Item => ({ uid: 1, type, count: 1, condition: 1 });
const testRegistry = (weights: Record<string, number>): Registry =>
  ({
    items: new Map(Object.entries(weights).map(([id, weight]) => [id, { id, weight, size: [1, 1] }])),
    models: new Map(),
    inventory: base.inventory,
    player: base.player,
  }) as unknown as Registry;
const presentationInventory = (item: Item): Inventory => {
  const pile = { pos: [2, 0, 0] as [number, number, number], items: [{ item, x: 0, y: 0, rotated: false }] };
  return {
    itemByUid: (uid: number) => (uid === item.uid ? item : undefined),
    locate: (candidate: Item) => (candidate === item ? { kind: 'pile', pile, placed: pile.items[0]! } : undefined),
  } as unknown as Inventory;
};

const tuning = {
  maximumDistanceMetres: 8,
  chargeSimSeconds: 2,
  armSpeedMetresPerRealSecond: 9,
  armEnergyJoules: 60,
};

describe('held-item throws', () => {
  it('rejects a release before the minimum hold and accepts the boundary', () => {
    expect(hasMetThrowMinimumHold(0.99, 1)).toBe(false);
    expect(hasMetThrowMinimumHold(1, 1)).toBe(true);
  });

  it('increases light-item range with charge and caps it at full charge', () => {
    const registry = testRegistry({ light: 450 });
    const item = testItem('light');
    const minimumHoldSimSeconds = tuning.chargeSimSeconds / 2;
    const minimumRange = throwDistanceForItem(item, registry, tuning, minimumHoldSimSeconds);
    const fullRange = throwDistanceForItem(item, registry, tuning, tuning.chargeSimSeconds);
    const overchargedRange = throwDistanceForItem(item, registry, tuning, tuning.chargeSimSeconds * 2);

    expect(minimumRange).toBeLessThan(fullRange);
    expect(overchargedRange).toBeLessThanOrEqual(fullRange);
  });

  it('limits heavier items to no greater range at the same charge', () => {
    const registry = testRegistry({ light: 450, heavy: 4000 });
    const heldSimSeconds = tuning.chargeSimSeconds;
    const lightRange = throwDistanceForItem(testItem('light'), registry, tuning, heldSimSeconds);
    const heavyRange = throwDistanceForItem(testItem('heavy'), registry, tuning, heldSimSeconds);

    expect(heavyRange).toBeLessThan(lightRange);
  });

  it('records drag-free launch strength rather than baking drag into replay distance', () => {
    const registry = testRegistry({ light: 450 });

    expect(throwDistanceForItem(testItem('light'), registry, tuning, tuning.chargeSimSeconds)).toBeCloseTo(
      tuning.maximumDistanceMetres,
      3,
    );
  });

  it('flies less far when the same mass pushes more air', () => {
    const registry = testRegistry({ compact: 100, flimsy: 100 });
    registry.items.set('flimsy', { id: 'flimsy', weight: 100, size: [2, 3] } as never);
    const fly = (type: string) =>
      flightForItem(testItem(type), registry, {
        from: [0, 1, 0],
        direction: [1, 0, 0],
        distanceMetres: throwDistanceForItem(testItem(type), registry, tuning, tuning.chargeSimSeconds),
        blockSize: 1,
        minY: -2,
        isSolid: (_x, y) => y < 0,
      });
    const compact = fly('compact');
    const flimsy = fly('flimsy');
    expect(flimsy.points.at(-1)![0]).toBeLessThan(compact.points.at(-1)![0]);
  });

  it('never lengthens a throw as drag rises, and lands however light the item', () => {
    // Drag past the stepper's stable limit made the arc diverge and never come back down.
    const ranges = [0, 0.1, 1, 10, 100, 1e3, 1e6].map((drag) => {
      const flight = steppedItemFlight({
        from: [0, 1, 0],
        direction: [1, 0, 0],
        distanceMetres: 8,
        gravityMetresPerSimSecondSquared: 1,
        flightSimSeconds: 1,
        drag,
        blockSize: 1,
        minY: -2,
        isSolid: (_x, y) => y < 0,
      });
      expect(flight.landing).toBeDefined();
      expect(Number.isFinite(flight.durationSimSeconds)).toBe(true);
      return flight.points.at(-1)![0];
    });
    for (let index = 1; index < ranges.length; index++) {
      expect(ranges[index]).toBeGreaterThan(0);
      expect(ranges[index]).toBeLessThanOrEqual(ranges[index - 1]!);
    }
  });

  it('starts a level throw without upward velocity beyond the look direction', () => {
    const flight = steppedItemFlight({
      from: [0, 1, 0],
      direction: [1, 0, 0],
      distanceMetres: 1,
      gravityMetresPerSimSecondSquared: 1,
      flightSimSeconds: 1,
      drag: 0,
      blockSize: 1,
      minY: -2,
      isSolid: (_x, y) => y < 0,
    });

    expect(flight.points.every((point) => point[1] <= flight.points[0]![1])).toBe(true);
  });

  it('never rises when aimed downward', () => {
    const flight = steppedItemFlight({
      from: [0, 1, 0],
      direction: [1, -0.1, 0],
      distanceMetres: 1,
      gravityMetresPerSimSecondSquared: 1,
      flightSimSeconds: 1,
      drag: 0,
      blockSize: 1,
      minY: -2,
      isSolid: (_x, y) => y < 0,
    });

    expect(flight.points.every((point, index) => index === 0 || point[1] <= flight.points[index - 1]![1])).toBe(true);
  });

  it('changes dragged range with pitch and draws the stepped path', () => {
    const registry = testRegistry({ light: 100 });
    const item = testItem('light');
    const distanceMetres = throwDistanceForItem(item, registry, tuning, tuning.chargeSimSeconds);
    const fly = (pitch: number) =>
      flightForItem(item, registry, {
        from: [0, 1, 0],
        direction: [Math.cos(pitch), Math.sin(pitch), 0],
        distanceMetres,
        blockSize: 1,
        minY: -2,
        isSolid: (_x, y) => y < 0,
      });
    const down = fly(-0.3);
    const level = fly(0);
    const up = fly(0.3);
    expect(down.points.at(-1)![0]).toBeLessThan(level.points.at(-1)![0]);
    expect(up.points.at(-1)![0]).toBeGreaterThan(level.points.at(-1)![0]);
    const throws = new ItemThrows(registry);
    const inventory = presentationInventory(item);
    throws.spawn(
      { item, origin: up.points[0]!, flight: up, startedAtSimSeconds: 2, landingAt: 2 + up.durationSimSeconds },
      inventory,
    );
    throws.update(2 + up.durationSimSeconds / 2, inventory);
    const visual = throws.group.children[0]!;
    const location = inventory.locate(item)!;
    if (location.kind !== 'pile') {
      throw new Error('fixture item must be in a pile');
    }
    const end = pileItemPosition(registry, location.pile, item.uid, { blockSize: 1 })!;
    const middleIndex = (up.points.length - 1) / 2;
    const before = up.points[Math.floor(middleIndex)]!;
    const after = up.points[Math.ceil(middleIndex)]!;
    for (let axis = 0; axis < 3; axis++) {
      const sampled = (before[axis]! + after[axis]!) / 2;
      const poseOffset = (end[axis]! - up.points.at(-1)![axis]!) / 2;
      expect(visual.position.toArray()[axis]).toBeCloseTo(sampled + poseOffset);
    }
    throws.update(2 + up.durationSimSeconds, inventory);
    expect(visual.position.toArray()).toEqual(end);
    throws.dispose();
  });

  it('uses the thrown item look, including its fitted magazine', () => {
    const rifleModel = new Group();
    let requestedLook: import('../src/render/itemLook.ts').ItemLook | undefined;
    const models = {
      has: () => true,
      groundLook: (look: import('../src/render/itemLook.ts').ItemLook) => {
        requestedLook = look;
        return rifleModel;
      },
    } as unknown as import('../src/render/models.ts').ModelLibrary;
    const registry = testRegistry({ rifle: 4000, magazine: 200 });
    registry.items.set('rifle', { id: 'rifle', weight: 4000, size: [1, 4], model: 'rifle_model' } as never);
    registry.items.set('magazine', { id: 'magazine', weight: 200, size: [1, 2], model: 'magazine_model' } as never);
    registry.models.set('rifle_model', {
      gun: { slots: { magazine: { at: [0, 0, 0], turn: [0, 0, 0] } } },
    } as never);
    const magazine = testItem('magazine');
    const rifle = { ...testItem('rifle'), slots: { magazine } } as Item;
    const throws = new ItemThrows(registry, models, 1);
    throws.spawn({ origin: [0, 1, 0], item: rifle, flight: presentationFlight }, presentationInventory(rifle));

    expect(requestedLook).toMatchObject({
      model: 'rifle_model',
      slots: [{ slot: 'magazine', model: 'magazine_model' }],
    });
    expect(throws.group.getObjectByName('rifle_model+magazine=magazine_model')).toBe(rifleModel);
    throws.dispose();
  });

  it('uses the low pile bundle fallback for an item without a model', () => {
    const registry = testRegistry({ rag: 20 });
    registry.items.set('rag', { id: 'rag', weight: 20, size: [1, 2] } as never);
    const throws = new ItemThrows(registry, undefined, 1);
    const item = testItem('rag');
    throws.spawn({ origin: [0, 1, 0], item, flight: presentationFlight }, presentationInventory(item));
    const flight = throws.group.children[0] as Group;
    const bundle = flight.children[0] as Mesh;

    expect(bundle).toBeInstanceOf(Mesh);
    expect(bundle.scale.y).toBeLessThan(bundle.scale.x);
    throws.dispose();
  });

  it('keeps the pile emissive marker on a burning item during flight', () => {
    const registry = testRegistry({ glow: 30 });
    const light = { color: '#62ff81', emissive: 0.3, burning: { drop: 'stay' } };
    registry.items.set('glow', { id: 'glow', weight: 30, size: [1, 2], light } as never);
    const throws = new ItemThrows(registry, undefined, 1);
    const item = { ...testItem('glow'), on: true };
    throws.spawn({ origin: [0, 1, 0], item, flight: presentationFlight }, presentationInventory(item));
    const flight = throws.group.children[0] as Group;
    const marker = flight.children.find(
      (child) => child instanceof Mesh && child.material instanceof MeshBasicMaterial,
    ) as Mesh;
    const expected = new Color(light.color).multiplyScalar(light.emissive);

    expect(marker).toBeDefined();
    expect((marker.material as MeshBasicMaterial).color.equals(expected)).toBe(true);
    expect((marker.material as MeshBasicMaterial).toneMapped).toBe(false);
    expect((marker.material as MeshBasicMaterial).vertexColors).toBe(false);
    throws.dispose();
  });

  it('keeps the lit look on the glowstick model during flight', () => {
    const light = { color: '#62ff81', emissive: 0.3, burning: { drop: 'stay' } };
    const registry = testRegistry({ glow: 30 });
    registry.items.set('glow', { id: 'glow', weight: 30, size: [1, 2], model: 'glowstick', light } as never);
    registry.models.set('glowstick', { emissiveMaterial: 'chemical-light tube' } as never);
    const geometry = new BoxGeometry(1, 0.1, 0.1);
    const sourceMaterial = new MeshStandardMaterial({ color: '#62ff81' });
    sourceMaterial.name = 'chemical-light tube';
    const model = new Group();
    model.add(new Mesh(geometry, sourceMaterial));
    const models = {
      has: () => true,
      groundLook: () => model.clone(),
    } as unknown as import('../src/render/models.ts').ModelLibrary;
    const throws = new ItemThrows(registry, models, 1);
    const item = { ...testItem('glow'), on: true };
    throws.spawn({ origin: [0, 1, 0], item, flight: presentationFlight }, presentationInventory(item));
    const flight = throws.group.children[0] as Group;
    const shownModel = flight.children[0] as Group;
    let tube: Mesh | undefined;
    shownModel.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
        tube = object;
      }
    });

    expect(flight.children).toHaveLength(1);
    expect(tube).toBeDefined();
    const material = tube!.material as MeshStandardMaterial;
    expect(material.emissive.getHexString()).not.toBe('000000');
    expect(material.emissiveIntensity).toBe(light.emissive);
    expect(material.toneMapped).toBe(false);
    throws.dispose();
    geometry.dispose();
    sourceMaterial.dispose();
  });

  it('ends the throw arc at its simulation landing time', () => {
    const registry = testRegistry({ rag: 20 });
    registry.items.set('rag', { id: 'rag', weight: 20, size: [1, 1] } as never);
    const throws = new ItemThrows(registry, undefined, 1);
    const start: [number, number, number] = [0, 1, 0];
    const item = testItem('rag');
    const inventory = presentationInventory(item);
    const pile = { pos: [2, 0, 0] as [number, number, number], items: [{ item, x: 0, y: 0, rotated: false }] };
    const landing = pileItemPosition(registry, pile, item.uid, { blockSize: 1 })!;
    throws.spawn({ origin: start, item, flight: presentationFlight, startedAtSimSeconds: 4, landingAt: 5 }, inventory);
    const visual = throws.group.children[0] as Group;
    throws.update(4.99, inventory);
    expect(throws.activeCount).toBe(1);
    throws.update(5, inventory);
    expect(throws.activeCount).toBe(0);
    expect(visual.visible).toBe(false);
    expect(visual.position.toArray()).toEqual(itemFlightPoint(start, landing, 1, presentationFlight));
    throws.dispose();
  });

  it('presents an item flight without adding a point light to the shader pool', () => {
    const registry = testRegistry({ rag: 20 });
    registry.items.set('rag', { id: 'rag', weight: 20, size: [1, 2] } as never);
    const throws = new ItemThrows(registry);
    const item = testItem('rag');
    throws.spawn({ origin: [0, 1, 0], item, flight: presentationFlight }, presentationInventory(item));

    expect(throws.group.children.some((child) => child instanceof PointLight)).toBe(false);
    throws.dispose();
  });

  it('uses the shared content gravity for an item flight', () => {
    const stronger = {
      ...base,
      player: new Map(
        [...base.player].map(([id, player]) => [
          id,
          { ...player, gravityMetresPerSimSecondSquared: player.gravityMetresPerSimSecondSquared * 2 },
        ]),
      ),
    };
    const options = {
      from: [0, 8, 0] as [number, number, number],
      direction: [1, 0, 0] as [number, number, number],
      distanceMetres: 4,
      blockSize: 1,
      minY: -8,
      isSolid: () => false,
    };

    expect(flightForItem(testItem('rag'), stronger, options).points[1]![1]).toBeLessThan(
      flightForItem(testItem('rag'), base, options).points[1]![1],
    );
  });

  it('settles an elevated throw onto the first solid surface below instead of retaining release height', () => {
    const from: [number, number, number] = [1.5, 8.5, 1.5];
    const isSolid: SolidAt = (_x, y) => y === 5 || y === 0;
    const { landing } = steppedItemFlight({
      drag: 0,
      flightSimSeconds: 1,
      from,
      direction: [1, 0, 0],
      distanceMetres: 4,
      gravityMetresPerSimSecondSquared,
      blockSize: 1,
      minY: -8,
      isSolid,
    });

    expect(landing).toBeDefined();
    expect(landing![1]).toBeLessThan(Math.floor(from[1]));
    expect(isSolid(landing![0], landing![1] - 1, landing![2])).toBe(true);
    expect(isSolid(landing![0], landing![1], landing![2])).toBe(false);
  });

  it('does not invent a landing surface when the column below the throw is unknown', () => {
    const { landing } = steppedItemFlight({
      drag: 0,
      flightSimSeconds: 1,
      from: [1.5, 8.5, 1.5],
      direction: [1, 0, 0],
      distanceMetres: 4,
      gravityMetresPerSimSecondSquared,
      blockSize: 1,
      minY: -8,
      isSolid: () => false,
    });

    expect(landing).toBeUndefined();
  });

  it('settles a charged arc on the thrower side of a near wall', () => {
    const isSolid: SolidAt = (x, y) => y === 0 || (x === 4 && y > 0 && y < 4);
    const { landing } = steppedItemFlight({
      drag: 0,
      flightSimSeconds: 1,
      from: [1.5, 1.5, 1.5],
      direction: [1, 0, 0],
      distanceMetres: 8,
      gravityMetresPerSimSecondSquared,
      blockSize: 1,
      minY: -8,
      isSolid,
    });

    expect(landing).toBeDefined();
    expect(landing![0]).toBeLessThan(4);
    expect(landing![1]).toBe(1);
  });

  it('stops an upward throw at a low ceiling and settles below it', () => {
    const isSolid: SolidAt = (x, y) => y === 0 || (y === 2 && x < 6);
    const { landing } = steppedItemFlight({
      drag: 0,
      flightSimSeconds: 1,
      from: [1.5, 1.5, 1.5],
      direction: [1, 1, 0],
      distanceMetres: 8,
      gravityMetresPerSimSecondSquared,
      blockSize: 1,
      minY: -8,
      isSolid,
    });

    expect(landing).toBeDefined();
    expect(landing![0]).toBeLessThan(6);
    expect(landing![1]).toBe(1);
  });
});
