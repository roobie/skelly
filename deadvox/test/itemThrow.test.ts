import { Color, Group, Mesh, MeshBasicMaterial, PointLight } from 'three';
import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import type { Item } from '../src/core/items.ts';
import { hasMetThrowMinimumHold, throwDistanceForItem, traceItemLanding } from '../src/core/itemThrow.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { ItemThrows } from '../src/render/itemThrows.ts';

const testItem = (type: string): Item => ({ uid: 1, type, count: 1, condition: 1 });
const testRegistry = (weights: Record<string, number>): Registry =>
  ({
    items: new Map(Object.entries(weights).map(([id, weight]) => [id, { id, weight }])),
    models: new Map(),
  }) as unknown as Registry;
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

  it('limits heavier items to no greater range at the same charge', () => {
    const registry = testRegistry({ light: 450, heavy: 4000 });
    const heldSimSeconds = tuning.chargeSimSeconds;
    const lightRange = throwDistanceForItem(testItem('light'), registry, tuning, heldSimSeconds);
    const heavyRange = throwDistanceForItem(testItem('heavy'), registry, tuning, heldSimSeconds);

    expect(heavyRange).toBeLessThan(lightRange);
  });

  it('keeps a light item at the tuned maximum range at full charge', () => {
    const registry = testRegistry({ light: 450 });

    expect(throwDistanceForItem(testItem('light'), registry, tuning, tuning.chargeSimSeconds)).toBe(
      tuning.maximumDistanceMetres,
    );
  });

  it('uses the thrown item look, including its fitted magazine', () => {
    const rifleModel = new Group();
    let requestedLook: import('../src/render/itemLook.ts').ItemLook | undefined;
    const models = {
      groundLook: (look: import('../src/render/itemLook.ts').ItemLook) => {
        requestedLook = look;
        return rifleModel;
      },
    } as unknown as import('../src/render/models.ts').ModelLibrary;
    const registry = testRegistry({ rifle: 4000, magazine: 200 });
    registry.items.set('rifle', { id: 'rifle', weight: 4000, size: [1, 4], model: 'rifle_model' } as never);
    registry.items.set('magazine', { id: 'magazine', weight: 200, size: [1, 2], model: 'magazine_model' } as never);
    registry.models.set('rifle_model', {
      slots: { magazine: { at: [0, 0, 0], turn: [0, 0, 0] } },
    } as never);
    const magazine = testItem('magazine');
    const rifle = { ...testItem('rifle'), slots: { magazine } } as Item;
    const throws = new ItemThrows(registry, models, 1);
    throws.spawn([0, 1, 0], [2, 1, 0], rifle);

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
    throws.spawn([0, 1, 0], [2, 1, 0], testItem('rag'));
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
    throws.spawn([0, 1, 0], [2, 1, 0], { ...testItem('glow'), on: true });
    const flight = throws.group.children[0] as Group;
    const marker = flight.children.find(
      (child) => child instanceof Mesh && child.material instanceof MeshBasicMaterial,
    ) as Mesh;
    const expected = new Color(light.color).multiplyScalar(light.emissive);

    expect(marker).toBeDefined();
    expect((marker.material as MeshBasicMaterial).color.equals(expected)).toBe(true);
    throws.dispose();
  });

  it('presents an item flight without adding a point light to the shader pool', () => {
    const registry = testRegistry({ rag: 20 });
    registry.items.set('rag', { id: 'rag', weight: 20, size: [1, 2] } as never);
    const throws = new ItemThrows(registry);
    throws.spawn([0, 1, 0], [2, 1, 0], testItem('rag'));

    expect(throws.group.children.some((child) => child instanceof PointLight)).toBe(false);
    throws.dispose();
  });

  it('settles a charged arc on the thrower side of a near wall', () => {
    const isSolid: SolidAt = (x, y) => y === 0 || (x === 4 && y > 0 && y < 4);
    const landing = traceItemLanding({
      from: [1.5, 1.5, 1.5],
      direction: [1, 0, 0],
      distanceMetres: 8,
      blockSize: 1,
      minY: -8,
      isSolid,
    });

    expect(landing).toBeDefined();
    expect(landing![0]).toBeLessThan(4);
    expect(landing![1]).toBe(1);
  });

  it('stops the charged arc at a low ceiling and settles below it', () => {
    const isSolid: SolidAt = (x, y) => y === 0 || (y === 2 && x < 6);
    const landing = traceItemLanding({
      from: [1.5, 1.5, 1.5],
      direction: [1, 0, 0],
      distanceMetres: 8,
      blockSize: 1,
      minY: -8,
      isSolid,
    });

    expect(landing).toBeDefined();
    expect(landing![0]).toBeLessThan(6);
    expect(landing![1]).toBe(1);
  });
});
