import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { PlaytestObserver } from '../src/game/playtestObserver.ts';
import { SessionMetrics } from '../src/game/playtestTools.ts';
import type { Session } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);

const runFurnitureChain = (startsInFurniture: boolean, metrics = new SessionMetrics(1)) => {
  const inventory = new Inventory(registry);
  const backpack = inventory.create('school_backpack');
  inventory.add(backpack, { kind: 'hand', side: 'right' });
  const cupboard = inventory.furnish(
    { type: 'kitchen_cupboard', pos: [0, 0, 0], size: [2, 2, 1], facing: 'n' },
    startsInFurniture ? [{ type: 'rag', count: 1, condition: 1 }] : [],
  )!;
  inventory.entities.markSearched(cupboard);
  const item = startsInFurniture ? cupboard.pockets![0]![0]!.item : inventory.create('rag');
  if (!startsInFurniture) {
    inventory.add(item, { kind: 'pocket', owner: backpack, pocket: 0 });
  }
  const queue = new HandlingQueue(inventory);
  if (!queue.enqueue(item, { kind: 'hand', side: 'left' }).ok) {
    throw new Error('Could not queue the first chained move');
  }
  const target = startsInFurniture
    ? { kind: 'pocket' as const, owner: backpack, pocket: 0 }
    : { kind: 'furniture' as const, entity: cupboard, pocket: 0 };
  if (!queue.enqueue(item, target, item.count, true).ok) {
    throw new Error('Could not queue the dependent chained move');
  }

  const observer = new PlaytestObserver(metrics);
  observer.beginSearch(cupboard, 'kitchen cupboard');
  observer.beforeFrame(queue, inventory);
  const result = queue.tick(queue.remaining + 1);
  observer.handlingOutcomes(result);
  observer.afterFrame({ realSeconds: 1, screenOpen: true, visible: true }, queue, {
    sim: { paused: false, compression: { c: 1 } },
    inventory,
  } as never);
  return { inventory, backpack, cupboard, item, metrics };
};

