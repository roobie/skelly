import { MAX_RETICLE_PRIMITIVES, reticleScale } from '@skelly/thing-core/reticle';
import {
  HalfFloatType,
  PerspectiveCamera,
  type Scene,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { OpticLensFrame } from '../core/opticView.ts';
import { opticFieldOfView, opticRendersWorld } from '../core/opticView.ts';
import { OpticHousingMask } from './opticHousingMask.ts';
import { OPTIC_BODY_LAYER } from './shadowFlags.ts';

const OPTIC_LENS_SHADER = {
  name: 'OpticLensShader',
  uniforms: {
    tDiffuse: { value: null },
    uZoomTexture: { value: null },
    uZoomActive: { value: 0 },
    uHousingTexture: { value: null },
    uHousingActive: { value: 0 },
    uLensCenter: { value: new Vector2(0.5, 0.5) },
    uReticleCenter: { value: new Vector2(0.5, 0.5) },
    uLensRadius: { value: new Vector2(0.25, 0.4) },
    uLensShape: { value: new Vector2() },
    uReticleCount: { value: 0 },
    uReticleScale: { value: 1 },
    uReticleGeometry: { value: Array.from({ length: MAX_RETICLE_PRIMITIVES }, () => new Vector4()) },
    uReticleStyle: { value: Array.from({ length: MAX_RETICLE_PRIMITIVES }, () => new Vector3()) },
    uReticleColor: { value: Array.from({ length: MAX_RETICLE_PRIMITIVES }, () => new Vector3()) },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform sampler2D uZoomTexture;
uniform float uZoomActive;
uniform sampler2D uHousingTexture;
uniform float uHousingActive;
uniform vec2 uLensCenter;
uniform vec2 uReticleCenter;
uniform vec2 uLensRadius;
uniform vec2 uLensShape;
uniform int uReticleCount;
uniform float uReticleScale;
uniform vec4 uReticleGeometry[${MAX_RETICLE_PRIMITIVES}];
uniform vec3 uReticleStyle[${MAX_RETICLE_PRIMITIVES}];
uniform vec3 uReticleColor[${MAX_RETICLE_PRIMITIVES}];
varying vec2 vUv;

vec3 reticle(vec2 p, vec3 color, float aperture) {
  p /= uReticleScale;
  float aa = max(length(fwidth(p)) * 0.5, 0.0001);
  for (int i = 0; i < ${MAX_RETICLE_PRIMITIVES}; i++) {
    if (i >= uReticleCount) break;
    vec4 g = uReticleGeometry[i];
    vec3 s = uReticleStyle[i];
    float distance;
    if (s.x < 0.5) {
      distance = length(p - g.xy) - s.y;
    } else if (s.x < 1.5) {
      distance = abs(length(p - g.xy) - s.y) - s.z * 0.5;
    } else {
      vec2 segment = g.zw - g.xy;
      float t = clamp(dot(p - g.xy, segment) / dot(segment, segment), 0.0, 1.0);
      distance = length(p - g.xy - t * segment) - s.z * 0.5;
    }
    float mark = (1.0 - smoothstep(-aa, aa, distance)) * aperture;
    color = mix(color, uReticleColor[i], mark);
  }
  return color;
}

void main() {
  vec4 source = texture2D(tDiffuse, vUv);
  vec2 local = (vUv - uLensCenter) / uLensRadius;
  vec2 profile = abs(local) / vec2(uLensShape.x, 1.0);
  float radius = pow(pow(profile.x, uLensShape.y) + pow(profile.y, uLensShape.y), 1.0 / uLensShape.y);
  float housing = texture2D(uHousingTexture, vUv).r * uHousingActive;
  float aperture = (1.0 - smoothstep(0.96, 1.0, radius)) * (1.0 - housing);
  vec3 lens = mix(source.rgb, texture2D(uZoomTexture, vUv).rgb, uZoomActive);
  vec3 color = mix(source.rgb, lens, aperture);
  color = reticle((vUv - uReticleCenter) / uLensRadius, color, aperture);
  gl_FragColor = vec4(color, source.a);
}`,
};

export class OpticLensRenderer {
  private readonly zoomCamera = new PerspectiveCamera();
  private readonly target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  private readonly housing = new OpticHousingMask();
  private housingPrepared = false;

  get texture() {
    return this.target.texture;
  }

  get housingTexture() {
    return this.housing.texture;
  }

  get housingActive(): boolean {
    return this.housingPrepared;
  }

  /**
   * Unity images retain nearby gun features, but exclude the optic itself. A source-window presentation needs
   * neither a replacement image nor its housing mask. Magnified images remain the far world alone.
   */
  prepare(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, frame: OpticLensFrame): void {
    const pass = renderer.getDrawingBufferSize(new Vector2());
    if (this.target.width !== pass.x || this.target.height !== pass.y) {
      this.target.setSize(pass.x, pass.y);
    }
    this.housingPrepared = false;
    if (!opticRendersWorld(frame)) {
      return;
    }
    this.housingPrepared = !frame.magnifying && this.housing.prepare(renderer, scene, camera);
    const previous = renderer.getRenderTarget();
    this.zoomCamera.copy(camera);
    if (frame.magnification > 1) {
      this.zoomCamera.layers.set(0);
    } else {
      this.zoomCamera.layers.disable(OPTIC_BODY_LAYER);
    }
    this.zoomCamera.fov = opticFieldOfView(camera.fov, frame.magnification);
    this.zoomCamera.updateProjectionMatrix();
    try {
      renderer.setRenderTarget(this.target);
      renderer.render(scene, this.zoomCamera);
    } finally {
      renderer.setRenderTarget(previous);
    }
  }

  dispose(): void {
    this.target.dispose();
    this.housing.dispose();
  }
}

export const opticLensPass = (): ShaderPass => new ShaderPass(OPTIC_LENS_SHADER);

export const setOpticLensUniforms = (pass: ShaderPass, frame: OpticLensFrame): void => {
  const { reticle, aperture } = frame;
  const { uniforms } = pass;
  uniforms.uZoomActive!.value = opticRendersWorld(frame) ? 1 : 0;
  uniforms.uReticleCenter!.value.set(...frame.reticleCenter);
  uniforms.uLensShape!.value.set(aperture.aspectRatio, aperture.exponent);
  uniforms.uReticleCount!.value = reticle?.primitives.length ?? 0;
  uniforms.uReticleScale!.value = reticle ? reticleScale(reticle, frame.magnification) : 1;
  reticle?.primitives.forEach((primitive, index) => {
    const geometry: Vector4 = uniforms.uReticleGeometry!.value[index];
    const style: Vector3 = uniforms.uReticleStyle!.value[index];
    if (primitive.kind === 'line') {
      geometry.set(...primitive.from, ...primitive.to);
      style.set(2, 0, primitive.width);
    } else {
      geometry.set(...primitive.center, 0, 0);
      style.set(primitive.kind === 'dot' ? 0 : 1, primitive.radius, primitive.kind === 'ring' ? primitive.width : 0);
    }
    uniforms.uReticleColor!.value[index].set(...primitive.color);
  });
};
