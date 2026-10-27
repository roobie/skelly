import { PerspectiveCamera, Scene, type WebGLRenderer, WebGLRenderTarget } from 'three';
import { expect, it, vi } from 'vitest';
import type { OpticLensFrame } from '../src/core/opticView.ts';
import { OpticLensRenderer, opticLensPass, setOpticLensUniforms } from '../src/render/opticLens.ts';
import { OPTICS_SPIKE_LAYER } from '../src/render/opticsSpike.ts';
import { PLAYER_FIGURE_LAYER } from '../src/render/shadowFlags.ts';

it.each([
  ['disc', 1, true],
  ['disc', 6, true],
  ['none', 1, false],
  ['none', 6, true],
] as const)('%s at %sx selects world replacement, excluding only the owner', (tube, magnification, renderWorld) => {
  const frame: OpticLensFrame = {
    magnification,
    worldAtUnity: tube === 'disc',
    excludeSelf: true,
    aperture: { aspectRatio: 1, exponent: 2 },
    center: [0.5, 0.5],
    reticleCenter: [0.5, 0.5],
    radius: [0.2, 0.2],
  };
  const lens = new OpticLensRenderer();
  const pass = opticLensPass();
  const previous = new WebGLRenderTarget(2, 2);
  let target: WebGLRenderTarget | null = previous;
  const render = vi.fn((_scene: Scene, zoom: PerspectiveCamera) => {
    expect(zoom.layers.isEnabled(OPTICS_SPIKE_LAYER)).toBe(false);
    expect(zoom.layers.isEnabled(PLAYER_FIGURE_LAYER)).toBe(false);
    expect(zoom.layers.isEnabled(0)).toBe(true);
    expect(zoom.layers.isEnabled(5)).toBe(true);
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
  camera.layers.enable(OPTICS_SPIKE_LAYER);
  camera.layers.enable(PLAYER_FIGURE_LAYER);
  camera.layers.enable(5);
  try {
    setOpticLensUniforms(pass, frame);
    lens.prepare(renderer, new Scene(), camera, frame);
    expect(pass.uniforms.uZoomActive!.value).toBe(renderWorld ? 1 : 0);
    expect(render).toHaveBeenCalledTimes(renderWorld ? 1 : 0);
    expect(target).toBe(previous);
    expect(camera.layers.isEnabled(OPTICS_SPIKE_LAYER)).toBe(true);
    expect(camera.layers.isEnabled(PLAYER_FIGURE_LAYER)).toBe(true);
  } finally {
    lens.dispose();
    pass.dispose();
    previous.dispose();
  }
});
