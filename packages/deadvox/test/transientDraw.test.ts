import { type LineSegments, Scene } from 'three';
import { expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { TransientDebugDraw } from '../src/debug/transientDraw.ts';

it('keeps a default-lifetime primitive for one render frame', () => {
  const draw = new TransientDebugDraw(new Scene(), true);
  draw.line([0, 0, 0], [1, 0, 0], 100);
  draw.update(500);
  expect(draw.meshVertexCount()).toBe(2);
  draw.update(500);
  expect(draw.meshVertexCount()).toBe(0);
});

it('expires transient primitives using supplied Real time', () => {
  const scene = new Scene();
  const draw = new TransientDebugDraw(scene, true);
  draw.line([0, 0, 0], [1, 0, 0], 100, { durationRealMs: 25 });
  draw.update(124);
  expect(draw.meshVertexCount()).toBe(2);
  draw.update(125);
  expect(draw.meshVertexCount()).toBe(0);
});

it('drops the oldest primitive when the queue reaches its cap', () => {
  const scene = new Scene();
  const draw = new TransientDebugDraw(scene, true, 2);
  draw.line([0, 0, 0], [1, 0, 0], 0, { durationRealMs: 100 });
  draw.line([0, 1, 0], [1, 1, 0], 0, { durationRealMs: 100 });
  draw.line([0, 2, 0], [1, 2, 0], 0, { durationRealMs: 100 });
  draw.update(1);
  expect(draw.dropped.count).toBe(1);
  expect(draw.meshVertexCount()).toBe(4);
  const mesh = scene.children[0] as LineSegments;
  expect(Array.from(mesh.geometry.attributes.position!.array).slice(0, 12)).toEqual([
    0, 1, 0, 1, 1, 0, 0, 2, 0, 1, 2, 0,
  ]);
});

it.each(['line', 'box', 'point'] as const)('copies caller coordinates for %s primitives', (kind) => {
  const scene = new Scene();
  const draw = new TransientDebugDraw(scene, true);
  const a: Vec3 = [0, 0, 0];
  const b: Vec3 = [1, 1, 1];
  if (kind === 'point') {
    draw.point(a, 0, { size: 1, durationRealMs: 100 });
  } else {
    draw[kind](a, b, 0, { durationRealMs: 100 });
  }
  draw.update(1);
  const mesh = scene.children[0] as LineSegments;
  const before = Array.from(mesh.geometry.attributes.position!.array).slice(0, draw.meshVertexCount() * 3);
  a.fill(10);
  b.fill(20);
  draw.update(2);
  expect(Array.from(mesh.geometry.attributes.position!.array).slice(0, draw.meshVertexCount() * 3)).toEqual(before);
  expect(draw.meshVertexCount()).toBeGreaterThan(0);
});

it('disposes scene geometry and material once and refuses subsequent drawing', () => {
  const scene = new Scene();
  const draw = new TransientDebugDraw(scene, true);
  const mesh = scene.children[0] as LineSegments;
  const geometryDisposed = vi.fn();
  const materialDisposed = vi.fn();
  mesh.geometry.addEventListener('dispose', geometryDisposed);
  if (Array.isArray(mesh.material)) {
    throw new Error('expected a batched material');
  }
  mesh.material.addEventListener('dispose', materialDisposed);
  draw.line([0, 0, 0], [1, 0, 0], 0);
  draw.dispose();
  draw.dispose();
  draw.line([0, 0, 0], [1, 0, 0], 0);
  draw.update(0);
  expect(scene.children).toHaveLength(0);
  expect(draw.enabled).toBe(false);
  expect(draw.meshVertexCount()).toBe(0);
  expect(geometryDisposed).toHaveBeenCalledTimes(1);
  expect(materialDisposed).toHaveBeenCalledTimes(1);
});

it('creates no scene objects when debug drawing is disabled', () => {
  const scene = new Scene();
  const draw = new TransientDebugDraw(scene, false);
  const options = {
    get color(): number {
      throw new Error('disabled methods must not read options');
    },
  };
  draw.line([0, 0, 0], [1, 0, 0], 0, options);
  draw.box([0, 0, 0], [1, 1, 1], 0, options);
  draw.point([0, 0, 0], 0, options);
  draw.update(1);
  expect(scene.children).toHaveLength(0);
  expect(draw.enabled).toBe(false);
});
