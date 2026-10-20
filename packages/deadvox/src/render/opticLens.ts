import { HalfFloatType, PerspectiveCamera, type Scene, Vector2, type WebGLRenderer, WebGLRenderTarget } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { OpticLensFrame } from '../core/opticView.ts';
import { opticFieldOfView } from '../core/opticView.ts';

const OPTIC_LENS_SHADER = {
  name: 'OpticLensShader',
  uniforms: {
    tDiffuse: { value: null },
    uZoomTexture: { value: null },
    uZoomActive: { value: 0 },
    uLensCenter: { value: new Vector2(0.5, 0.5) },
    uLensRadius: { value: new Vector2(0.25, 0.4) },
    uReticleKind: { value: -1 },
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
uniform vec2 uLensCenter;
uniform vec2 uLensRadius;
uniform int uReticleKind;
varying vec2 vUv;

float stroke(float distance, float width) {
  return 1.0 - smoothstep(width, width + 0.004, distance);
}

float reticle(vec2 p) {
  if (uReticleKind == 0) {
    return 1.0 - smoothstep(0.022, 0.035, length(p));
  }
  if (uReticleKind == 1) {
    float horizontal = stroke(abs(p.y), 0.009) * step(0.10, abs(p.x)) * step(abs(p.x), 0.88);
    float vertical = stroke(abs(p.x), 0.009) * step(0.10, abs(p.y)) * step(abs(p.y), 0.88);
    return max(horizontal, vertical);
  }
  if (uReticleKind == 2) {
    float chevron = stroke(abs(p.y - (0.16 - 1.4 * abs(p.x))), 0.009) * step(abs(p.x), 0.14);
    return chevron;
  }
  return 0.0;
}

void main() {
  vec4 source = texture2D(tDiffuse, vUv);
  vec2 local = (vUv - uLensCenter) / uLensRadius;
  float radius = length(local);
  float aperture = 1.0 - smoothstep(0.96, 1.0, radius);
  vec3 lens = mix(source.rgb, texture2D(uZoomTexture, vUv).rgb, uZoomActive);
  vec3 color = mix(source.rgb, lens, aperture);
  float frame = smoothstep(0.96, 0.99, radius) * (1.0 - smoothstep(1.09, 1.13, radius));
  color = mix(color, vec3(0.035, 0.04, 0.045), frame);
  float mark = reticle(local) * aperture;
  color = mix(color, vec3(0.95, 0.075, 0.035), mark);
  gl_FragColor = vec4(color, source.a);
}`,
};

export class OpticLensRenderer {
  private readonly zoomCamera = new PerspectiveCamera();
  private readonly target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });

  get texture() {
    return this.target.texture;
  }

  prepare(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, frame: OpticLensFrame): void {
    const pass = renderer.getDrawingBufferSize(new Vector2());
    if (this.target.width !== pass.x || this.target.height !== pass.y) {
      this.target.setSize(pass.x, pass.y);
    }
    if (!(frame.magnification > 1)) {
      return;
    }
    const previous = renderer.getRenderTarget();
    this.zoomCamera.copy(camera);
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
  }
}

export const opticLensPass = (): ShaderPass => new ShaderPass(OPTIC_LENS_SHADER);
