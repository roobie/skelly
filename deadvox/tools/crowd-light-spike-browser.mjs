import { BoxGeometry, DataTexture, Float32BufferAttribute, FloatType, Mesh, NearestFilter, RGBAFormat } from 'three';
import { createLightGrid, packLightGrid } from './crowd-light-grid.mjs';

const declarations = /* glsl */ `
varying vec3 vCrowdLightWorld;
uniform sampler2D uCrowdLightGrid;
uniform sampler2D uCrowdLights;
uniform vec2 uCrowdGridOrigin;
uniform vec2 uCrowdGridSize;
uniform float uCrowdCellSize;
uniform float uCrowdLightRadius;
uniform float uCrowdLightStrength;
vec4 crowdGridFetch(int texel) {
  return texelFetch(uCrowdLightGrid, ivec2(texel % 256, texel / 256), 0);
}
vec3 crowdIrradiance(vec3 position, vec3 viewNormal) {
  ivec2 tile = ivec2(floor((position.xz - uCrowdGridOrigin) / uCrowdCellSize));
  if (any(lessThan(tile, ivec2(0))) || any(greaterThanEqual(tile, ivec2(uCrowdGridSize)))) return vec3(0.0);
  vec4 header = crowdGridFetch(tile.y * int(uCrowdGridSize.x) + tile.x);
  vec3 sum = vec3(0.0);
  float radius2 = uCrowdLightRadius * uCrowdLightRadius;
  for (int i = 0; i < int(header.y); i++) {
    int address = int(header.x) + i;
    int index = int(crowdGridFetch(address / 4)[address % 4]);
    vec4 light = texelFetch(uCrowdLights, ivec2(index, 0), 0);
    vec3 delta = light.xyz - position;
    float d2 = dot(delta, delta);
    if (d2 >= radius2) continue;
    vec3 viewDelta = mat3(viewMatrix) * delta;
    float cosine = max(dot(viewNormal, viewDelta * inversesqrt(max(d2, 0.0001))), 0.0);
    float cutoff = 1.0 - d2 / radius2;
    sum += vec3(0.12, 1.0, 0.015) * (uCrowdLightStrength * light.w * cosine * cutoff * cutoff / (1.0 + d2));
  }
  return sum;
}
`;

function once(code, token, replacement) {
  if (code.split(token).length !== 2) {
    throw new Error(`Crowd light shader boundary changed: ${token}`);
  }
  return code.replace(token, replacement);
}

function texture(data, width, height) {
  const result = new DataTexture(data, width, height, RGBAFormat, FloatType);
  result.magFilter = NearestFilter;
  result.minFilter = NearestFilter;
  result.generateMipmaps = false;
  result.needsUpdate = true;
  return result;
}

function addReceivers(perf) {
  const boxes = [
    { size: [42, 0.2, 20], position: [43, 59.87, 14] },
    { size: [42, 4, 0.2], position: [43, 62, 3.9] },
    { size: [42, 4, 0.2], position: [43, 62, 24.1] },
  ];
  for (const box of boxes) {
    const geometry = new BoxGeometry(...box.size);
    const { count } = geometry.getAttribute('position');
    for (const [name, size, value] of [
      ['color', 3, 0.45],
      ['pattern', 1, 0],
      ['weatherable', 1, 0],
      ['occlusion', 1, 1],
      ['weather', 2, 0],
    ]) {
      geometry.setAttribute(name, new Float32BufferAttribute(new Float32Array(count * size).fill(value), size));
    }
    const mesh = new Mesh(geometry, perf.engine.meshes.material);
    mesh.position.set(...box.position);
    mesh.receiveShadow = true;
    mesh.userData.perfCategory = 'chunks';
    perf.engine.scene.add(mesh);
  }
}