describe('playtest observer', () => {
  it('uses each chained move’s execution-time source and handles both directions through furniture', () => {
    const fromFurniture = runFurnitureChain(true);
    expect(fromFurniture.metrics.toJSON().containersLooted).toEqual([
      { container: 'kitchen cupboard', handlingSeconds: 1, uiSeconds: 0 },
    ]);

    const intoFurniture = runFurnitureChain(false);
    expect(intoFurniture.inventory.locate(intoFurniture.item)).toMatchObject({
      kind: 'furniture',
      entity: intoFurniture.cupboard,
      pocket: 0,
    });
    expect(Object.keys(intoFurniture.metrics.toJSON().pocketUses)).toEqual([
      `furniture:${intoFurniture.cupboard.uid}:0:kitchen cupboard pocket 1`,
    ]);
  });

  it('keeps a metrics exception from escaping observer work into the simulation frame', () => {
    const metrics = new SessionMetrics(1);
    metrics.recordPocketUse = () => {
      throw new Error('optional metrics failure');
    };
    const result = runFurnitureChain(false, metrics);
    expect(result.inventory.locate(result.item)).toMatchObject({ kind: 'furniture', entity: result.cupboard });
  });

  it('attributes successful moves to their actual source UID and counts real elapsed UI time', () => {
    const counter = { uid: 10, type: 'counter', pockets: [] };
    const cupboard = { uid: 11, type: 'cupboard', pockets: [] };
    const item = { uid: 90, type: 'matches', count: 1 };
    const placed = { item, x: 0, y: 0, rotated: false };
    let location: unknown = { kind: 'furniture', entity: cupboard, pocket: 0, placed };
    const job = {
      kind: 'move',
      itemUid: item.uid,
      target: { kind: 'pile', pos: [0, 0, 0] },
      count: 1,
      label: 'matches',
      duration: 1,
      elapsed: 0,
    };
    const queue = { jobs: [job] };
    const inventory = {
      itemByUid: () => item,
      locate: () => location,
      entities: { defOf: (entity: { type: string }) => ({ name: entity.type }) },
    };
    const observerMetrics = new SessionMetrics(1);
    const observer = new PlaytestObserver(observerMetrics);
    observer.beginSearch(counter as never, 'counter');
    observer.beforeFrame(queue as never, inventory as never);
    const source = location as never;
    const session = { sim: { paused: false, compression: { c: 1 } }, inventory } as never;
    location = { kind: 'pile', pile: { pos: [0, 0, 0], items: [placed] }, placed };
    queue.jobs.length = 0;
    observer.handlingOutcomes({
      done: [job as never],
      failed: [],
      completedMoves: [{ job: job as never, source, sourceCount: 1 }],
    });
    observer.afterFrame({ realSeconds: 1, screenOpen: true, visible: true }, queue as never, session);
    expect(observerMetrics.toJSON().containersLooted).toEqual([
      { container: 'cupboard', handlingSeconds: 1, uiSeconds: 0 },
    ]);
  });

  it('keeps equal pocket indices distinct by owner UID and records successful moves only', () => {
    const ownerA = { uid: 20, type: 'school_backpack' };
    const ownerB = { uid: 21, type: 'jeans' };
    const item = { uid: 91, type: 'matches', count: 1 };
    let location: unknown = { kind: 'hand', side: 'left' };
    const queue = { jobs: [] as unknown[] };
    const inventory = {
      itemByUid: (uid: number) => {
        if (uid === item.uid) {
          return item;
        }
        return uid === ownerA.uid ? ownerA : ownerB;
      },
      locate: () => location,
      registry: { items: { get: () => ({ container: { pockets: [{ name: 'main' }] } }) } },
      name: (owner: { type: string }) => owner.type,
    };
    const metrics = new SessionMetrics(1);
    const observer = new PlaytestObserver(metrics);
    for (const owner of [ownerA, ownerB]) {
      const job = {
        kind: 'move',
        itemUid: item.uid,
        target: { kind: 'pocket', ownerUid: owner.uid, pocket: 0 },
        count: 1,
        label: 'matches',
        duration: 1,
        elapsed: 0,
      };
      queue.jobs.push(job);
      observer.beforeFrame(queue as never, inventory as never);
      const source = location as never;
      location = { kind: 'pocket', owner, pocket: 0, placed: { item, x: 0, y: 0, rotated: false } };
      observer.handlingOutcomes({
        done: [job as never],
        failed: [],
        completedMoves: [{ job: job as never, source, sourceCount: 1 }],
      });
      queue.jobs.length = 0;
      observer.afterFrame(
        { realSeconds: 0, screenOpen: false, visible: true },
        queue as never,
        { sim: { paused: false, compression: { c: 1 } }, inventory } as never,
      );
      location = { kind: 'hand', side: 'left' };
    }
    expect(Object.keys(metrics.toJSON().pocketUses)).toHaveLength(2);
    expect(Object.keys(metrics.toJSON().pocketUses).some((key) => key.startsWith('player:20:0:'))).toBe(true);
    expect(Object.keys(metrics.toJSON().pocketUses).some((key) => key.startsWith('player:21:0:'))).toBe(true);
  });

  it('measures delayed time independently of the simulation step cap', () => {
    const entity = { uid: 30, type: 'cabinet', pockets: [] };
    const metrics = new SessionMetrics(1);
    const observer = new PlaytestObserver(metrics);
    observer.beginSearch(entity as never, 'cabinet');
    observer.afterFrame(
      { realSeconds: 1, screenOpen: true, visible: true },
      { jobs: [] } as never,
      { sim: { paused: false, compression: { c: 1 } }, inventory: {} } as never,
    );
    const item = { uid: 92, type: 'matches', count: 1 };
    let location: unknown = { kind: 'furniture', entity, pocket: 0, placed: { item, x: 0, y: 0, rotated: false } };
    const sourceInventory = {
      itemByUid: () => item,
      locate: () => location,
      entities: { defOf: () => ({ name: 'cabinet' }) },
    };
    const job = {
      kind: 'move',
      itemUid: item.uid,
      target: { kind: 'pile', pos: [0, 0, 0] },
      count: 1,
      label: 'matches',
      duration: 1,
      elapsed: 0,
    };
    const queue = { jobs: [job] };
    observer.beforeFrame(queue as never, sourceInventory as never);
    const source = location as never;
    location = { kind: 'pile', pile: { pos: [0, 0, 0], items: [] }, placed: { item, x: 0, y: 0, rotated: false } };
    observer.handlingOutcomes({
      done: [job as never],
      failed: [],
      completedMoves: [{ job: job as never, source, sourceCount: 1 }],
    });
    queue.jobs.length = 0;
    observer.afterFrame(
      { realSeconds: 0, screenOpen: true, visible: true },
      queue as never,
      { sim: { paused: false, compression: { c: 1 } }, inventory: sourceInventory } as never,
    );
    expect(metrics.toJSON().containersLooted[0]?.uiSeconds).toBe(1);
  });
});

describe('playtest observer snapshot oracle', () => {
  it('catches a producer mutation by inspecting live state independently', () => {
    const entity = { uid: 9, pockets: [] };
    const runtime = {
      sim: {
        needs: { calories: 40, hydration: 35, fatigue: 70, stamina: 100 },
        body: { health: 100 },
        actions: { snapshotState: () => ({ job: null }) },
        paused: false,
        godMode: false,
        ignoreUnsafe: false,
        snapshotState: () => ({ health: runtime.sim.body.health }),
      },
      body: { pos: [1, 2, 3], vel: [0, -1, 0], onGround: false },
      inventory: { snapshotState: () => ({ version: 0 }) },
      quickbar: { snapshotState: () => [null, null] },
      entities: { all: new Set([entity]) },
      searching: () => true,
      queue: { jobs: [{ kind: 'action', jobType: 'furniture.search', elapsed: 1 }] },
      zombies: { snapshotState: () => ({}) },
      spawner: { snapshotState: () => [] },
      survival: { snapshotState: () => ({}) },
      playerAudio: {},
      worldDiffs: () => ({ chunks: [] }),
      audioState: () => ({}),
    } as unknown as Session;
    const observer = new PlaytestObserver(new SessionMetrics(1));
    const result = observer.measureSnapshot(
      () => {
        Object.assign(runtime.sim.body, { health: runtime.sim.body.health - 1 });
        return {};
      },
      runtime,
      1,
    );
    expect(result.netStateUnchanged).toBe(false);
    expect(runtime.sim.body.health).toBeLessThan(100);
  });
});
