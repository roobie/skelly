import type { WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { GpuPrograms } from '../src/render/gpuPrograms.ts';

const program = (complete = true) => {
  const state = { complete };
  return { state, isReady: vi.fn(() => state.complete), getUniforms: vi.fn() };
};

const rendererWith = (programs: readonly object[], parallel: boolean) =>
  ({
    info: { programs },
    extensions: { has: (name: string) => parallel && name === 'KHR_parallel_shader_compile' },
  }) as unknown as WebGLRenderer;

it('without parallel compilation, finishes first-use program checks on separate frames before reporting readiness', () => {
  const first = program();
  const second = program();
  const renderer = rendererWith([first, second], false);
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

it('with parallel compilation, checks every finished program in one step and waits only for those still compiling', () => {
  const finished = [program(), program(), program()];
  const compiling = program(false);
  const renderer = rendererWith([...finished, compiling], true);
  const programs = new GpuPrograms();
  expect(programs.step(renderer)).toBe(false);
  for (const each of finished) {
    expect(each.getUniforms).toHaveBeenCalledOnce();
  }
  expect(compiling.getUniforms).not.toHaveBeenCalled();
  compiling.state.complete = true;
  expect(programs.step(renderer)).toBe(true);
  expect(compiling.getUniforms).toHaveBeenCalledOnce();
});
