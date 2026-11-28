import { expect, it, vi } from 'vitest';
import type { FurnitureDef, Registry } from '../src/content.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { compareCodeUnits } from '../src/core/codeUnitOrder.ts';
import { FurnitureBoundsView } from '../src/core/furnitureBounds.ts';
import type { SkyBlocker } from '../src/core/skylight.ts';
import { captureSky, furnitureBounds } from '../src/core/skySnapshot.ts';
import { World } from '../src/core/world.ts';

const fixture = () => {
  const def = { id: 'piece', size: [1, 1, 1], breach: { durability: 1 } } as FurnitureDef;
  const entities = new BlockEntities({ furniture: new Map([[def.id, def]]), blocks: [] } as unknown as Registry);
  const add = (x: number) => entities.add({ type: def.id, pos: [x, 0, 0], size: [1, 1, 1], facing: 'n' })!;
  return { entities, add };
};
const sorted = (boxes: Iterable<SkyBlocker>) => [...boxes].map((box) => JSON.stringify(box)).sort(compareCodeUnits);

it('shares changed-piece geometry while placement and removal match a full rebuild for independent readers', () => {
  const { entities, add } = fixture();
  const removed = add(0);
  const untouched = add(2);
  const first = new FurnitureBoundsView(entities);
  const second = new FurnitureBoundsView(entities);
  const invalidate = vi.fn();
  first.refresh(invalidate);
  second.refresh(invalidate);
  const reads = vi.spyOn(entities, 'lightBlockingBoxes');
  const placed = add(4);
  entities.destroy(removed);
  invalidate.mockClear();
  first.refresh(invalidate);
  second.refresh(vi.fn());
  expect(reads.mock.calls.map(([piece]) => piece)).toEqual([placed]);
  expect(reads).not.toHaveBeenCalledWith(untouched);
  expect(invalidate.mock.calls.map(([box]) => box)).toEqual(
    expect.arrayContaining([
      { min: [0, 0, 0], max: [1, 1, 1], shade: 1 },
      { min: [4, 0, 0], max: [5, 1, 1], shade: 1 },
    ]),
  );
  const rebuilt = sorted(furnitureBounds(entities));
  expect(rebuilt).toHaveLength(2);
  expect(sorted(first.boxes())).toEqual(rebuilt);
  expect(sorted(second.boxes())).toEqual(rebuilt);
});

it('checks sky currency by bounds rather than the incremental views enumeration order', () => {
  const { entities, add } = fixture();
  add(0);
  add(2);
  const boxes = furnitureBounds(entities);
  const capture = captureSky(
    { world: new World(), entities, registry: entities.registry },
    { min: [0, 0, 0], max: [3, 1, 1] },
    { bottom: 0, top: 1 },
    boxes,
  );
  let step = capture.next();
  while (!step.done) {
    step = capture.next();
  }
  expect(step.value.input.furniture).toHaveLength(2);
  expect(step.value.current(boxes.toReversed())).toBe(true);
  expect(step.value.current(boxes.slice(1))).toBe(false);
});

it('replaces old object identities after restore even when a reader missed earlier edits', () => {
  const { entities, add } = fixture();
  add(0);
  const view = new FurnitureBoundsView(entities);
  view.refresh(vi.fn());
  const saved = entities.snapshotState();
  add(2);
  entities.restoreState(saved);
  const invalidate = vi.fn();
  view.refresh(invalidate);
  expect(invalidate).toHaveBeenCalled();
  expect(sorted(view.boxes())).toEqual(sorted(furnitureBounds(entities)));
});
