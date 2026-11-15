// biome-ignore-all lint: The proxy mirrors the WebGL API's dynamic dispatch for debug-only instrumentation.
import type { WebGLRendererParameters } from 'three';

type ProgramRecord = {
  readonly shaders: string[];
  linkedAt: number | undefined;
  completedAt: number | undefined;
  compileMs: number;
  linkMs: number;
  parameterMs: number;
};

const familyOf = (source: string): string => {
  const name = /#define SHADER_NAME\s+(\w+)/.exec(source)?.[1]?.toLowerCase() ?? '';
  if (name.includes('bloom')) return 'bloom';
  if (name.includes('output') || source.includes('toneMapping')) return 'post';
  if (source.includes('skelly-height-fog')) return 'height fog';
  if (source.includes('fabric-woven')) return 'fabric';
  if (source.includes('skelly-gore-splat')) return 'gore';
  if (source.includes('skelly-chunk')) return 'chunk';
  if (source.includes('skelly-mob-actor')) return 'crowd';
  if (source.includes('DEPTH_PACKING')) return 'depth';
  if (name.includes('lambert')) return 'lambert';
  if (name.includes('basic')) return 'basic';
  return name || 'other';
};

const definesOf = (source: string): string[] =>
  [...source.matchAll(/^#define\s+(\w+)(?:\s+([^\n]+))?/gm)]
    .map(([, name, value]) => (name ? (value ? `${name}=${value}` : name) : undefined))
    .filter((define): define is string => define !== undefined && !['HIGH_PRECISION', 'GAMMA_FACTOR'].includes(define));

/** Debug-only WebGL call timing. The proxy binds every untouched call to the real context. */
export class ProgramTiming {
  private readonly records = new Map<WebGLProgram, ProgramRecord>();
  private readonly sources = new Map<WebGLShader, string>();
  private readonly context: WebGL2RenderingContext;
  private completionStatus: number | undefined;

  constructor(context: WebGL2RenderingContext) {
    this.context = context;
  }

  rendererParameters(canvas: HTMLCanvasElement, antialias: boolean): WebGLRendererParameters {
    return {
      canvas,
      context: new Proxy(this.context, { get: (target, key) => this.value(target, key) }) as WebGL2RenderingContext,
      antialias,
    };
  }

  report(): void {
    const programs = [...this.records.values()];
    const rows = programs.map((record) => {
      const source = record.shaders.join('\n');
      return {
        family: familyOf(source),
        defines: [...new Set(record.shaders.flatMap(definesOf))],
        linkToCompleteMs: record.completedAt && record.linkedAt ? record.completedAt - record.linkedAt : undefined,
        blockedGlMs: record.compileMs + record.linkMs + record.parameterMs,
      };
    });
    console.info(`deadvox load: programs ${JSON.stringify({ total: rows.length, programs: rows })}`);
  }

  private value(target: WebGL2RenderingContext, key: string | symbol): unknown {
    if (key === 'getExtension') {
      return (name: string) => {
        const extension = target.getExtension(name);
        if (name === 'KHR_parallel_shader_compile') {
          this.completionStatus = (extension as { COMPLETION_STATUS_KHR?: number } | null)?.COMPLETION_STATUS_KHR;
        }
        return extension;
      };
    }
    if (key === 'shaderSource') return (shader: WebGLShader, source: string) => this.shaderSource(shader, source);
    if (key === 'attachShader')
      return (program: WebGLProgram, shader: WebGLShader) => this.attachShader(program, shader);
    if (key === 'compileShader') return (shader: WebGLShader) => this.compileShader(shader);
    if (key === 'linkProgram') return (program: WebGLProgram) => this.linkProgram(program);
    if (key === 'getProgramParameter')
      return (program: WebGLProgram, parameter: number) => this.getProgramParameter(program, parameter);
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }

  private record(program: WebGLProgram): ProgramRecord {
    let record = this.records.get(program);
    if (!record) {
      record = { shaders: [], linkedAt: undefined, completedAt: undefined, compileMs: 0, linkMs: 0, parameterMs: 0 };
      this.records.set(program, record);
    }
    return record;
  }

  private shaderSource(shader: WebGLShader, source: string): void {
    this.sources.set(shader, source);
    this.context.shaderSource(shader, source);
  }

  private attachShader(program: WebGLProgram, shader: WebGLShader): void {
    const source = this.sources.get(shader);
    if (source) this.record(program).shaders.push(source);
    this.context.attachShader(program, shader);
  }

  private compileShader(shader: WebGLShader): void {
    const started = performance.now();
    this.context.compileShader(shader);
    const elapsed = performance.now() - started;
    for (const record of this.records.values()) {
      if (record.shaders.includes(this.sources.get(shader) ?? '')) record.compileMs += elapsed;
    }
  }

  private linkProgram(program: WebGLProgram): void {
    const started = performance.now();
    this.context.linkProgram(program);
    const record = this.record(program);
    record.linkMs += performance.now() - started;
    record.linkedAt = performance.now();
  }

  private getProgramParameter(program: WebGLProgram, parameter: number): unknown {
    const started = performance.now();
    const result = this.context.getProgramParameter(program, parameter);
    const record = this.record(program);
    record.parameterMs += performance.now() - started;
    if (result === true && (parameter === this.context.LINK_STATUS || parameter === this.completionStatus))
      record.completedAt ??= performance.now();
    return result;
  }
}
