import { expect, it } from 'vitest';
import { Scene } from 'three';
import { TransientDebugDraw } from '../src/debug/transientDraw.ts';

it('keeps a default-lifetime primitive for one render frame', () => {
  const draw = new TransientDebugDraw(new Scene(), true);
  draw.line([0, 0, 0], [1, 0, 0], 100);
  draw.update(100);
  expect(draw.meshVertexCount()).toBe(2);
  draw.update(102);
  expect(draw.meshVertexCount()).toBe(0);
});

it('expires transient primitives using supplied Real time', () => {
  const scene = new Scene();
  const draw = new TransientDebugDraw(scene, true);
  draw.line([0, 0, 0], [1, 0, 0], 100, 25);
  draw.update(124);
  expect(draw.meshVertexCount()).toBe(2);
  draw.update(125);
  expect(draw.meshVertexCount()).toBe(0);
});

it('drops the oldest primitive when the queue reaches its cap', () => {
  const draw = new TransientDebugDraw(new Scene(), true, 2);
  draw.line([0, 0, 0], [1, 0, 0], 0, 100);
  draw.line([0, 1, 0], [1, 1, 0], 0, 100);
  draw.line([0, 2, 0], [1, 2, 0], 0, 100);
  draw.update(1);
  expect(draw.dropped.count).toBe(1);
  expect(draw.meshVertexCount()).toBe(4);
});

it('creates no scene objects when debug drawing is disabled', () => {
  const scene = new Scene();
  const draw = new TransientDebugDraw(scene, false);
  draw.line([0, 0, 0], [1, 0, 0], 0, 100);
  draw.update(1);
  expect(scene.children).toHaveLength(0);
  expect(draw.enabled).toBe(false);
});
