import { InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { itemFlightPoint } from '../src/core/itemThrow.ts';
import { pileBundleHeight } from '../src/core/pileLayout.ts';
import { reachTuning } from '../src/core/reach.ts';
import { PILE_DISPLAY_KIND } from '../src/core/schema.ts';
import { ItemThrows } from '../src/render/itemThrows.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { presentationFlight } from './itemFlightFixture.ts';

const base = baseRegistry();

const { throwFlightSimSeconds: ITEM_FLIGHT_SECONDS } = reachTuning(base);

const fixtureRegistry = () => ({ ...base, items: new Map(base.items) });
const pile = { kind: 'pile' as const, pos: [2, 0, 0] as [number, number, number] };

it('aligns a landing with the bundle after excluding another active throw', () => {
  const registry = fixtureRegistry();
  registry.items.set('projection_small', {
    ...base.items.get('rag')!,
    id: 'projection_small',
    size: [1, 1],
    model: undefined,
    stack: undefined,
    pileDisplay: undefined,
  });
  registry.items.set('projection_large', {
    ...base.items.get('rag')!,
    id: 'projection_large',
    size: [7, 5],
    model: undefined,
    stack: undefined,
    pileDisplay: undefined,
  });
  const inventory = new Inventory(registry);
  const first = inventory.create('projection_small');
  const second = inventory.create('projection_large');
  expect(inventory.add(first, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.add(second, { kind: 'hand', side: 'left' })).toBe(true);
  const throws = new ItemThrows(registry, undefined, 0.5, 17);
  const piles = new PileMeshes(0.5, undefined, 17);

  expect(inventory.throwToPile(first, 'right', pile).ok).toBe(true);
  throws.spawn(
    {
      item: first,
      flight: presentationFlight,
      origin: [0, 1, 0],
      startedAtSimSeconds: 0,
      landingAt: ITEM_FLIGHT_SECONDS,
    },
    inventory,
  );
  expect(inventory.throwToPile(second, 'left', pile).ok).toBe(true);
  const secondStart = ITEM_FLIGHT_SECONDS / 2;
  throws.spawn(
    {
      item: second,
      flight: presentationFlight,
      origin: [0, 1, 0],
      startedAtSimSeconds: secondStart,
      landingAt: secondStart + ITEM_FLIGHT_SECONDS,
    },
    inventory,
  );
  const snapshot = inventory.snapshotState();

  throws.update(ITEM_FLIGHT_SECONDS, inventory);
  expect(throws.activeCount).toBe(1);
  expect(throws.hiddenItemUids.has(first.uid)).toBe(false);
  expect(throws.hiddenItemUids.has(second.uid)).toBe(true);
  piles.sync(inventory, throws.hiddenItemUids);
  const bundle = piles.group.children.find((object) => object instanceof Mesh && !(object instanceof InstancedMesh));
  expect(bundle).toBeDefined();
  expect(bundle!.scale.y).toBeCloseTo(pileBundleHeight(registry, [{ item: first, x: 0, y: 0, rotated: false }]));
  expect(throws.group.children[0]!.position.distanceTo(bundle!.position)).toBeLessThan(1e-5);
  expect(inventory.snapshotState()).toEqual(snapshot);

  piles.dispose();
  throws.dispose();
});

it('updates a reused arc after later-indexed arcs have landed', () => {
  const registry = fixtureRegistry();
  registry.items.set('projection_small', {
    ...base.items.get('rag')!,
    id: 'projection_small',
    size: [1, 1],
    model: undefined,
    stack: undefined,
    pileDisplay: undefined,
  });
  registry.items.set('projection_large', {
    ...base.items.get('rag')!,
    id: 'projection_large',
    size: [7, 5],
    model: undefined,
    stack: undefined,
    pileDisplay: undefined,
  });
  const inventory = new Inventory(registry);
  const first = inventory.create('projection_small');
  const second = inventory.create('projection_large');
  const third = inventory.create('projection_small');
  const otherPile = { kind: 'pile' as const, pos: [1, 0, 0] as [number, number, number] };
  expect(inventory.add(first, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.add(second, { kind: 'hand', side: 'left' })).toBe(true);
  expect(inventory.add(third, otherPile)).toBe(true);
  const throws = new ItemThrows(registry, undefined, 0.5, 17);
  const piles = new PileMeshes(0.5, undefined, 17);
  const endpointPiles = new PileMeshes(0.5, undefined, 17);
  const origin: [number, number, number] = [0, 1, 0];

  expect(inventory.throwToPile(first, 'right', pile).ok).toBe(true);
  throws.spawn(
    { item: first, flight: presentationFlight, origin, startedAtSimSeconds: 0, landingAt: ITEM_FLIGHT_SECONDS },
    inventory,
  );
  const secondStart = ITEM_FLIGHT_SECONDS / 2;
  expect(inventory.throwToPile(second, 'left', pile).ok).toBe(true);
  throws.spawn(
    {
      item: second,
      flight: presentationFlight,
      origin,
      startedAtSimSeconds: secondStart,
      landingAt: secondStart + ITEM_FLIGHT_SECONDS,
    },
    inventory,
  );
  throws.update(ITEM_FLIGHT_SECONDS, inventory);
  expect(throws.activeCount).toBe(1);
  expect(throws.group.children[0]!.visible).toBe(false);

  expect(inventory.move(third, { kind: 'hand', side: 'right' }).ok).toBe(true);
  expect(inventory.throwToPile(third, 'right', pile).ok).toBe(true);
  const thirdStart = ITEM_FLIGHT_SECONDS * 1.25;
  throws.spawn(
    {
      item: third,
      flight: presentationFlight,
      origin,
      startedAtSimSeconds: thirdStart,
      landingAt: thirdStart + ITEM_FLIGHT_SECONDS,
    },
    inventory,
  );
  expect(throws.activeCount).toBe(2);
  expect(throws.group.children).toHaveLength(2);
  const activeThird = throws.group.children[0]!;
  const snapshot = inventory.snapshotState();
  const landingTime = secondStart + ITEM_FLIGHT_SECONDS;

  for (let step = 1; step < 15; step += 1) {
    const simTime = thirdStart + ((landingTime - thirdStart) * step) / 15;
    throws.update(simTime, inventory);
    expect(throws.activeCount).toBe(2);
  }
  throws.update(landingTime, inventory);
  expect(throws.activeCount).toBe(1);
  expect(throws.hiddenItemUids.has(second.uid)).toBe(false);
  expect(throws.hiddenItemUids.has(third.uid)).toBe(true);
  expect(activeThird.visible).toBe(true);

  piles.sync(inventory, throws.hiddenItemUids);
  const visibleBundle = piles.group.children.find(
    (object) => object instanceof Mesh && !(object instanceof InstancedMesh),
  );
  expect(visibleBundle).toBeDefined();
  const otherHiddenItemUids = new Set(throws.hiddenItemUids);
  otherHiddenItemUids.delete(third.uid);
  endpointPiles.sync(inventory, otherHiddenItemUids);
  const endpointBundle = endpointPiles.group.children.find(
    (object) => object instanceof Mesh && !(object instanceof InstancedMesh),
  );
  expect(endpointBundle).toBeDefined();
  const expected = new Vector3(
    ...itemFlightPoint(
      origin,
      endpointBundle!.position.toArray() as [number, number, number],
      (landingTime - thirdStart) / ITEM_FLIGHT_SECONDS,
      presentationFlight,
    ),
  );
  expect(activeThird.position.distanceTo(expected)).toBeLessThan(1e-5);
  expect(inventory.snapshotState()).toEqual(snapshot);

  const nextTime = landingTime + ITEM_FLIGHT_SECONDS / 60;
  throws.update(nextTime, inventory);
  const nextExpected = new Vector3(
    ...itemFlightPoint(
      origin,
      endpointBundle!.position.toArray() as [number, number, number],
      (nextTime - thirdStart) / ITEM_FLIGHT_SECONDS,
      presentationFlight,
    ),
  );
  expect(activeThird.position.distanceTo(nextExpected)).toBeLessThan(1e-5);
  piles.dispose();
  endpointPiles.dispose();
  throws.dispose();
});

it('aligns a thrown scatter item with its seeded scatter placement', () => {
  const registry = fixtureRegistry();
  registry.items.set('projection_scatter', {
    ...base.items.get('rag')!,
    id: 'projection_scatter',
    size: [1, 1],
    model: undefined,
    stack: undefined,
    pileDisplay: PILE_DISPLAY_KIND.scatter,
  });
  const inventory = new Inventory(registry);
  const item = inventory.create('projection_scatter');
  expect(inventory.add(item, { kind: 'hand', side: 'right' })).toBe(true);
  const throws = new ItemThrows(registry, undefined, 0.5, 23);
  const piles = new PileMeshes(0.5, undefined, 23);
  expect(inventory.throwToPile(item, 'right', pile).ok).toBe(true);
  const snapshot = inventory.snapshotState();

  throws.spawn({ item, flight: presentationFlight, origin: [0, 1, 0], landingAt: ITEM_FLIGHT_SECONDS }, inventory);
  throws.update(ITEM_FLIGHT_SECONDS, inventory);
  expect(throws.activeCount).toBe(0);
  piles.sync(inventory, throws.hiddenItemUids);
  const scatter = piles.group.children.find((object) => object instanceof InstancedMesh);
  expect(scatter).toBeDefined();
  expect(scatter!.count).toBeGreaterThan(0);
  const matrix = new Matrix4();
  scatter!.getMatrixAt(0, matrix);
  const drawn = new Vector3().setFromMatrixPosition(matrix);
  expect(throws.group.children[0]!.position.distanceTo(drawn)).toBeLessThan(1e-5);
  expect(inventory.snapshotState()).toEqual(snapshot);

  piles.dispose();
  throws.dispose();
});
