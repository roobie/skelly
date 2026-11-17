import type { WebGLRenderer } from 'three';

/** Without parallel compilation, compileAsync resolves before three's first-use link checks. */
export class GpuPrograms {
  private readonly ready = new WeakSet<object>();

  step(renderer: WebGLRenderer): boolean {
    const pending = renderer.info.programs?.filter((program) => !this.ready.has(program)) ?? [];
    const [next] = pending;
    if (next) {
      next.getUniforms();
      this.ready.add(next);
    }
    return pending.length <= 1;
  }
}
