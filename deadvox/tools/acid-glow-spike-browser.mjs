import { InstancedMesh } from 'three';

export function installFixture(crowd, count) {
  const sync = crowd.sync.bind(crowd);
  const saved = new Map();
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keep disposable fixture restore and placement together for audit.
  crowd.sync = (store, ...args) => {
    // Restore render-only translations before the normal pose cache reads or rewrites a row.
    for (const { offset, row } of saved.values()) {
      crowd.textureData.set(row, offset);
    }
    const actors = [...store.entries()].filter(([, zombie]) => zombie.type.model === 'shambler').slice(0, count);
    sync({ entries: () => actors.values() }, ...args);
    let index = 0;
    for (const [id, state] of crowd.states) {
      const offset = state.globalRow * crowd.layout.width * 4;
      let entry = saved.get(id);
      if (!entry || entry.offset !== offset) {
        entry = { offset, row: new Float32Array(crowd.layout.width * 4) };
        saved.set(id, entry);
      }
      entry.row.set(crowd.textureData.subarray(offset, offset + entry.row.length));
      const columns = Math.min(count, 8);
      const x = 25 + Math.floor(index / columns) * 2.5;
      const z = 14 + ((index % columns) - (columns - 1) / 2) * 2.2;
      const placement = state.lastPlacement;
      if (!placement) {
        throw new Error('Missing fixture pose');
      }
      for (let bone = 0; bone < crowd.layout.bonesPerSlot; bone++) {
        const base = offset + bone * 12;
        // Leave hidden/unused bones collapsed.
        if (crowd.textureData[base] === 0 && crowd.textureData[base + 5] === 0 && crowd.textureData[base + 10] === 0) {
          continue;
        }
        crowd.textureData[base + 3] += x - placement.x;
        crowd.textureData[base + 7] += 60 - placement.y;
        crowd.textureData[base + 11] += z - placement.z;
      }
      index += 1;
    }
    crowd.texture.needsUpdate = true;
  };
}

