import {
  Data3DTexture, DepthTexture, LessEqualCompare, NearestFilter, RedFormat, ShaderChunk,
  UnsignedByteType, UnsignedIntType, Vector3, Vector4, WebGLRenderTarget,
} from 'three';
import { materialPatch } from './materialPatches.ts';

// Throwaway measurement implementation, not a shipping rendering contract.
export function installLampShadowSpike(engine: any, pool: any, mode: string) {
  const count = pool.itemSlots;
  const positions = { value: Array.from({ length: count }, () => new Vector4()) };
  const origin = { value: new Vector3() };
  const edge = 128;
  const cells = new Uint8Array(edge ** 3);
  const voxel = new Data3DTexture(cells, edge, edge, edge);
  voxel.format = RedFormat;
  voxel.type = UnsignedByteType;
  voxel.minFilter = voxel.magFilter = NearestFilter;
  voxel.unpackAlignment = 1;
  const block = engine.config?.scale.blockSize ?? 0.5;
  const size = 256;
  const atlas = new WebGLRenderTarget(size * 6, size * count);
  atlas.depthTexture = new DepthTexture(size * 6, size * count, UnsignedIntType);
  atlas.depthTexture.compareFunction = LessEqualCompare;
  const grid = { value: voxel };
  const map = { value: atlas.depthTexture };
  const clips = { value: Array.from({ length: count }, () => new Vector4()) };
  let built = false;
  let atlasReady = false;
  let cpu = 0;
  const carried = pool.lights.slice(0, count).map((light: any) => light.userData.carried);
  const updateGrid = () => {
    origin.value.copy(engine.camera.position).divideScalar(block).floor().addScalar(-edge / 2);
    for (let z = 0; z < edge; z++) for (let y = 0; y < edge; y++) for (let x = 0; x < edge; x++) {
      cells[x + edge * (y + edge * z)] = engine.world.getBlock(x + origin.value.x, y + origin.value.y, z + origin.value.z) ? 255 : 0;
    }
    voxel.needsUpdate = true;
    built = true;
  };
  if (mode === 'atlas') {
    ShaderChunk.shadowmap_pars_vertex = ShaderChunk.shadowmap_pars_vertex.replace('varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];', '');
    ShaderChunk.shadowmap_vertex = ShaderChunk.shadowmap_vertex.replace(/vPointShadowCoord\[ i \] =[^;]+;/, '');
    ShaderChunk.shadowmap_pars_fragment = ShaderChunk.shadowmap_pars_fragment
      .replace(/uniform samplerCubeShadow pointShadowMap\[ NUM_POINT_LIGHT_SHADOWS \];/, '')
      .replace(/uniform samplerCube pointShadowMap\[ NUM_POINT_LIGHT_SHADOWS \];/, '')
      .replace('varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];', '');
    ShaderChunk.lights_fragment_begin = ShaderChunk.lights_fragment_begin.replace(/directLight.color \*= \( directLight.visible && receiveShadow \) \? getPointShadow\([^;]+;/, '');
    ShaderChunk.shadowmask_pars_fragment = ShaderChunk.shadowmask_pars_fragment.replace(/shadow \*= receiveShadow \? getPointShadow\([^;]+;/, '');
  }
  const declarations = `
uniform vec4 spikeLamps[${count}];
uniform vec4 spikeClips[${count}];
uniform highp sampler3D spikeGrid;
uniform highp sampler2DShadow spikeAtlas;
uniform vec3 spikeOrigin;
float occupied(vec3 p) {
  ivec3 cell = ivec3(floor(p / ${block.toFixed(4)} - spikeOrigin));
  if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, ivec3(${edge})))) return 0.0;
  return texelFetch(spikeGrid, cell, 0).r;
}
float contactShadow(int slot, vec3 p, vec3 normal) {
  vec3 toward = spikeLamps[slot].xyz - p;
  float lengthToLight = length(toward);
  if (spikeLamps[slot].w <= 0.0 || lengthToLight < 0.01) return 1.0;
  vec3 ray = toward / lengthToLight;
  p += normal * 0.08;
  ${mode === 'ray' ? `for (int k=1; k<=8; k++) {
    float stepLength = float(k) * 0.25;
    if (stepLength >= lengthToLight - 0.1) break;
    if (occupied(p + ray * stepLength) > 0.5) return 0.0;
  }
  return 1.0;` : 'return 1.0 - 0.8 * occupied(p + ray * min(0.25, max(0.0, lengthToLight - 0.1)));'}
}
float atlasShadow(int slot, vec3 p, vec3 normal) {
  if (spikeLamps[slot].w <= 0.0) return 1.0;
  vec3 d = p + normal * 0.04 - spikeLamps[slot].xyz;
  vec3 a = abs(d);
  float face; vec2 uv; float depth;
  if (a.x >= a.y && a.x >= a.z) {
    face = d.x > 0.0 ? 0.0 : 1.0; depth = a.x;
    uv = vec2(d.x > 0.0 ? -d.z : d.z, -d.y) / depth;
  } else if (a.y >= a.z) {
    face = d.y > 0.0 ? 2.0 : 3.0; depth = a.y;
    uv = vec2(d.x, d.y > 0.0 ? d.z : -d.z) / depth;
  } else {
    face = d.z > 0.0 ? 4.0 : 5.0; depth = a.z;
    uv = vec2(d.z > 0.0 ? d.x : -d.x, -d.y) / depth;
  }
  float near = spikeClips[slot].x, far = spikeClips[slot].y;
  if (depth < near || depth > far) return 1.0;
  float dp = far * (depth - near) / (depth * (far - near)) - 0.001;
  uv = clamp(uv * 0.5 + 0.5, vec2(0.5/${size}.0), vec2(1.0-0.5/${size}.0));
  return texture(spikeAtlas, vec3((vec2(face, float(slot)) + uv) / vec2(6.0, ${count}.0), dp));
}
`;
  if (mode !== 'cube' && mode !== 'none') engine.materialPatches.add(materialPatch({
    key: () => `lamp-shadow-spike-${mode}-${count}`,
    compile: (shader) => {
      shader.uniforms.spikeLamps = positions;
      shader.uniforms.spikeClips = clips;
      shader.uniforms.spikeGrid = grid;
      shader.uniforms.spikeAtlas = map;
      shader.uniforms.spikeOrigin = origin;
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${declarations}`);
      const patch = (text: string) => text.replace(/getPointLightInfo\([^;]+;/, `$&\nif (directLight.visible && receiveShadow && UNROLLED_LOOP_INDEX < ${count}${mode === 'hybrid' ? ' && UNROLLED_LOOP_INDEX > 0' : ''}) {
        vec3 spikePoint = transpose(mat3(viewMatrix)) * geometryPosition + cameraPosition;
        vec3 spikeNormal = normalize(transpose(mat3(viewMatrix)) * geometryNormal);
        directLight.color *= ${mode === 'atlas' ? 'atlasShadow' : 'contactShadow'}(UNROLLED_LOOP_INDEX, spikePoint, spikeNormal);
      }`);
      shader.fragmentShader = shader.fragmentShader.includes('#include <lights_fragment_begin>')
        ? shader.fragmentShader.replace('#include <lights_fragment_begin>', patch(ShaderChunk.lights_fragment_begin))
        : patch(shader.fragmentShader);
    },
  }));
  const api = {
    rebuild: updateGrid,
    update() {
      const start = performance.now();
      if ((mode === 'ray' || mode === 'contact' || mode === 'hybrid') && !built) updateGrid();
      if (mode === 'hybrid') {
        pool.lights.slice(0, count).forEach((light: any, i: number) => { light.userData.carried = carried[i]; });
        let nearest = 0;
        for (let i = 1; i < count; i++) if (pool.lights[i].intensity > 0 && (pool.lights[nearest].intensity <= 0 || pool.lights[i].position.distanceToSquared(engine.camera.position) < pool.lights[nearest].position.distanceToSquared(engine.camera.position))) nearest = i;
        if (nearest !== 0) {
          const first = pool.lights[0], selected = pool.lights[nearest];
          const pos = first.position.clone(), intensity = first.intensity, distance = first.distance;
          first.position.copy(selected.position); first.intensity = selected.intensity; first.distance = selected.distance;
          selected.position.copy(pos); selected.intensity = intensity; selected.distance = distance;
          first.userData.carried = carried[nearest]; selected.userData.carried = carried[0];
          [pool.shadowBodies[0], pool.shadowBodies[nearest]] = [pool.shadowBodies[nearest], pool.shadowBodies[0]];
        }
        pool.handLights?.forEach((hand: any, i: number) => {
          const light = pool.lights[i];
          hand.position.copy(light.position); hand.intensity = light.intensity; hand.distance = light.distance;
        });
      }
      pool.lights.slice(0, count).forEach((light: any, i: number) => {
        positions.value[i]!.set(light.position.x, light.position.y, light.position.z, light.intensity);
        clips.value[i]!.set(light.shadow.camera.near, light.distance || light.shadow.camera.far, 0, 0);
      });
      cpu = performance.now() - start;
    },
    copyAtlas() {
      if (mode !== 'atlas') return;
      const renderer = engine.renderer;
      const target = renderer.getRenderTarget();
      const gl = renderer.getContext();
      if (!atlasReady) {
        renderer.setRenderTarget(atlas); renderer.clear(); renderer.setRenderTarget(target); atlasReady = true;
      }
      const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      try {
        const dst = renderer.properties.get(atlas).__webglFramebuffer;
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
        pool.lights.slice(0, count).forEach((light: any, slot: number) => {
          if (!engine.shadows.itemStats.redraws[slot]) return;
          const frames = renderer.properties.get(light.shadow.map).__webglFramebuffer;
          for (let face = 0; face < 6; face++) {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, frames[face]);
            gl.blitFramebuffer(0, 0, size, size, face * size, slot * size, (face+1)*size, (slot+1)*size, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
          }
        });
      } finally {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
      }
    },
    get cpuMs() { return cpu; },
  };
  Object.assign(globalThis, { lampSpike: api, lampPool: pool });
  return api;
}
