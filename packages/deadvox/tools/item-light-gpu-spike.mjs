const vertex = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const fragment = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler3D;
uniform usampler3D occupancy;
uniform ivec3 occupancyMin;
uniform vec3 source;
uniform ivec3 origin;
uniform float cellBlocks;
uniform float reachSquared;
uniform int layer;
uniform int rays;
uniform vec3 samples[32];
out vec4 coverage;
bool reaches(vec3 to) {
  vec3 d = to - source;
  float len = length(d);
  if (len == 0.0) return true;
  vec3 dir = d / len;
  ivec3 cell = ivec3(floor(source));
  ivec3 target = ivec3(floor(to));
  ivec3 step = ivec3(sign(dir));
  float inf = uintBitsToFloat(0x7f800000u);
  vec3 delta, next;
  for (int a = 0; a < 3; a++) {
    delta[a] = dir[a] == 0.0 ? inf : 1.0 / abs(dir[a]);
    next[a] = dir[a] == 0.0 ? inf :
      (dir[a] > 0.0 ? float(cell[a] + 1) - source[a] : source[a] - float(cell[a])) / abs(dir[a]);
  }
  for (;;) {
    if (next.x < next.y && next.x < next.z) {
      if (next.x > len) return true;
      cell.x += step.x; next.x += delta.x;
    } else if (next.y < next.z) {
      if (next.y > len) return true;
      cell.y += step.y; next.y += delta.y;
    } else {
      if (next.z > len) return true;
      cell.z += step.z; next.z += delta.z;
    }
    if (all(equal(cell, target))) continue;
    // Texture axes follow the CPU array: x + extent * (z + extent * y).
    if (texelFetch(occupancy, (cell - occupancyMin).xzy, 0).r != 0u) return false;
  }
}
void main() {
  ivec3 receiverCell = ivec3(int(gl_FragCoord.x), layer, int(gl_FragCoord.y));
  vec3 centre = (vec3(origin + receiverCell) + 0.5) * cellBlocks;
  vec3 difference = centre - source;
  float value = 255.0;
  if (dot(difference, difference) <= reachSquared) {
    int lit = 0;
    for (int ray = 0; ray < 32; ray++) {
      if (ray >= rays) break;
      if (reaches(centre + samples[ray] * cellBlocks)) lit++;
    }
    value = floor(255.0 * float(lit) / float(rays) + 0.5);
  }
  coverage = vec4(value / 255.0, 0.0, 0.0, 1.0);
}`;

/** Throwaway, opt-in measurement context; no game renderer or rules consume its grids. */
export function createItemLightGpuSpike({ gpuReachSpike = false } = {}) {
  if (!gpuReachSpike) {
    throw new Error('Enable the named gpuReachSpike debug input to run this prototype');
  }
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) {
    throw new Error('GPU spike requires WebGL2');
  }
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const shader = (kind, code) => {
    const result = gl.createShader(kind);
    gl.shaderSource(result, code);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(result));
    }
    return result;
  };
  const program = gl.createProgram();
  const shaders = [shader(gl.VERTEX_SHADER, vertex), shader(gl.FRAGMENT_SHADER, fragment)];
  for (const part of shaders) {
    gl.attachShader(program, part);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  const vao = gl.createVertexArray();
  const framebuffer = gl.createFramebuffer();
  const occupancy = gl.createTexture();
  const grid = gl.createTexture();
  let edge = 0;
  let occupancyEdge = 0;
  let frame = 0;
  let alive = true;
  const pending = new Set();
  const clock = () => {
    if (alive) {
      frame++;
      requestAnimationFrame(clock);
    }
  };
  requestAnimationFrame(clock);
  const location = (name) => gl.getUniformLocation(program, name);
  const texture = (value, size, internal, format, data) => {
    gl.bindTexture(gl.TEXTURE_3D, value);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, internal, size, size, size, 0, format, gl.UNSIGNED_BYTE, data);
  };
  const readLayers = (size, buffer) => {
    for (let y = 0; y < size; y++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, grid, 0, y);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buffer === null ? y * size ** 2 * 4 : buffer.subarray(y * size ** 2 * 4));
    }
  };
  const redBytes = (rgba) => {
    const cells = new Uint8Array(rgba.length / 4);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = rgba[i * 4];
    }
    return cells;
  };
  return {
    identity: { renderer, timer: Boolean(ext) },
    build({ light, tuning, blockSize, penumbra, isBlocking, blockingRead = false }) {
      if (light.body) {
        throw new Error('This held-light spike does not support fixture source bodies');
      }
      const rays = penumbra ? tuning.penumbraRays : 1;
      if (rays > 32) {
        throw new Error('Spike sample uniform capacity exceeded');
      }
      const start = performance.now();
      const startFrame = frame;
      const cell = tuning.cellBlocks;
      const source = light.pos.map((v) => (Math.floor(v / cell) + 0.5) * cell);
      const range = light.radius / blockSize;
      const half = Math.ceil(range / cell);
      const size = half * 2 + 1;
      const origin = source.map((v) => Math.floor(v / cell) - half);
      const min = origin.map((v) => Math.floor(v * cell) - 1);
      const extent = Math.ceil(size * cell) + 3;
      const snapshotStart = performance.now();
      const data = new Uint8Array(extent ** 3);
      for (let y = 0; y < extent; y++) {
        for (let z = 0; z < extent; z++) {
          for (let x = 0; x < extent; x++) {
            data[x + extent * (z + extent * y)] = Number(isBlocking(x + min[0], y + min[1], z + min[2]));
          }
        }
      }
      const snapshotMs = performance.now() - snapshotStart;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.bindVertexArray(vao);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
      const uploadStart = performance.now();
      if (occupancyEdge !== extent) {
        texture(occupancy, extent, gl.R8UI, gl.RED_INTEGER, data);
        occupancyEdge = extent;
      } else {
        gl.bindTexture(gl.TEXTURE_3D, occupancy);
        gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, extent, extent, extent, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
      }
      const occupancyUploadMs = performance.now() - uploadStart;
      if (edge !== size) {
        texture(grid, size, gl.R8, gl.RED, null);
        edge = size;
      }
      gl.bindTexture(gl.TEXTURE_3D, occupancy);
      gl.viewport(0, 0, size, size);
      gl.disable(gl.DITHER);
      gl.uniform1i(location('occupancy'), 0);
      gl.uniform3iv(location('occupancyMin'), min);
      gl.uniform3fv(location('source'), source);
      gl.uniform3iv(location('origin'), origin);
      gl.uniform1f(location('cellBlocks'), cell);
      gl.uniform1f(location('reachSquared'), (range + Math.sqrt(3) * cell) ** 2);
      gl.uniform1i(location('rays'), rays);
      const samples = Array.from({ length: rays }, (_, index) =>
        rays === 1
          ? [0, 0, 0]
          : [(index + 0.5) / rays - 0.5, (((index + 0.5) * Math.SQRT2) % 1) - 0.5, (((index + 0.5) * Math.sqrt(3)) % 1) - 0.5],
      ).flat();
      gl.uniform3fv(location('samples[0]'), samples);
      const query = ext ? gl.createQuery() : null;
      if (query) {
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      }
      const submitStart = performance.now();
      for (let y = 0; y < size; y++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, grid, 0, y);
        if (y === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error('WebGL2 cannot render to an R8 3D grid layer');
        }
        gl.uniform1i(location('layer'), y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (query) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
      }
      const drawSubmitMs = performance.now() - submitStart;
      const result = { source, origin, size, rays, snapshotMs, occupancyUploadMs, drawSubmitMs, start, startFrame, blockingRead };
      const readStart = performance.now();
      let pbo;
      let rgba;
      if (blockingRead) {
        rgba = new Uint8Array(size ** 3 * 4);
        readLayers(size, rgba);
        result.blockingReadMs = performance.now() - readStart;
      } else {
        pbo = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, size ** 3 * 4, gl.STREAM_READ);
        readLayers(size, null);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        result.readSubmitMs = performance.now() - readStart;
      }
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      result.mainMs = performance.now() - start;
      const promise = new Promise((resolve, reject) => {
        const poll = () => {
          const status = gl.clientWaitSync(fence, 0, 0);
          if (status === gl.WAIT_FAILED) {
            reject(new Error('GPU fence wait failed'));
            return;
          }
          if (status === gl.TIMEOUT_EXPIRED || (query && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))) {
            requestAnimationFrame(poll);
            return;
          }
          result.disjoint = ext ? Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT)) : false;
          result.gpuMs = query && !result.disjoint ? gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 : null;
          result.fenceMs = performance.now() - start;
          const copyStart = performance.now();
          if (pbo) {
            rgba = new Uint8Array(size ** 3 * 4);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
            gl.deleteBuffer(pbo);
          }
          const cells = redBytes(rgba);
          result.cpuCopyMs = performance.now() - copyStart;
          result.readableMs = performance.now() - start;
          result.readableFrames = frame - startFrame;
          result.error = gl.getError();
          gl.deleteSync(fence);
          if (query) {
            gl.deleteQuery(query);
          }
          resolve({ result, cells });
        };
        requestAnimationFrame(poll);
      });
      pending.add(promise);
      promise.finally(() => pending.delete(promise));
      return { result, done: promise };
    },
    async drain() {
      await Promise.all(pending);
    },
    dispose() {
      alive = false;
      for (const part of shaders) {
        gl.deleteShader(part);
      }
      gl.deleteProgram(program);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(grid);
      gl.deleteTexture(occupancy);
    },
  };
}
