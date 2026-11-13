import {
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

/**
 * Draws the scene below render scale 1 and presents it at display resolution, without the
 * full-screen copy the previous path paid: instead of drawing into a sub-viewport of the multisampled
 * default framebuffer and copying that region out (`copyFramebufferToTexture`), the scene draws
 * straight into the render target the presenting quad samples. The target is built so the scene goes
 * through the same encoding path the canvas draw used — byte-sized colour, the canvas's own sample
 * count, and three's canvas colour-space and tone-mapping output routing — which is the intended
 * equivalence, not a byte-equality guarantee: this target's multisample resolve runs through a
 * different code path than the default framebuffer's.
 */
export class ScreenScale {
  private target: WebGLRenderTarget | undefined;
  private readonly bufferSize = new Vector2();
  private readonly material = new ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, opacity: { value: 1 } },
    vertexShader: CopyShader.vertexShader,
    fragmentShader: CopyShader.fragmentShader,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new FullScreenQuad(this.material);

  render(renderer: WebGLRenderer, scale: number, draw: () => void): void {
    renderer.getDrawingBufferSize(this.bufferSize);
    const width = Math.max(1, Math.floor(this.bufferSize.x * scale));
    const height = Math.max(1, Math.floor(this.bufferSize.y * scale));
    if (!this.target || this.target.width !== width || this.target.height !== height) {
      this.target?.dispose();
      this.target = this.targetOf(renderer, width, height);
      this.material.uniforms.tDiffuse!.value = this.target.texture;
    }
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    try {
      draw();
    } finally {
      renderer.setRenderTarget(previous);
    }
    // The quad upsamples the scaled scene with linear filtering; the canvas and separate UI keep their
    // display resolution.
    this.quad.render(renderer);
  }

  /** The canvas-shaped scene target at the scaled size; see the class comment. */
  private targetOf(renderer: WebGLRenderer, width: number, height: number): WebGLRenderTarget {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const previous = renderer.getRenderTarget();
    if (previous !== null) {
      renderer.setRenderTarget(null);
    }
    const samples = gl.getParameter(gl.SAMPLES) as number;
    if (previous !== null) {
      renderer.setRenderTarget(previous);
    }
    const target = new WebGLRenderTarget(width, height, {
      type: UnsignedByteType,
      colorSpace: SRGBColorSpace,
      // The `isXRRenderTarget` flag routes the scene shaders through the target's own colour space
      // and tone mapping — the canvas's output path. It is a three implementation detail, not a
      // supported flag for ordinary render targets, so a three upgrade must recheck the branches
      // that read it (output colour space in `WebGLRenderer`, tone mapping in `WebGLPrograms`,
      // `getUnlitUniformColorSpace`, multisample storage in `WebGLTextures`). The display-encoded
      // colour must land in plain RGBA8, not SRGB8_ALPHA8 storage: sampling raw bytes back is what
      // the presenting quad copies unchanged, and RGBA8 is also the format of the multisample
      // renderbuffer, which the spec only lets resolve into same-format storage (an sRGB texture
      // never resolves).
      internalFormat: 'RGBA8',
      samples,
      // Only the colour the quad reads is resolved; a depth blit would be pure cost.
      resolveDepthBuffer: false,
      resolveStencilBuffer: false,
    });
    (target as WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    return target;
  }
}
