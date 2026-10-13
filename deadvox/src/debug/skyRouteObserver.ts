import type { IUniform, Texture, WebGLRenderer } from 'three';
import type { Engine } from '../game/engine.ts';
import type { SkyRouteJob, SkyRoutePhase } from './skyRouteMetrics.ts';

type Method = (...args: unknown[]) => unknown;
export function observeSkyRoute(engine: Engine, phase: () => SkyRoutePhase, jobs: SkyRouteJob[]) {
  const sky = engine.skylight!;
  const renderer = engine.renderer!;
  const cost = { serviceRealMs: 0, textureRealMs: 0, uniformRealMs: 0, programRealMs: 0 };
  const sample = sky.at.bind(sky);
  const { update, at } = sky;
  const oldShader = sky.onShader;
  const oldPost = engine.streamer.onSkyService;
  const request = engine.streamer.requestSky;
  let pendingJob: SkyRouteJob | undefined;
  engine.streamer.requestSky = (input, receive) => {
    const previous = pendingJob;
    const job: SkyRouteJob = {
      phase: phase(),
      bounds: { min: [...input.bounds.min], max: [...input.bounds.max] },
      requestedRealMs: performance.now(),
      dispatchRealMs: null,
      workerRealMs: null,
      latencyRealMs: null,
      resultComplete: null,
    };
    pendingJob = job;
    const accepted = request.call(engine.streamer, input, (result, workerRealMs) => {
      job.workerRealMs = workerRealMs;
      job.latencyRealMs = performance.now() - job.requestedRealMs;
      job.resultComplete = result.complete;
      pendingJob = undefined;
      receive(result, workerRealMs);
    });
    if (accepted) {
      jobs.push(job);
    } else {
      pendingJob = previous;
    }
    return accepted;
  };
  let updating = false;
  sky.update = (...args) => {
    const startedRealMs = performance.now();
    updating = true;
    try {
      return update.apply(sky, args);
    } finally {
      updating = false;
      cost.serviceRealMs += performance.now() - startedRealMs;
    }
  };
  sky.at = (...args) => {
    const startedRealMs = performance.now();
    try {
      return at.apply(sky, args);
    } finally {
      if (!updating) {
        cost.serviceRealMs += performance.now() - startedRealMs;
      }
    }
  };
  engine.streamer.onSkyService = (realMs) => {
    if (pendingJob) {
      pendingJob.dispatchRealMs = performance.now() - realMs;
    }
    oldPost?.(realMs);
    if (!updating) {
      cost.serviceRealMs += realMs;
    }
  };
  const uniforms = new Set<Record<string, IUniform>>();
  sky.onShader = (values, realMs) => {
    oldShader?.(values, realMs);
    uniforms.add(values);
    cost.programRealMs += realMs;
  };
  const gl = renderer.getContext();
  const methods = gl as unknown as Record<string, Method>;
  const restore: (() => void)[] = [];
  const replace = (name: string, wrap: (original: Method) => Method) => {
    const original = methods[name]!;
    methods[name] = wrap(original.bind(gl));
    restore.push(() => {
      methods[name] = original;
    });
  };
  const shaders = new Set<unknown>();
  const programs = new Set<unknown>();
  replace('shaderSource', (original) => (...args) => {
    if (String(args[1]).includes('vSkyWorld')) {
      shaders.add(args[0]);
    }
    return original(...args);
  });
  replace('attachShader', (original) => (...args) => {
    if (shaders.has(args[1])) {
      programs.add(args[0]);
    }
    return original(...args);
  });
  const measure = (name: string, owned: (args: unknown[]) => boolean, key: keyof typeof cost) =>
    replace(name, (original) => (...args) => {
      if (!owned(args)) {
        return original(...args);
      }
      const startedRealMs = performance.now();
      try {
        return original(...args);
      } finally {
        cost[key] += performance.now() - startedRealMs;
      }
    });
  for (const name of ['compileShader', 'getShaderParameter']) {
    measure(name, (args) => shaders.has(args[0]), 'programRealMs');
  }
  for (const name of ['linkProgram', 'getProgramParameter']) {
    measure(name, (args) => programs.has(args[0]), 'programRealMs');
  }
  const bound = new Map<unknown, unknown>();
  replace('bindTexture', (original) => (...args) => {
    bound.set(args[0], args[1]);
    return original(...args);
  });
  const ownedTexture = (args: unknown[]) =>
    [...uniforms].some((values) =>
      Object.entries(values).some(([name, uniform]) => {
        const texture = uniform.value as Texture | undefined;
        return (
          name.startsWith('uSky') &&
          texture?.isTexture &&
          (renderer.properties.get(texture) as { __webglTexture?: object }).__webglTexture === bound.get(args[0])
        );
      }),
    );
  for (const name of ['texStorage3D', 'texImage3D', 'texSubImage3D', 'texImage2D', 'texSubImage2D']) {
    measure(name, ownedTexture, 'textureRealMs');
  }
  const locations = new Set<unknown>();
  replace('getUniformLocation', (original) => (...args) => {
    const result = original(...args);
    if (result && String(args[1]).startsWith('uSky')) {
      locations.add(result);
    }
    return result;
  });
  for (const name of [
    'uniform1f',
    'uniform1i',
    'uniform1fv',
    'uniform1iv',
    'uniform2f',
    'uniform2fv',
    'uniform3f',
    'uniform3fv',
    'uniform4f',
    'uniform4fv',
  ]) {
    measure(name, (args) => locations.has(args[0]), 'uniformRealMs');
  }
  return {
    sample,
    cost,
    reset: () => {
      for (const key of Object.keys(cost) as (keyof typeof cost)[]) {
        cost[key] = 0;
      }
    },
    dispose: () => {
      sky.update = update;
      sky.at = at;
      sky.onShader = oldShader;
      engine.streamer.onSkyService = oldPost;
      engine.streamer.requestSky = request;
      for (const undo of restore) {
        undo();
      }
    },
  };
}
export function skyRendererIdentity(renderer: WebGLRenderer) {
  const gl = renderer.getContext();
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    vendor: gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
    renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    devicePixelRatio,
    userAgent: navigator.userAgent,
  };
}
