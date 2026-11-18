/**
 * @import { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
 * @import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
 * @import { GameConfig, Session } from '@skelly/engine/session'
 * @import { DebugRuntime } from '@skelly/presentation/debug'
 * @import { WorldLoading } from '@skelly/presentation/play'
 * @import { ChunkMeshes } from '@skelly/presentation/render'
 */

/** @typedef {'whole' | 'passes' | 'cpu' | 'off'} QueryMode */
/** @typedef {{ label: string; ms: number | null }} GpuSegment */
/** @typedef {{ segment: GpuSegment; query: WebGLQuery }} PendingQuery */
/**
 * @typedef {object} FrameRecord
 * @property {number} now
 * @property {number} cpuMs
 * @property {string | null} phase
 * @property {GpuSegment[]} segments
 * @property {number} actorDraws
 * @property {number} zombieDraws
 * @property {boolean} disjoint
 * @property {number} renderScale
 * @property {boolean} [gpuReported]
 */
/**
 * What engine startup hands the instrumentation; the shadow pass is private to its class.
 * @typedef {object} InstrumentedEngine
 * @property {WebGLRenderer} renderer
 * @property {Scene} scene
 * @property {Pick<ChunkMeshes, 'batch'>} meshes
 * @property {{ drawMaps(...args: unknown[]): void }} shadows
 */
/**
 * The mood members the baseline drives, some private to `Mood`.
 * @typedef {object} InstrumentedMood
 * @property {number} renderScale
 * @property {number} frame
 * @property {boolean} externalGpuTiming
 * @property {{ renderScale: { max: number } }} graphicsTuning
 * @property {(ms: number, measuredScale: number) => void} recordGpuTime
 * @property {(scale: number) => void} setRenderScale
 */
/**
 * @typedef {InstrumentedEngine & {
 *   camera: PerspectiveCamera;
 *   config: Pick<GameConfig, 'scale'>;
 *   mood: InstrumentedMood;
 * }} PlayEngine
 */
/**
 * What play startup attaches once its runtime exists.
 * @typedef {object} PerfRuntime
 * @property {PlayEngine} engine
 * @property {Pick<Session, 'body'>} session
 * @property {{ controls: { yaw: number; pitch: number } }} input
 * @property {{ actorMeshes: { group: Object3D }; playerMeshes: { group: Object3D }; render(): void }} view
 * @property {Pick<WorldLoading, 'ready'>} worldLoading
 * @property {Pick<DebugRuntime, 'frozen' | 'handleAction'>} debug
 * @property {Pick<Session['actorStore'], 'size'>} actorStore
 */
/**
 * @typedef {object} PerfBaseline
 * @property {InstrumentedEngine & Partial<PlayEngine>} engine
 * @property {FrameRecord[]} records
 * @property {PendingQuery[]} pending
 * @property {FrameRecord | null} current
 * @property {string | null} label
 * @property {PendingQuery | null} query
 * @property {QueryMode} mode
 * @property {string} base
 * @property {boolean} enabled
 * @property {string | null} phase
 * @property {{ renderer: string; vendor: string }} identity
 * @property {boolean} [contextLost]
 * @property {() => void} prepare
 * @property {() => void} poll
 * @property {<T>(fn: (now: number) => T, now: number) => T} frame
 * @property {(composer: Pick<EffectComposer, 'passes'>) => void} wrapPasses
 * @property {(runtime: PerfRuntime) => void} attach
 * @property {() => void} [before]
 * @property {() => boolean} [skyReady]
 * @property {() => void} [resetPath]
 */
/** @typedef {PerfBaseline & Partial<Omit<PerfRuntime, 'engine'>>} PerfBaselineState */
/** @typedef {PerfBaseline & PerfRuntime} AttachedPerfBaseline */
/** @typedef {typeof globalThis & { perfBaseline?: PerfBaselineState | undefined }} PerfPage */

/**
 * @param {GpuSegment} segment
 * @returns {segment is GpuSegment & { ms: number }}
 */
const resolved = (segment) => segment.ms !== null;

/**
 * @param {Object3D} object
 * @returns {object is Object3D & { userData: { perfCategory: string } }}
 */
const categorized = (object) => typeof object.userData.perfCategory === 'string';

