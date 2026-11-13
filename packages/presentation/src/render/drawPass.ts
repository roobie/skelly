import type { WebGLRenderer, WebGLRenderTarget } from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

/** Runs a draw callback into the scene target, so held items go through bloom and tone mapping with the scene. */
export class DrawPass extends Pass {
  draw: () => void;

  constructor() {
    super();
    // Draws into the read buffer, over what the render pass left there, so nothing is swapped.
    this.needsSwap = false;
    this.draw = () => undefined;
  }

  override render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget): void {
    renderer.setRenderTarget(read);
    this.draw();
  }
}
