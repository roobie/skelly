export function install(engine) {
  const { renderer } = engine;
  const gl = renderer.getContext();
  let ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  if (!(ext && debug)) {
    throw new Error('GPU timing and renderer identity are required');
  }
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
  };
  globalThis.perfBaseline = perf;
  renderer.domElement.addEventListener('webglcontextlost', () => {
    if (perf.enabled) {
      perf.contextLost = true;
    }
  });
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
      for (const segment of perf.pending) {
        gl.deleteQuery(segment.query);
      }
      perf.pending = [];
      throw new Error('Disjoint GPU clock: discard this run');
    }
    perf.pending = perf.pending.filter((segment) => {
      const available = gl.getQueryParameter(segment.query, gl.QUERY_RESULT_AVAILABLE);
      if (available === null) {
        throw new Error(`Invalid GPU query: contextLost=${gl.isContextLost()}, error=${gl.getError()}`);
      }
      if (!available) {
        return true;
      }
      segment.ms = gl.getQueryParameter(segment.query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(segment.query);
      segment.query = undefined;
      return false;
    });
    reportGpuTimes();
  }
  function reportGpuTimes() {
    for (const record of perf.records) {
      if (
        !record.gpuReported &&
        record.segments.length > 0 &&
        record.segments.every((segment) => segment.ms !== null)
      ) {
        record.gpuReported = true;
        perf.engine.mood.recordGpuTime(
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
  function scope(label) {
    if (!perf.current || perf.mode !== 'passes' || perf.label === label) {
      return;
    }
    close();
    perf.label = label;
    open(label);
  }
  function open(label) {
    if (gl.isContextLost()) {
      throw new Error('WebGL context lost');
    }
    const segment = { label, query: gl.createQuery(), ms: null };
    gl.beginQuery(ext.TIME_ELAPSED_EXT, segment.query);
    perf.query = segment;
    perf.current.segments.push(segment);
  }
  perf.prepare = () => {
    // Renderer warm-up can invalidate startup extension activation; acquire at the measurement boundary.
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) {
      throw new Error('GPU timer extension unavailable after warm-up');
    }
  };
  perf.poll = poll;
  perf.frame = (fn, now) => {
    poll();
    if (!perf.enabled) {
      return fn(now);
    }
    perf.before?.();
    const record = {
      now,
      cpuMs: 0,
      phase: perf.phase,
      segments: [],
      actorDraws: 0,
      zombieDraws: 0,
      disjoint: false,
      renderScale: perf.engine.mood.renderScale,
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
  };
  engine.meshes.group.userData.perfCategory = 'chunks';
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
  function categoryOf(object) {
    for (let parent = object; parent; parent = parent.parent) {
      if (parent.userData.perfCategory) {
        if (parent.userData.perfZombies && perf.current) {
          perf.current.zombieDraws += 1;
        }
        return parent.userData.perfCategory;
      }
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
  perf.wrapPasses = (composer) => {
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
  };
  perf.attach = (runtime) => {
    Object.assign(perf, runtime);
    // Reuse the enclosing whole/segmented probe: elapsed GPU queries cannot nest.
    runtime.engine.mood.externalGpuTiming = true;
    runtime.view.zombieMeshes.group.userData.perfZombies = true;
    for (const key of ['zombieMeshes', 'playerMeshes']) {
      runtime.view[key].group.userData.perfCategory = 'actors';
    }
  };
}
