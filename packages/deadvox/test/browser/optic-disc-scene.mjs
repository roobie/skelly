import { opticApertureDistance } from '@skelly/thing-core/optic-aperture';
import { Color, Vector2, WebGLRenderTarget } from 'three';
import { OpticHousingMask } from '../../src/render/opticHousingMask.ts';
import { opticLensPass, setOpticLensUniforms } from '../../src/render/opticLens.ts';

// An independent silhouette supplies real tube witnesses even when the production disc correctly ignores it.
export const scopeDiscPixels = ({ engine, view }) => {
  const { renderer, scene, camera } = engine;
  const frame = view.held.opticLensFrame;
  const size = renderer.getDrawingBufferSize(new Vector2());
  const source = new WebGLRenderTarget(size.x, size.y);
  const image = new WebGLRenderTarget(size.x, size.y);
  const output = new WebGLRenderTarget(size.x, size.y);
  const silhouette = new OpticHousingMask();
  const pass = opticLensPass();
  const previous = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new Color());
  const alpha = renderer.getClearAlpha();
  const { autoClear } = renderer;
  try {
    silhouette.prepare(renderer, scene, camera);
    const mask = new Uint8Array(size.x * size.y * 4);
    renderer.readRenderTargetPixels(silhouette.target, 0, 0, size.x, size.y, mask);
    renderer.autoClear = true;
    for (const [target, color] of [
      [source, 0xff_00_00],
      [image, 0x00_ff_00],
    ]) {
      renderer.setRenderTarget(target);
      renderer.setClearColor(color, 1);
      renderer.clear();
    }
    setOpticLensUniforms(pass, { ...frame, reticle: undefined });
    pass.uniforms.uLensCenter.value.set(...frame.center);
    pass.uniforms.uLensRadius.value.set(...frame.radius);
    pass.uniforms.uZoomTexture.value = image.texture;
    pass.uniforms.uZoomActive.value = engine.mood.opticPass.uniforms.uZoomActive.value;
    pass.uniforms.uHousingTexture.value = silhouette.texture;
    pass.uniforms.uHousingActive.value = engine.mood.opticPass.uniforms.uHousingActive.value;
    pass.material.toneMapped = false;
    pass.render(renderer, output, source, 0, false);
    const pixels = new Uint8Array(mask.length);
    renderer.readRenderTargetPixels(output, 0, 0, size.x, size.y, pixels);
    let occludingPixels = 0;
    let unreplacedPixels = 0;
    for (let y = 0; y < size.y; y += 1) {
      for (let x = 0; x < size.x; x += 1) {
        const offset = (y * size.x + x) * 4;
        const dx = ((x + 0.5) / size.x - frame.center[0]) / frame.radius[0];
        const dy = ((y + 0.5) / size.y - frame.center[1]) / frame.radius[1];
        if (mask[offset] > 127 && opticApertureDistance(dx, dy, frame.aperture) < 0.9) {
          occludingPixels += 1;
          unreplacedPixels += Number(pixels[offset] > 1 || pixels[offset + 1] < 254 || pixels[offset + 2] > 1);
        }
      }
    }
    return { occludingPixels, unreplacedPixels };
  } finally {
    renderer.setRenderTarget(previous);
    renderer.setClearColor(clear, alpha);
    renderer.autoClear = autoClear;
    pass.dispose();
    silhouette.dispose();
    source.dispose();
    image.dispose();
    output.dispose();
  }
};
