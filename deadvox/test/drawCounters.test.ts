import type { Vector2 } from 'three';
import { expect, it } from 'vitest';
import { DrawCounters } from '../src/render/drawCounters.ts';

const fixture = (autoReset = true) => {
  const info = {
    autoReset,
    render: { calls: 0, triangles: 0 },
    reset() {
      this.render.calls = 0;
      this.render.triangles = 0;
    },
  };
  const renderer = {
    info,
    getDrawingBufferSize: (target: Vector2) => target.set(900, 700),
    render(calls: number, triangles: number) {
      if (info.autoReset) {
        info.reset();
      }
      info.render.calls += calls;
      info.render.triangles += triangles;
    },
  };
  return { renderer, counters: new DrawCounters(renderer) };
};

it('accumulates every render submission in a frame and resets before the next frame', () => {
  const { renderer, counters } = fixture();
  renderer.render(100, 200);
  counters.begin();
  renderer.render(2, 11);
  renderer.render(3, 7);
  renderer.render(1, 13);
  counters.end();
  const first = counters.snapshot;
  expect(first).toEqual({ calls: 6, triangles: 31, drawingBufferWidth: 900, drawingBufferHeight: 700 });
  expect(renderer.info.autoReset).toBe(true);

  counters.begin();
  renderer.render(1, 5);
  counters.end();
  expect(counters.snapshot).toEqual({ calls: 1, triangles: 5, drawingBufferWidth: 900, drawingBufferHeight: 700 });
  expect(first?.calls).toBe(6);
});

it('restores the previous reset policy even if drawing-buffer sampling throws', () => {
  const { renderer, counters } = fixture();
  renderer.getDrawingBufferSize = () => {
    throw new Error('buffer unavailable');
  };
  counters.begin();
  expect(() => counters.end()).toThrow('buffer unavailable');
  expect(renderer.info.autoReset).toBe(true);
});