// Measurement-only: imported by the perf build, never by the game entry point.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: disposable setup keeps measured shader and batch differences together.
export function installAcidGlow(perf) {
  const params = new URL(location.href).searchParams;
  const option = params.get('acidGlow') ?? 'baseline';
  const share = Number(params.get('acidShare') ?? 1);
  const animate = params.get('acidAnimate') === '1';
  const strength = Number(params.get('acidStrength') ?? 4);
  const opacity = Number(params.get('acidOpacity') ?? 0.45);
  const crowd = perf.view.zombieMeshes;
  const shells = [];
  const fixtureCount = Number(params.get('acidCount') ?? 40);
  const metrics = {
    option,
    share,
    animate,
    strength,
    opacity,
    fixtureCount,
    selected: 0,
    actors: 0,
    bytesPerAllocatedRow: crowd.layout.width * 16,
    allocatedRows: crowd.layout.height,
    addedBytesPerActor: option === 'baseline' ? 0 : 8,
    addedGeometryBytes: 0,
    skippedModels: [],
  };
  perf.acidGlow = metrics;
  const gl = perf.engine.renderer.getContext();
  for (const name of ['texImage2D', 'texSubImage2D']) {
    const upload = gl[name].bind(gl);
    gl[name] = (...args) => {
      const start = performance.now();
      const result = upload(...args);
      if (perf.current) {
        perf.current.uploadMs = (perf.current.uploadMs ?? 0) + performance.now() - start;
        perf.current.uploadCalls = (perf.current.uploadCalls ?? 0) + 1;
        perf.current.uploadBytes =
          (perf.current.uploadBytes ?? 0) + (args.find((value) => ArrayBuffer.isView(value))?.byteLength ?? 0);
      }
      return result;
    };
  }
  installFixture(crowd, fixtureCount);
  if (option === 'baseline') {
    const sync = crowd.sync.bind(crowd);
    crowd.sync = (...args) => {
      const start = performance.now();
      sync(...args);
      metrics.actors = crowd.states.size;
      if (perf.current) {
        perf.current.crowdSyncMs = performance.now() - start;
        perf.current.acidActors = crowd.states.size;
      }
    };
    return;
  }

  function patch(material, shell = false) {
    const original = crowd.material.onBeforeCompile;
    material.customProgramCacheKey = () => `acid-spike-${option}-${shell}`;
    material.onBeforeCompile = (shader) => {
      original(shader);
      shader.vertexShader = `varying vec2 vAcid; varying float vAcidSac;\n${shader.vertexShader}`;
      // The crowd patch already replaced begin_vertex; append after its known assignment.
      shader.vertexShader = shader.vertexShader.replace(
        'vCrowdBone = boneIndex;',
        `vCrowdBone = boneIndex;
        vAcid = texelFetch(crowdBoneTexture, ivec2(int(crowdBonesPerSlot)*3, int(crowdSlot)), 0).zw;
        vAcidSac = 0.0;
        if (abs(boneIndex - acidSacBone) < 0.1) vAcidSac = 1.0;
        else if (abs(boneIndex - acidEyeBone) > 0.1) vAcid = vec2(0.0);
      `,
      );
      shader.vertexShader = `attribute float acidSacBone; attribute float acidEyeBone;\n${shader.vertexShader}`;
      shader.fragmentShader = `varying vec2 vAcid; varying float vAcidSac;\n${shader.fragmentShader}`;
      const colour =
        option === 'b'
          ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.65 + 0.35*vAcid.y*vAcidSac, 0.015), vAcid.x);'
          : `totalEmissiveRadiance += vec3(0.12, 1.0, 0.015) * vAcid.x * (1.0 + vAcid.y*vAcidSac) * ${strength.toFixed(6)};`;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${colour}`,
      );
      if (option === 'c') {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>\n${
            shell
              ? `if(vAcid.x < 0.5) discard; diffuseColor.a = ${opacity.toFixed(6)};`
              : 'if(vAcid.x > 0.5 && vAcidSac > 0.5) discard;'
          }`,
        );
      }
    };
    material.needsUpdate = true;
  }

  // Read the original callback before replacing it for the opaque batch.
  const opaque = crowd.material.clone();
  patch(opaque);
  for (const variant of crowd.variants) {
    const sac = variant.boneIndexById.get('spine') ?? variant.boneIndexById.get('chest');
    const eye = variant.boneIndexById.get('head');
    if (sac === undefined || eye === undefined) {
      metrics.skippedModels.push(variant.model);
      continue;
    }
    const { mesh } = variant;
    const { geometry } = mesh;
    const SlotAttribute = variant.crowdSlotAttr.constructor;
    geometry.setAttribute('acidSacBone', new SlotAttribute(new Float32Array(crowd.capacity).fill(sac), 1));
    geometry.setAttribute('acidEyeBone', new SlotAttribute(new Float32Array(crowd.capacity).fill(eye), 1));
    metrics.addedGeometryBytes += crowd.capacity * 8;
    mesh.material = opaque;
    if (option !== 'c') {
      continue;
    }
    const shellGeometry = geometry.clone();
    // Share attributes: only the sac's index buffer is additional geometry storage.
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      shellGeometry.setAttribute(name, attribute);
    }
    const indices = [];
    const bone = geometry.getAttribute('boneIndex');
    const count = geometry.index?.count ?? bone.count;
    for (let i = 0; i < count; i += 3) {
      const a = geometry.index ? geometry.index.getX(i) : i;
      if (bone.getX(a) !== sac) {
        continue;
      }
      for (let j = 0; j < 3; j++) {
        indices.push(geometry.index ? geometry.index.getX(i + j) : i + j);
      }
    }
    if (indices.length === 0) {
      throw new Error('Empty sac geometry');
    }
    shellGeometry.setIndex(indices);
    metrics.addedGeometryBytes += shellGeometry.index.array.byteLength;
    const material = crowd.material.clone();
    material.transparent = true;
    material.depthWrite = false;
    patch(material, true);
    const shell = new InstancedMesh(shellGeometry, material, crowd.capacity);
    shell.instanceMatrix = mesh.instanceMatrix;
    shell.frustumCulled = false;
    shell.count = 0;
    crowd.group.add(shell);
    shells.push({ shell, mesh });
  }
  if (option === 'a-pool') {
    const pool = perf.view.lightPool;
    const update = pool.update.bind(pool);
    pool.update = (...args) => {
      update(...args);
      const candidates = [];
      let index = 0;
      for (const state of crowd.states.values()) {
        const offset = (state.globalRow * crowd.layout.width + crowd.layout.bonesPerSlot * 3) * 4;
        if (crowd.textureData[offset + 2] > 0) {
          candidates.push({ index, windup: crowd.textureData[offset + 3] });
        }
        index += 1;
      }
      metrics.castingLights = Math.min(pool.lights.length, candidates.length);
      for (const [i, light] of pool.lights.entries()) {
        const source = candidates[i];
        if (!source) {
          continue;
        }
        const columns = Math.min(fixtureCount, 8);
        light.position.set(
          25 + Math.floor(source.index / columns) * 2.5,
          61,
          14 + ((source.index % columns) - (columns - 1) / 2) * 2.2,
        );
        light.color.setRGB(0.12, 1, 0.015);
        light.intensity = 15 * (1 + source.windup);
        light.distance = 4;
        light.decay = 1;
      }
    };
  }
  const sync = crowd.sync.bind(crowd);
  crowd.sync = (...args) => {
    const start = performance.now();
    sync(...args);
    const packStart = performance.now();
    let selected = 0;
    let index = 0;
    const windup = animate ? (1 - Math.cos((perf.records.length * Math.PI) / 60)) / 2 : 0;
    for (const state of crowd.states.values()) {
      const active = index % 10 < Math.round(share * 10);
      index += 1;
      selected += Number(active);
      const offset = (state.globalRow * crowd.layout.width + crowd.layout.bonesPerSlot * 3) * 4;
      crowd.textureData[offset + 2] = Number(active);
      crowd.textureData[offset + 3] = windup;
    }
    crowd.texture.needsUpdate = true;
    for (const { shell, mesh } of shells) {
      shell.count = mesh.count;
    }
    metrics.selected = selected;
    metrics.actors = index;
    metrics.samplePlacements = [...crowd.states.values()].slice(-8).map((state) => state.lastPlacement);
    if (perf.current) {
      perf.current.acidPackMs = performance.now() - packStart;
      perf.current.crowdSyncMs = performance.now() - start;
      perf.current.acidSelected = selected;
      perf.current.acidActors = index;
    }
  };
}
