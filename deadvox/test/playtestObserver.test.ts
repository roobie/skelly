import { describe, expect, it } from 'vitest';
import { PlaytestObserver } from '../src/game/playtestObserver.ts';
import { createSnapshotHistory, SessionMetrics } from '../src/game/playtestTools.ts';
import type { Session } from '../src/game/session.ts';

describe('playtest observer', () => {
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
    const session = { sim: { paused: false, compression: { c: 1 } }, inventory } as never;
    location = { kind: 'pile', pile: { pos: [0, 0, 0], items: [placed] }, placed };
    queue.jobs.length = 0;
    observer.handlingOutcomes({ done: [job as never], failed: [] });
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
      location = { kind: 'pocket', owner, pocket: 0, placed: { item, x: 0, y: 0, rotated: false } };
      observer.handlingOutcomes({ done: [job as never], failed: [] });
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
    location = { kind: 'pile', pile: { pos: [0, 0, 0], items: [] }, placed: { item, x: 0, y: 0, rotated: false } };
    observer.handlingOutcomes({ done: [job as never], failed: [] });
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
        needs: { health: 100 },
        paused: false,
        godMode: false,
        ignoreUnsafe: false,
        snapshotState: () => ({ health: runtime.sim.needs.health }),
      },
      body: { pos: [1, 2, 3], vel: [0, -1, 0], onGround: false },
      inventory: { snapshotState: () => ({ version: 0 }) },
      quickbar: { snapshotState: () => [null, null] },
      entities: { all: new Set([entity]) },
      searching: () => true,
      queue: { jobs: [{ kind: 'action', jobType: 'furniture.search', elapsed: 1 }] },
      zombies: { snapshotState: () => ({}) },
      spawner: { snapshotState: () => [] },
      rest: { snapshotState: () => ({}) },
      survival: { snapshotState: () => ({}) },
      playerAudio: {},
      worldDiffs: () => ({ chunks: [] }),
      audioState: () => ({}),
    } as unknown as Session;
    const observer = new PlaytestObserver(new SessionMetrics(1));
    const result = observer.measureSnapshot(
      () => {
        runtime.sim.needs.health -= 1;
        return {};
      },
      runtime,
      createSnapshotHistory(),
      1,
    );
    expect(result.stateUnchanged).toBe(false);
    expect(runtime.sim.needs.health).toBe(99);
  });
});
