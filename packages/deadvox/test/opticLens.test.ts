import {
  BoxGeometry,
  type Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { expect, it, vi } from 'vitest';
import { graphicsTuningOf } from '../src/core/graphicsTuning.ts';
import type { OpticLensFrame } from '../src/core/opticView.ts';
import { OpticLensRenderer, opticLensPass, setOpticLensUniforms } from '../src/render/opticLens.ts';
import { OPTIC_BODY_LAYER, PLAYER_FIGURE_LAYER } from '../src/render/shadowFlags.ts';
import { baseRegistry } from './baseRegistry.ts';

it('takes optic rim and reticle edge tuning from content', () => {
  const tuning = graphicsTuningOf(baseRegistry()).opticLens;
  const pass = opticLensPass(tuning);
  expect(pass.uniforms.uRimSoftness!.value).toBe(tuning.rimSoftness);
  expect(pass.uniforms.uReticleAntiAliasWidth!.value).toBe(tuning.reticleAntiAliasWidth);
  pass.dispose();
});

it.each([1, 6])('at %sx draws the window image without the presented optic', (magnification) => {
  const frame: OpticLensFrame = {
    magnification,
    worldAtUnity: true,
    magnifying: magnification > 1,
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

it.each([
  ['source window', { magnification: 1, worldAtUnity: false, magnifying: false }, 0],
  ['scope at unity', { magnification: 1, worldAtUnity: true, magnifying: true }, 1],
  ['magnified scope', { magnification: 6, worldAtUnity: true, magnifying: true }, 1],
] as const)('%s clears the preceding housing mask without moving the reticle', (_name, presentation, imageDraws) => {
  const frame: OpticLensFrame = {
    magnification: 1,
    worldAtUnity: true,
    magnifying: false,
    aperture: { aspectRatio: 1, exponent: 2 },
    center: [0.5, 0.5],
    reticleCenter: [0.4, 0.6],
    radius: [0.2, 0.2],
  };
  const lens = new OpticLensRenderer();
  const pass = opticLensPass(graphicsTuningOf(baseRegistry()).opticLens);
  const scene = new Scene();
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  mesh.layers.set(OPTIC_BODY_LAYER);
  scene.add(mesh);
  let target: WebGLRenderTarget | null = null;
  const render = vi.fn();
  const renderer = {
    getDrawingBufferSize: (out: { set: (x: number, y: number) => unknown }) => out.set(32, 32),
    getRenderTarget: () => target,
    setRenderTarget: (next: WebGLRenderTarget | null) => {
      target = next;
    },
    getClearColor: (out: Color) => out.set(0),
    getClearAlpha: () => 1,
    setClearColor: vi.fn(),
    render,
  } as unknown as WebGLRenderer;
  try {
    lens.prepare(renderer, scene, new PerspectiveCamera(), frame);
    expect(lens.housingActive).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
    render.mockClear();
    const next = { ...frame, ...presentation };
    lens.prepare(renderer, scene, new PerspectiveCamera(), next);
    setOpticLensUniforms(pass, next);
    expect(render).toHaveBeenCalledTimes(imageDraws);
    if (imageDraws > 0) {
      expect(render.mock.calls[0]![0]).toBe(scene);
    }
    expect(lens.housingActive).toBe(false);
    expect(pass.uniforms.uZoomActive!.value).toBe(imageDraws);
    expect(pass.uniforms.uReticleCenter!.value.toArray()).toEqual(frame.reticleCenter);
  } finally {
    lens.dispose();
    pass.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});
