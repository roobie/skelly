import {
  ACESFilmicToneMapping,
  DataTexture,
  FloatType,
  HalfFloatType,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createMoodOutputPass } from '../../src/render/moodOutput.ts';

const vertexShader = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Tone/transfer must precede grade; compare the fused draw with a separate display-space reference. */
export function moodOutputProof(): void {
  const renderer = new WebGLRenderer();
  renderer.setSize(8, 4);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.7;
  const input = new WebGLRenderTarget(8, 4, { type: HalfFloatType, depthBuffer: false });
  const display = input.clone();
  const result = new WebGLRenderTarget(8, 4, { depthBuffer: false });
  const source = new DataTexture(
    new Float32Array([0.01, 0.08, 0.3, 1, 0.2, 0.6, 0.1, 1, 3, 1, 0.2, 1, 0.4, 0.05, 2, 1]),
    4,
    1,
    RGBAFormat,
    FloatType,
  );
  source.minFilter = NearestFilter;
  source.magFilter = NearestFilter;
  source.needsUpdate = true;
  const copy = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
  });
  const output = new OutputPass();
  const fused = createMoodOutputPass();
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
void main() {
  vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luminance), c, 0.4);
  c += vec3(-0.03, 0.01, 0.07) * (1.0 - smoothstep(0.0, 0.5, luminance));
  c += vec3(0.06, 0.02, -0.01) * smoothstep(0.5, 1.0, luminance);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);
  gl_FragColor = vec4(c, 1.0);
}`,
  });
  fused.uniforms.uSaturation!.value = 0.4;
  fused.uniforms.uContrast!.value = 0.3;
  fused.uniforms.uShadowTint!.value = [-0.03, 0.01, 0.07];
  fused.uniforms.uHighlightTint!.value = [0.06, 0.02, -0.01];
  const expected = new Uint8Array(8 * 4 * 4);
  const actual = new Uint8Array(expected.length);
  try {
    const sourceMaterial = new ShaderMaterial({
      uniforms: { source: { value: source } },
      vertexShader,
      fragmentShader: `uniform sampler2D source; varying vec2 vUv;
void main() { gl_FragColor = texture2D(source, vUv); }`,
    });
    const quad = new FullScreenQuad(sourceMaterial);
    try {
      renderer.setRenderTarget(input);
      quad.render(renderer);
    } finally {
      quad.dispose();
      sourceMaterial.dispose();
    }
    output.render(renderer, display, input, 0, false);
    for (const enabled of [false, true]) {
      fused.uniforms.uGradeEnabled!.value = enabled ? 1 : 0;
      if (enabled) {
        grade.render(renderer, result, display, 0, false);
      } else {
        copy.render(renderer, result, display, 0, false);
      }
      renderer.readRenderTargetPixels(result, 0, 0, 8, 4, expected);
      fused.render(renderer, result, input, 0, false);
      renderer.readRenderTargetPixels(result, 0, 0, 8, 4, actual);
      if (new Set(expected).size < 4) {
        throw new Error('Mood output reference did not render the colour fixture');
      }
      for (let i = 0; i < actual.length; i++) {
        if (Math.abs(actual[i]! - expected[i]!) > 1) {
          throw new Error(`Mood output must grade after tone/transfer (enabled=${enabled}, channel=${i})`);
        }
      }
    }
  } finally {
    input.dispose();
    display.dispose();
    result.dispose();
    source.dispose();
    copy.dispose();
    output.dispose();
    grade.dispose();
    fused.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
