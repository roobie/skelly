import type { WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { GpuPrograms } from '../src/render/gpuPrograms.ts';

it('finishes first-use program checks on separate frames before reporting readiness', () => {
  const first = { getUniforms: vi.fn() };
  const second = { getUniforms: vi.fn() };
  const renderer = { info: { programs: [first, second] } } as unknown as WebGLRenderer;
  const programs = new GpuPrograms();
  expect(programs.step(renderer)).toBe(false);
  expect(first.getUniforms).toHaveBeenCalledOnce();
  expect(second.getUniforms).not.toHaveBeenCalled();
  expect(programs.step(renderer)).toBe(true);
  expect(second.getUniforms).toHaveBeenCalledOnce();
  expect(programs.step(renderer)).toBe(true);
  expect(first.getUniforms).toHaveBeenCalledOnce();
  expect(second.getUniforms).toHaveBeenCalledOnce();
});
