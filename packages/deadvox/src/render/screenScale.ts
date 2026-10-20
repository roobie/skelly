import { FramebufferTexture, LinearFilter, ShaderMaterial, Vector2, Vector4, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

/** Upscale display-encoded screen pixels without another tone or colour-space conversion. */
export class ScreenScale {
  private texture: FramebufferTexture | undefined;
  private readonly bufferSize = new Vector2();
  private readonly viewport = new Vector4();
  private readonly scissor = new Vector4();
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
    if (!this.texture || this.texture.image.width !== width || this.texture.image.height !== height) {
      this.texture?.dispose();
      this.texture = new FramebufferTexture(width, height);
      this.texture.minFilter = LinearFilter;
      this.texture.magFilter = LinearFilter;
      this.material.uniforms.tDiffuse!.value = this.texture;
    }
    const ratio = renderer.getPixelRatio();
    renderer.getViewport(this.viewport);
    renderer.getScissor(this.scissor);
    const scissorTest = renderer.getScissorTest();
    renderer.setViewport(0, 0, width / ratio, height / ratio);
    renderer.setScissor(0, 0, width / ratio, height / ratio);
    renderer.setScissorTest(true);
    try {
      draw();
      // Copy only the smaller viewport; the canvas and separate UI retain their display resolution.
      renderer.copyFramebufferToTexture(this.texture);
    } finally {
      renderer.setViewport(this.viewport);
      renderer.setScissor(this.scissor);
      renderer.setScissorTest(scissorTest);
    }
    this.quad.render(renderer);
  }
}
