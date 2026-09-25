import { describe, expect, it } from 'vitest';
import { MapEntityStore } from '../src/core/entities.ts';
import { EventQueue } from '../src/core/events.ts';
import { Rng } from '../src/core/random.ts';
import { Scheduler } from '../src/core/scheduler.ts';

describe('Scheduler', () => {
  it('ticks each system at its rate, in time order', () => {
    const scheduler = new Scheduler();
    const log: string[] = [];
    scheduler.register({ id: 'slow', rate: 2, tick: (_dt, t) => log.push(`slow ${t}`) });
    scheduler.register({ id: 'fast', rate: 4, tick: (_dt, t) => log.push(`fast ${t}`) });
    scheduler.advance(1);
    expect(log).toEqual(['fast 0.25', 'slow 0.5', 'fast 0.5', 'fast 0.75', 'slow 1', 'fast 1']);
    expect(scheduler.time).toBe(1);
  });

  it('carries partial steps over to the next advance', () => {
    const scheduler = new Scheduler();
    let ticks = 0;
    scheduler.register({
      id: 'physics',
      rate: 60,
      tick: () => {
        ticks += 1;
      },
    });
    for (let i = 0; i < 600; i++) {
      scheduler.advance(1 / 144);
    }
    expect(scheduler.time).toBeCloseTo(600 / 144, 9);
    expect(Math.abs(ticks - (600 / 144) * 60)).toBeLessThanOrEqual(1);
  });

  it('grows the steps of slow systems under compression, up to their maxStep', () => {
    const scheduler = new Scheduler();
    const steps = { needs: [] as number[], physics: [] as number[] };
    scheduler.register({ id: 'needs', rate: 1, maxStep: 10, tick: (dt) => steps.needs.push(dt) });
    scheduler.register({ id: 'physics', rate: 60, tick: (dt) => steps.physics.push(dt) });
    scheduler.advance(30, 30);
    expect(steps.needs).toEqual([10, 10, 10]);
    expect(steps.physics).toHaveLength(1800);
    expect(steps.physics.every((dt) => dt === 1 / 60)).toBe(true);
  });

  it('stops when halted and drops the rest of the advance', () => {
    const scheduler = new Scheduler();
    let ticks = 0;
    scheduler.register({
      id: 'ai',
      rate: 10,
      tick: () => {
        ticks += 1;
      },
    });
    const advanced = scheduler.advance(5, 1, () => ticks === 3);
    expect(advanced).toBeCloseTo(0.3, 9);
    expect(scheduler.time).toBeCloseTo(0.3, 9);
  });

  it('rejects a system registered twice', () => {
    const scheduler = new Scheduler();
    scheduler.register({ id: 'needs', rate: 1, tick: () => undefined });
    expect(() => scheduler.register({ id: 'needs', rate: 1, tick: () => undefined })).toThrow();
  });
});

describe('EventQueue', () => {
  it('gives every reader each event once, from when it was created', () => {
    const queue = new EventQueue<number>();
    queue.emit(0);
    const a = queue.reader();
    queue.emit(1);
    const b = queue.reader();
    queue.emit(2);
    expect(a.read()).toEqual([1, 2]);
    expect(a.read()).toEqual([]);
    expect(b.read()).toEqual([2]);
    queue.emit(3);
    expect(b.read()).toEqual([3]);
    expect(a.read()).toEqual([3]);
  });

  it('drops events every reader has seen', () => {
    const queue = new EventQueue<number>();
    const a = queue.reader();
    const b = queue.reader();
    for (let i = 0; i < 100; i++) {
      queue.emit(i);
    }
    a.read();
    expect(queue.pending).toBe(100);
    b.read();
    expect(queue.pending).toBe(0);
  });
});

describe('Rng', () => {
  it('is repeatable, stays in range, and restores from its state', () => {
    const a = Rng.stream(3, 'loot');
    const b = Rng.stream(3, 'loot');
    const values = Array.from({ length: 1000 }, () => a.next());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);

    const restored = new Rng(a.state());
    expect(restored.next()).toBe(a.next());
  });

  it('differs between seeds and ids', () => {
    expect(Rng.stream(3, 'loot').next()).not.toBe(Rng.stream(4, 'loot').next());
    expect(Rng.stream(3, 'loot').next()).not.toBe(Rng.stream(3, 'zombies').next());
  });

  it('draws integers across the whole inclusive range', () => {
    const rng = Rng.stream(1, 'dice');
    const seen = new Set(Array.from({ length: 200 }, () => rng.int(1, 6)));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('MapEntityStore', () => {
  it('never reuses ids', () => {
    const store = new MapEntityStore<{ name: string }>();
    const a = store.add({ name: 'a' });
    const b = store.add({ name: 'b' });
    expect(store.remove(a)).toBe(true);
    const c = store.add({ name: 'c' });
    expect(new Set([a, b, c]).size).toBe(3);
    expect(store.get(a)).toBeUndefined();
    expect([...store.entries()].map(([, e]) => e.name)).toEqual(['b', 'c']);
    expect(store.size).toBe(2);
  });
});
