import { GLSL3, RawShaderMaterial, WebGLRenderer, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SURFACE_PATTERN_GLSL } from '../../src/render/surfacePatterns.ts';

export function surfacePatternMathProof(): void {
  const renderer = new WebGLRenderer();
  renderer.setSize(1, 1);
  const target = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  const footprint = { value: 0 };
  const shade = { value: 0 };
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    uniforms: { uFootprint: footprint, uShade: shade },
    vertexShader: `precision highp float; in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float;
uniform float uFootprint;
uniform float uShade;
out vec4 result;
${SURFACE_PATTERN_GLSL}
bool finiteValue(float value) { return !isnan(value) && !isinf(value); }
bool unitValue(float value) { return finiteValue(value) && value >= 0.0 && value <= 1.0; }
void main() {
  float footprint = safeFootprint(uFootprint);
  float shade = safeShade(uShade);
  float fade = featureFade(footprint, 0.4);
  float line = lineMask(0.005, 0.005, uFootprint == 0.0 ? 0.0 : footprint);
  bool invalidFootprint = isnan(uFootprint) || isinf(uFootprint) || uFootprint < 0.0;
  bool valid = finiteValue(footprint) && footprint > 0.0
    && finiteValue(shade) && shade >= 0.0 && unitValue(fade) && unitValue(line)
    && (!invalidFootprint || fade == 0.0);
  result = vec4(vec3(valid ? 1.0 : 0.0), 1.0);
}`,
  });
  const quad = new FullScreenQuad(material);
  const cases = [
    { label: 'NaN', footprint: Number.NaN, shade: Number.NaN },
    { label: 'negative', footprint: -1, shade: -1e9 },
    { label: 'infinite', footprint: Number.POSITIVE_INFINITY, shade: Number.POSITIVE_INFINITY },
    { label: 'negative infinite', footprint: Number.NEGATIVE_INFINITY, shade: Number.NEGATIVE_INFINITY },
    { label: 'zero', footprint: 0, shade: 0 },
    { label: 'resolved', footprint: 0.02, shade: 0.97 },
  ];
  const pixel = new Uint8Array(4);
  try {
    if (cases.length === 0) {
      throw new Error('Pattern numeric fixture must contain cases');
    }
    for (const fixture of cases) {
      footprint.value = fixture.footprint;
      shade.value = fixture.shade;
      renderer.setRenderTarget(target);
      quad.render(renderer);
      renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
      if (pixel.some((channel) => channel !== 255)) {
        throw new Error(`Pattern math must remain finite and bounded: ${fixture.label} yielded ${Array.from(pixel)}`);
      }
    }
  } finally {
    quad.dispose();
    material.dispose();
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