/** @param {InstrumentedEngine} engine */
export function install(engine) {
  const { renderer } = engine;
  // three.js renders only through WebGL2.
  const gl = /** @type {WebGL2RenderingContext} */ (renderer.getContext());
  /** @param {string} failure */
  const timerQueries = (failure) => {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) {
      throw new Error(failure);
    }
    return ext;
  };
  let ext = timerQueries('GPU timing and renderer identity are required');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  if (!debug) {
    throw new Error('GPU timing and renderer identity are required');
  }
  /** @type {PerfBaselineState} */
  const perf = {
    engine,
    records: [],
    pending: [],
    current: null,
    label: null,
    query: null,
    mode: 'whole',
    base: 'other',
    enabled: false,
    phase: null,
    identity: {
      renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
    },
    prepare: () => {
      // Renderer warm-up can invalidate startup extension activation; acquire at the measurement boundary.
      ext = timerQueries('GPU timer extension unavailable after warm-up');
    },
    poll,
    frame: (fn, now) => {
      poll();
      if (!perf.enabled) {
        return fn(now);
      }
      perf.before?.();
      /** @type {FrameRecord} */
      const record = {
        now,
        cpuMs: 0,
        phase: perf.phase,
        segments: [],
        actorDraws: 0,
        zombieDraws: 0,
        disjoint: false,
        renderScale: playMood().renderScale,
      };
      perf.current = record;
      perf.label = null;
      const start = performance.now();
      if (perf.mode !== 'cpu' && perf.mode !== 'off') {
        if (perf.mode === 'whole') {
          open('whole');
        } else {
          scope('other');
        }
      }
      try {
        return fn(now);
      } finally {
        close();
        record.cpuMs = performance.now() - start;
        perf.current = null;
        perf.records.push(record);
      }
    },
    wrapPasses: (composer) => {
      for (const pass of composer.passes) {
        const { name } = pass.constructor;
        let label = 'overlays';
        if (name === 'RenderPass') {
          label = 'scene';
        } else if (name === 'UnrealBloomPass') {
          label = 'bloom';
        } else if (pass === composer.passes.at(-1)) {
          label = 'output';
        }
        const renderPass = pass.render.bind(pass);
        pass.render = (...args) => {
          const previous = perf.base;
          perf.base = label;
          scope(label);
          try {
            return renderPass(...args);
          } finally {
            perf.base = previous;
            scope(previous);
          }
        };
      }
    },
    attach: (runtime) => {
      Object.assign(perf, runtime);
      // Reuse the enclosing whole/segmented probe: elapsed GPU queries cannot nest.
      runtime.engine.mood.externalGpuTiming = true;
      runtime.view.actorMeshes.group.userData.perfZombies = true;
      for (const key of /** @type {const} */ (['actorMeshes', 'playerMeshes'])) {
        runtime.view[key].group.userData.perfCategory = 'actors';
      }
    },
  };
  /** @type {PerfPage} */ (globalThis).perfBaseline = perf;
  renderer.domElement.addEventListener('webglcontextlost', () => {
    if (perf.enabled) {
      perf.contextLost = true;
    }
  });
  function playMood() {
    const { mood } = perf.engine;
    if (!mood) {
      throw new Error('Measured frames need the attached play engine');
    }
    return mood;
  }
  function poll() {
    if (perf.contextLost) {
      throw new Error('WebGL context was lost during collection');
    }
    if (perf.pending.length === 0) {
      return;
    }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const record of perf.records) {
        record.disjoint = true;
      }
      for (const { query } of perf.pending) {
        gl.deleteQuery(query);
      }
      perf.pending = [];
      throw new Error('Disjoint GPU clock: discard this run');
    }
    perf.pending = perf.pending.filter(({ segment, query }) => {
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
      if (available === null) {
        throw new Error(`Invalid GPU query: contextLost=${gl.isContextLost()}, error=${gl.getError()}`);
      }
      if (!available) {
        return true;
      }
      segment.ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
      return false;
    });
    reportGpuTimes();
  }
  function reportGpuTimes() {
    for (const record of perf.records) {
      if (!record.gpuReported && record.segments.length > 0 && record.segments.every(resolved)) {
        record.gpuReported = true;
        playMood().recordGpuTime(
          record.segments.reduce((sum, segment) => sum + segment.ms, 0),
          record.renderScale,
        );
      }
    }
  }
  function close() {
    if (!perf.query) {
      return;
    }
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    perf.pending.push(perf.query);
    perf.query = null;
  }
  /** @param {string | null} label */
  function scope(label) {
    if (!perf.current || perf.mode !== 'passes' || perf.label === label) {
      return;
    }
    if (label === null) {
      throw new Error('A measured frame always has a GPU segment open');
    }
    close();
    perf.label = label;
    open(label);
  }
  /** @param {string} label */
  function open(label) {
    if (gl.isContextLost()) {
      throw new Error('WebGL context lost');
    }
    const { current } = perf;
    if (!current) {
      throw new Error('GPU segments open only inside a measured frame');
    }
    /** @type {GpuSegment} */
    const segment = { label, ms: null };
    const query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    perf.query = { segment, query };
    current.segments.push(segment);
  }
  engine.meshes.batch.userData.perfCategory = 'chunks';
  const direct = renderer.renderBufferDirect.bind(renderer);
  const render = renderer.render.bind(renderer);
  renderer.render = (root, ...args) => {
    if (!perf.current || root !== engine.scene || perf.base !== 'other') {
      return render(root, ...args);
    }
    const previous = perf.base;
    perf.base = 'scene';
    scope('scene');
    try {
      return render(root, ...args);
    } finally {
      perf.base = previous;
      scope(previous);
    }
  };
  /** @param {Object3D} object */
  function categoryOf(object) {
    /** @type {Object3D | null} */
    let parent = object;
    while (parent) {
      if (categorized(parent)) {
        if (parent.userData.perfZombies && perf.current) {
          perf.current.zombieDraws += 1;
        }
        return parent.userData.perfCategory;
      }
      ({ parent } = parent);
    }
    return 'scene-other';
  }
  renderer.renderBufferDirect = (...args) => {
    const [, , , , object] = args;
    if (perf.base === 'scene') {
      const category = categoryOf(object);
      if (category === 'actors' && perf.current) {
        perf.current.actorDraws += 1;
      }
      scope(category);
    }
    return direct(...args);
  };
  const blit = gl.blitFramebuffer.bind(gl);
  gl.blitFramebuffer = (...args) => {
    const previous = perf.label;
    scope('resolves');
    try {
      return blit(...args);
    } finally {
      scope(previous);
    }
  };
  const clear = gl.clear.bind(gl);
  gl.clear = (...args) => {
    scope(perf.base);
    return clear(...args);
  };
  const shadow = engine.shadows.drawMaps.bind(engine.shadows);
  engine.shadows.drawMaps = (...args) => {
    const previous = perf.base;
    perf.base = 'shadows';
    scope('shadows');
    try {
      return shadow(...args);
    } finally {
      perf.base = previous;
      scope(previous);
    }
  };
}
