const describe = (object, material, geometry) => ({
  object: {
    name: object.name,
    type: object.type,
    instanced: Boolean(object.isInstancedMesh),
    receiveShadow: object.receiveShadow,
    castShadow: object.castShadow,
  },
  material: {
    type: material.type,
    name: material.name,
    side: material.side,
    transparent: material.transparent,
    vertexColors: material.vertexColors,
    map: Boolean(material.map),
    defines: { ...material.defines },
    patchKey: material.customProgramCacheKey(),
  },
  attributes: Object.keys(geometry.attributes),
});

/** Manual probe only: observe first-use programs and upload submission without GPU timer queries. */
export function installReachCostProbe(renderer) {
  const gl = renderer.getContext();
  const records = { warmUps: [], programs: [], compiles: [], uploads: [] };
  const restore = [];
  let drawing;
  const wrap = (owner, name, observe) => {
    const original = owner[name];
    owner[name] = observe(original.bind(owner));
    restore.push(() => {
      owner[name] = original;
    });
  };
  wrap(renderer, 'compileAsync', (original) => (scene, ...args) => {
    const meshes = [];
    scene.traverse((object) => {
      if (object.isMesh) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          meshes.push(describe(object, material, object.geometry));
        }
      }
    });
    records.warmUps.push(meshes);
    return original(scene, ...args);
  });
  wrap(renderer, 'renderBufferDirect', (original) => (...args) => {
    const [, , geometry, material, object] = args;
    drawing = { object, material, geometry };
    const previous = renderer.info.programs.length;
    try {
      return original(...args);
    } finally {
      if (renderer.info.programs.length > previous) {
        records.programs.push({
          ...describe(object, material, geometry),
          programs: renderer.info.programs.slice(previous).map((program) => ({ cacheKey: program.cacheKey })),
        });
      }
      drawing = undefined;
    }
  });
  wrap(gl, 'compileShader', (original) => (shader) => {
    records.compiles.push({
      source: gl.getShaderSource(shader),
      drawing: drawing && describe(drawing.object, drawing.material, drawing.geometry),
    });
    return original(shader);
  });
  for (const name of ['texImage3D', 'texSubImage3D']) {
    wrap(gl, name, (original) => (...args) => {
      const start = performance.now();
      try {
        return original(...args);
      } finally {
        records.uploads.push({ name, ms: performance.now() - start });
      }
    });
  }
  return {
    records,
    clearDraws: () => {
      records.programs.length = 0;
      records.compiles.length = 0;
      records.uploads.length = 0;
    },
    dispose: () => {
      for (const reset of restore.reverse()) {
        reset();
      }
    },
  };
}
