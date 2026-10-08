import {
  Fog,
  HalfFloatType,
  PerspectiveCamera,
  type Scene,
  Vector2,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { ScopeFog } from '../core/opticFog.ts';
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

/** A lens frame, plus the zoom pass's lifted fog when the scope sees past the main view's. */
export type ScopedLensFrame = OpticLensFrame & { readonly scopeFog?: ScopeFog };

export class OpticLensRenderer {
  private readonly zoomCamera = new PerspectiveCamera();
  private readonly target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });

  get texture() {
    return this.target.texture;
  }

  /**
   * Renders the zoom view. The frame's `scopeFog`, when given, replaces the scene's distance fog and
   * the zoom camera's far plane for this render only (core/opticFog.ts); both are put back before
   * returning, so the main view is unchanged.
   */
  prepare(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, frame: ScopedLensFrame): void {
    const { scopeFog } = frame;
    const pass = renderer.getDrawingBufferSize(new Vector2());
    if (this.target.width !== pass.x || this.target.height !== pass.y) {
      this.target.setSize(pass.x, pass.y);
    }
    if (!(frame.magnification > 1)) {
      return;
    }
    const previous = renderer.getRenderTarget();
    const fog = scene.fog instanceof Fog ? scene.fog : undefined;
    const lift = fog && scopeFog ? { fog, saved: { near: fog.near, far: fog.far }, to: scopeFog } : undefined;
    this.zoomCamera.copy(camera);
    this.zoomCamera.fov = opticFieldOfView(camera.fov, frame.magnification);
    if (lift) {
      this.zoomCamera.far = lift.to.far;
    }
    this.zoomCamera.updateProjectionMatrix();
    try {
      if (lift) {
        lift.fog.near = lift.to.near;
        lift.fog.far = lift.to.far;
      }
      renderer.setRenderTarget(this.target);
      renderer.render(scene, this.zoomCamera);
    } finally {
      if (lift) {
        lift.fog.near = lift.saved.near;
        lift.fog.far = lift.saved.far;
      }
      renderer.setRenderTarget(previous);
    }
  }

  dispose(): void {
    this.target.dispose();
  }
}

export const opticLensPass = (): ShaderPass => new ShaderPass(OPTIC_LENS_SHADER);

/** The zoom camera's four frustum corner rays per metre of depth, reduced to their horizontal (x, z) parts. */
export const zoomFrustumCorners = (camera: PerspectiveCamera, magnification: number): [number, number][] => {
  const halfHeight = Math.tan((opticFieldOfView(camera.fov, magnification) * Math.PI) / 360);
  const halfWidth = halfHeight * camera.aspect;
  const ray = new Vector3();
  return [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].map(([sx, sy]) => {
    ray.set(sx! * halfWidth, sy! * halfHeight, -1).applyQuaternion(camera.quaternion);
    return [ray.x, ray.z];
  });
};
