import { opticApertureDistance } from '@skelly/thing-core/optic-aperture';
import { Color, Vector2, WebGLRenderTarget } from 'three';
import { OpticHousingMask } from '../../src/render/opticHousingMask.ts';
import { opticLensPass, setOpticLensUniforms } from '../../src/render/opticLens.ts';

// An independent silhouette supplies real tube witnesses even when the production disc correctly ignores it.
export const scopeDiscPixels = ({ engine, view }) => {
  const { renderer, scene, camera } = engine;
  const frame = view.held.opticLensFrame;
  const size = renderer.getDrawingBufferSize(new Vector2());
  // Cropping avoids full-screen readback without subsampling away tube witnesses.
  const [radiusX, radiusY] = frame.radius;
  const [centerX, centerY] = frame.center;
  const rx = radiusX * frame.aperture.aspectRatio;
  const x0 = Math.max(0, Math.floor((centerX - rx) * size.x));
  const y0 = Math.max(0, Math.floor((centerY - radiusY) * size.y));
  const x1 = Math.min(size.x, Math.ceil((centerX + rx) * size.x));
  const y1 = Math.min(size.y, Math.ceil((centerY + radiusY) * size.y));
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) {
    throw new Error('The scope aperture must intersect the drawing buffer');
  }
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
    const mask = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(silhouette.target, x0, y0, width, height, mask);
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
    renderer.readRenderTargetPixels(output, x0, y0, width, height, pixels);
    let occludingPixels = 0;
    let unreplacedPixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const dx = ((x0 + x + 0.5) / size.x - centerX) / radiusX;
        const dy = ((y0 + y + 0.5) / size.y - centerY) / radiusY;
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
