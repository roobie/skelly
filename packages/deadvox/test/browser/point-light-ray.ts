import { reaches } from '@skelly/engine/internal/core/illumination.ts';
import type { Vec3 } from '@skelly/engine/world';
import { POINT_LIGHT_RAY_GLSL } from '@skelly/presentation/internal/render/pointLightRay.ts';

const solid = (x: number, y: number, z: number) =>
  (x === 1 && z === 0) || (z === -2 && x < 0 && y !== 1) || (x === -3 && y === -3 && z === -3);

function blockingCells(size: number, origin: Vec3): Uint8Array {
  const data = new Uint8Array(size ** 3);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[x + size * (y + size * z)] = solid(x + origin[0], y + origin[1], z + origin[2]) ? 255 : 0;
      }
    }
  }
  return data;
}

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader)!);
  }
  return shader;
}

function probeSamples(): { from: Vec3; to: Vec3; body?: { min: Vec3; max: Vec3 } }[] {
  const samples: ReturnType<typeof probeSamples> = [
    { from: [-0.25, 0.5, 0.125], to: [2.0625, 0.5, 1.8125] },
    { from: [0.5, 0.5, 0.5], to: [0.5, 0.5, 0.5] },
    { from: [0.5, 0.5, 0.5], to: [2.5, 0.5, 0.5] },
    { from: [0.5, 0.5, 0.5], to: [1, 0.5, 0.5] },
    { from: [2, 0.5, 0.5], to: [0, 0.5, 0.5] },
    { from: [0.5, 0.5, 0.5], to: [2.5, 0.5, 0.5], body: { min: [1, 0, 0], max: [2, 1, 1] } },
  ];
  // Axis and diagonal cases distinguish zero components, tied axes and signs without a seed sweep.
  const directions: Vec3[] = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
    [-1, -1, -1],
    [-1, -1, 1],
    [-1, 1, -1],
    [-1, 1, 1],
    [1, -1, -1],
    [1, -1, 1],
    [1, 1, -1],
    [1, 1, 1],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
  ];
  for (const [x, y, z] of directions) {
    samples.push({ from: [0.5, 0.5, 0.5], to: [0.5 + 3 * x, 0.5 + 3 * y, 0.5 + 3 * z] });
    samples.push({ from: [-0.25, 1, -0.125], to: [3 * x, 3 * y, 3 * z] });
  }
  return samples;
}

/** Runs the production fragment walk, not a JavaScript imitation, against the rules' exact ray. */
export function pointLightRayProof() {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) {
    throw new Error('Point-light ray probe requires WebGL2 and 3D textures');
  }
  const vertex = compile(
    gl,
    gl.VERTEX_SHADER,
    `#version 300 es
    void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`,
  );
  const fragment = compile(
    gl,
    gl.FRAGMENT_SHADER,
    `#version 300 es
    precision highp float;
    precision highp int;
    ${POINT_LIGHT_RAY_GLSL}
    uniform vec3 source;
    uniform vec3 receiver;
    uniform vec3 bodyMin;
    uniform vec3 bodyMax;
    out vec4 answer;
    void main() { answer = vec4(vec3(pointLightRay(source, receiver, bodyMin, bodyMax)), 1.0); }`,
  );
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program)!);
  }
  gl.useProgram(program);
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const origin: Vec3 = [-4, -4, -4];
  const size = 8;
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, size, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, blockingCells(size, origin));
  const vec = (name: string, value: Vec3) => gl.uniform3fv(gl.getUniformLocation(program, name), value);
  vec('uLightBlockerOrigin', origin);
  vec('uLightBlockerSize', [size, size, size]);
  gl.uniform1i(gl.getUniformLocation(program, 'uLightBlockers'), 0);
  gl.viewport(0, 0, 1, 1);
  const samples = probeSamples();
  const answers: number[] = [];
  const pixel = new Uint8Array(4);
  try {
    for (const sample of samples) {
      vec('source', sample.from);
      vec('receiver', sample.to);
      vec('bodyMin', sample.body?.min ?? [0, 0, 0]);
      vec('bodyMax', sample.body?.max ?? [0, 0, 0]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const cpu = Number(reaches(sample.from, sample.to, solid, sample.body));
      const gpu = pixel[0]! / 255;
      if (cpu !== gpu) {
        throw new Error(`Point-light ray mismatch: ${JSON.stringify({ ...sample, cpu, gpu })}`);
      }
      answers.push(cpu);
    }
    if (!(answers.includes(0) && answers.includes(1))) {
      throw new Error('Ray probe must exercise light and darkness');
    }
    if (gl.getError() !== gl.NO_ERROR) {
      throw new Error('Point-light ray probe GL error');
    }
    return {
      samples: samples.length,
      lit: answers.filter(Boolean).length,
      max3d: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE),
    };
  } finally {
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