function patchReceivers(perf, uniforms, metrics) {
  const patched = new WeakSet();
  const patch = (material) => {
    if (patched.has(material)) {
      return material;
    }
    patched.add(material);
    metrics.materials += 1;
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `${cacheKey()}:crowd-light-grid-spike`;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 vCrowdLightWorld;\n${once(
        shader.vertexShader,
        '#include <project_vertex>',
        '#include <project_vertex>\nvCrowdLightWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )}`;
      shader.fragmentShader = `${declarations}\n${once(
        shader.fragmentShader,
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.directDiffuse += diffuseColor.rgb * crowdIrradiance(vCrowdLightWorld, normal) * RECIPROCAL_PI;',
      )}`;
    };
    material.needsUpdate = true;
    return material;
  };
  patch(perf.engine.meshes.material);
  const { furniture } = perf.view;
  for (const material of furniture.materials.values()) {
    patch(material);
  }
  const factory = furniture.material.bind(furniture);
  furniture.material = (...args) => patch(factory(...args));
}

export function installCrowdLightSpike(perf) {
  const params = new URL(location.href).searchParams;
  if (!params.has('acidLightGrid')) {
    return;
  }
  addReceivers(perf);
  const enabled = params.get('acidLightGrid') === '1';
  const count = Number(params.get('acidCount') ?? 40);
  const radius = Number(params.get('acidLightRadius') ?? 4);
  const strength = Number(params.get('acidLightStrength') ?? 15);
  const metrics = { enabled, capacity: count, radius, strength, materials: 0, emitters: 0 };
  perf.crowdLight = metrics;
  if (!enabled) {
    return;
  }
  const columns = Math.min(count, 8);
  const grid = createLightGrid(
    count,
    {
      minX: 24,
      maxX: 26 + Math.floor((count - 1) / columns) * 2.5,
      minZ: 13 - ((columns - 1) / 2) * 2.2,
      maxZ: 15 + ((columns - 1) / 2) * 2.2,
    },
    radius,
  );
  const lights = new Float32Array(count * 4);
  const gridTexture = texture(grid.data, grid.textureWidth, grid.textureHeight);
  const lightTexture = texture(lights, count, 1);
  Object.assign(metrics, {
    lightBytes: lights.byteLength,
    gridBytes: grid.data.byteLength,
    scratchBytes: grid.counts.byteLength + grid.cursors.byteLength + grid.ranges.byteLength,
    cells: grid.width * grid.height,
    gridSize: [grid.width, grid.height],
  });
  patchReceivers(
    perf,
    {
      uCrowdLightGrid: { value: gridTexture },
      uCrowdLights: { value: lightTexture },
      uCrowdGridOrigin: { value: [grid.minX, grid.minZ] },
      uCrowdGridSize: { value: [grid.width, grid.height] },
      uCrowdCellSize: { value: grid.cellSize },
      uCrowdLightRadius: { value: radius },
      uCrowdLightStrength: { value: strength },
    },
    metrics,
  );
  const crowd = perf.view.zombieMeshes;
  const sync = crowd.sync.bind(crowd);
  crowd.sync = (...args) => {
    sync(...args);
    const start = performance.now();
    let index = 0;
    for (const state of crowd.states.values()) {
      const mask = (state.globalRow * crowd.layout.width + crowd.layout.bonesPerSlot * 3) * 4;
      if (crowd.textureData[mask + 2] < 0.5) {
        continue;
      }
      const variant = crowd.variants[state.variantIndex];
      const bone = variant.boneIndexById.get('spine');
      const offset = (state.globalRow * crowd.layout.width + bone * 3) * 4;
      lights[index * 4] = crowd.textureData[offset + 3];
      lights[index * 4 + 1] = crowd.textureData[offset + 7] + 0.25;
      lights[index * 4 + 2] = crowd.textureData[offset + 11];
      lights[index * 4 + 3] = 1 + crowd.textureData[mask + 3];
      index += 1;
    }
    packLightGrid(grid, lights, index);
    lightTexture.needsUpdate = true;
    gridTexture.needsUpdate = true;
    Object.assign(metrics, { emitters: index, references: grid.references, maxOccupancy: grid.maxOccupancy });
    if (perf.current) {
      perf.current.lightBuildMs = performance.now() - start;
      perf.current.crowdEmitters = index;
      perf.current.lightReferences = grid.references;
      perf.current.lightMaxOccupancy = grid.maxOccupancy;
    }
  };
}
