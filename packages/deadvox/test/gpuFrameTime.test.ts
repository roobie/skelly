import { expect, it, vi } from 'vitest';
import { GpuFrameTime } from '../src/render/gpuFrameTime.ts';

it('reads completed GPU queries without blocking and discards disjoint results', () => {
  let available = false;
  let disjoint = false;
  const gl = {
    QUERY_RESULT_AVAILABLE: 'available',
    QUERY_RESULT: 'result',
    CURRENT_QUERY: 'current',
    getExtension: () => ({ TIME_ELAPSED_EXT: 'elapsed', GPU_DISJOINT_EXT: 'disjoint' }),
    isContextLost: () => false,
    getParameter: () => disjoint,
    getQuery: () => null,
    createQuery: () => ({}),
    beginQuery: vi.fn(),
    endQuery: vi.fn(),
    deleteQuery: vi.fn(),
    getQueryParameter: (_query: unknown, name: string) => (name === 'available' ? available : 7e6),
  };
  const timer = new GpuFrameTime(gl as unknown as WebGL2RenderingContext);
  const sample = vi.fn();
  const getScale = () => 0.6;
  timer.begin(getScale, sample)!();
  expect(timer.begin(getScale, sample)).toBeUndefined();
  expect(sample).not.toHaveBeenCalled();
  available = true;
  timer.begin(getScale, sample)!();
  expect(sample).toHaveBeenCalledWith(7, getScale());
  sample.mockClear();
  disjoint = true;
  expect(timer.begin(getScale, sample)).toBeUndefined();
  expect(sample).not.toHaveBeenCalled();
  expect(gl.deleteQuery).toHaveBeenCalled();
});

it('leaves unsupported timers and enclosing diagnostic queries alone', () => {
  const gl = {
    getExtension: () => null,
    beginQuery: vi.fn(),
  };
  expect(new GpuFrameTime(gl as unknown as WebGL2RenderingContext).begin(() => 1, vi.fn())).toBeUndefined();
  const busy = {
    ...gl,
    getExtension: () => ({}),
    isContextLost: () => false,
    getParameter: () => false,
    getQuery: () => ({}),
  };
  expect(new GpuFrameTime(busy as unknown as WebGL2RenderingContext).begin(() => 1, vi.fn())).toBeUndefined();
  expect(gl.beginQuery).not.toHaveBeenCalled();
});
