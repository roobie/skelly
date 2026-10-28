import { PerspectiveCamera, Scene, type WebGLRenderer, WebGLRenderTarget } from 'three';
import { expect, it, vi } from 'vitest';
import type { OpticLensFrame } from '../src/core/opticView.ts';
import { OpticLensRenderer } from '../src/render/opticLens.ts';
import { OPTIC_BODY_LAYER, PLAYER_FIGURE_LAYER } from '../src/render/shadowFlags.ts';

it.each([1, 6])('at %sx draws the window image without the presented optic', (magnification) => {
  const frame: OpticLensFrame = {
    magnification,
    aperture: { aspectRatio: 1, exponent: 2 },
    center: [0.5, 0.5],
    reticleCenter: [0.5, 0.5],
    radius: [0.2, 0.2],
  };
  const lens = new OpticLensRenderer();
  const previous = new WebGLRenderTarget(2, 2);
  let target: WebGLRenderTarget | null = previous;
  const render = vi.fn((_scene: Scene, image: PerspectiveCamera) => {
    expect(image.layers.isEnabled(0)).toBe(true);
    expect(image.layers.isEnabled(OPTIC_BODY_LAYER)).toBe(false);
    // Unity keeps the gun beyond the glass; a magnified image is the far world alone.
    expect(image.layers.isEnabled(PLAYER_FIGURE_LAYER)).toBe(magnification === 1);
  });
  const renderer = {
    getDrawingBufferSize: (out: { set: (x: number, y: number) => unknown }) => out.set(32, 32),
    getRenderTarget: () => target,
    setRenderTarget: (next: WebGLRenderTarget | null) => {
      target = next;
    },
    render,
  } as unknown as WebGLRenderer;
  const camera = new PerspectiveCamera();
  camera.layers.enable(PLAYER_FIGURE_LAYER);
  camera.layers.enable(OPTIC_BODY_LAYER);
  const layers = camera.layers.mask;
  try {
    lens.prepare(renderer, new Scene(), camera, frame);
    expect(render).toHaveBeenCalledTimes(1);
    expect(lens.housingActive).toBe(false);
    expect(target).toBe(previous);
    expect(camera.layers.mask).toBe(layers);
  } finally {
    lens.dispose();
    previous.dispose();
  }
});
