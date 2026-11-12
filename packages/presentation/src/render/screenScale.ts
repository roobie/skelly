import {
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

/**
 * Draws the scene below render scale 1 and presents it at display resolution, without the
 * full-screen copy the canvas path paid: instead of drawing into a sub-viewport of the multisampled
 * default framebuffer and copying that region out (`copyFramebufferToTexture`, whose implicit resolve
 * plus transfer d989-6 measured at about 2.9 GPU ms), the scene draws straight into the render target
 * the presenting quad samples. Pixel-equal to the copy it replaces: the target is byte-sized like the
 * canvas, carries the canvas's own sample count so the scene resolves as it did, and `isXRRenderTarget`
 * routes it through three's canvas output paths (colour space and tone mapping in `WebGLRenderer`,
 * `setProgram` and `getUnlitUniformColorSpace`), so its bytes are the bytes the canvas held.
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
      // The `isXRRenderTarget` flag below routes the scene shaders through the target's own colour
      // space, so they write display-encoded bytes as they did for the canvas. Those bytes must land
      // in plain RGBA8, not SRGB8_ALPHA8 storage: sampling raw bytes back is what the presenting quad
      // copies unchanged, and RGBA8 is also the format of the multisample renderbuffer, which the
      // spec only lets resolve into same-format storage (an sRGB texture never resolves).
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
