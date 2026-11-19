import type { WebGLProgram, WebGLRenderer } from 'three';

/** three's program, with the completion query its typings omit; it asks the driver without blocking. */
type CompilingProgram = WebGLProgram & { isReady(): boolean };

/**
 * Without parallel compilation, compileAsync resolves before three's first-use link checks. With it, every
 * program the driver reports finished is checked in the same step, since none of those checks blocks; without
 * it, one check per step keeps each blocking link to a frame of its own.
 */
export class GpuPrograms {
  private readonly ready = new WeakSet<object>();

  step(renderer: WebGLRenderer): boolean {
    const pending = (renderer.info.programs ?? []).filter((program) => !this.ready.has(program)) as CompilingProgram[];
    const checked = renderer.extensions.has('KHR_parallel_shader_compile')
      ? pending.filter((program) => program.isReady())
      : pending.slice(0, 1);
    for (const program of checked) {
      program.getUniforms();
      this.ready.add(program);
    }
    return checked.length === pending.length;
  }
}
