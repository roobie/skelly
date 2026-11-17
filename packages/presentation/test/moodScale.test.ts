import type { GraphicsOptions } from '@skelly/engine/look';
import { NoToneMapping, PerspectiveCamera, Scene, UnsignedByteType, Vector2, Vector4, type WebGLRenderer } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { ScreenScale } from '../src/render/screenScale.ts';
import { Mood } from '../src/render.ts';

const query = vi.hoisted(() => ({ begin: vi.fn(), end: vi.fn() }));
vi.mock('../src/render/gpuFrameTime.ts', () => {
  class GpuFrameTime {
    begin = query.begin;
  }
  return {
    // biome-ignore lint/style/useNamingConvention: match the module's class export.
    GpuFrameTime,
  };
});
afterEach(() => vi.unstubAllGlobals());

const toggle = { label: 'Fixture toggle', default: false, options: [false, true] };
const tuning: GraphicsOptions = {
  renderScale: {
    label: 'Fixture scene',
    default: 0.7,
    min: 0.2,
    max: 1,
    adaptive: { enabled: true, targetRealMs: 10, min: 0.2, max: 1, step: 0.1, hysteresisRealMs: 1, sampleWindow: 4 },
  },
  bloomScale: { label: 'Fixture bloom', default: 1, min: 0.2, max: 1 },
  drugVignette: { label: 'Fixture drug vignette', default: 1, min: 0, max: 1 },
  smallSunMap: toggle,
  fastCamo: toggle,
  coarseWeathering: toggle,
  cachedSurfaceNoise: toggle,
  vehicleFinishes: toggle,
  msaaSamples: { label: 'Fixture smoothing', default: 0, choices: [{ value: 0, label: 'Fixture off' }] },
};
const opticLens = { rimSoftness: 0.04, reticleAntiAliasWidth: 0.5 };

it('non-post rendering scales the scene and hands, presents at display resolution, and probes the complete draw', () => {
  vi.stubGlobal('document', { visibilityState: 'visible' });
  const display = new Vector2(420, 240);
  const ratio = 1.5;
  const viewport = new Vector4(0, 0, display.x / ratio, display.y / ratio);
  const original = viewport.clone();
  const scene = new Scene();
  const drawing: { kind: string; target: null | { width: number; height: number } }[] = [];
  let bound: null | { width: number; height: number } = null;
  query.begin.mockImplementation(() => query.end);
  const renderer = {
    domElement: new EventTarget(),
    toneMapping: NoToneMapping,
    getContext: () => ({ SAMPLES: 4, getParameter: (name: number) => (name === 4 ? 4 : 0) }),
    getDrawingBufferSize: (target: Vector2) => target.copy(display),
    getPixelRatio: () => ratio,
    getViewport: (target: Vector4) => target.copy(viewport),
    setViewport: (x: number | Vector4, y?: number, width?: number, height?: number) => {
      if (x instanceof Vector4) {
        viewport.copy(x);
      } else {
        viewport.set(x, y!, width!, height!);
      }
    },
    getRenderTarget: () => null,
    setRenderTarget: (target: unknown) => {
      bound =
        target === null
          ? null
          : { width: (target as { width: number }).width, height: (target as { height: number }).height };
    },
    render: vi.fn((root: unknown) => {
      drawing.push({ kind: root === scene ? 'scene' : 'present', target: bound && { ...bound } });
      expect(query.end).not.toHaveBeenCalled();
    }),
  };
  const mood = new Mood(renderer as unknown as WebGLRenderer, scene, new PerspectiveCamera(), { ...tuning, opticLens });
  expect(mood.post).toBe(false);
  mood.render(() => drawing.push({ kind: 'hands', target: bound && { ...bound } }));
  const scaled = {
    width: Math.floor(display.x * mood.renderScale),
    height: Math.floor(display.y * mood.renderScale),
  };
  expect(drawing).toEqual([
    { kind: 'scene', target: scaled },
    { kind: 'hands', target: scaled },
    { kind: 'present', target: null },
  ]);
  expect(query.begin).toHaveBeenCalled();
  expect(query.end).toHaveBeenCalled();
  expect(viewport).toEqual(original);
  expect(display).toEqual(new Vector2(420, 240));
});

it('draws the scaled scene into a canvas-shaped target the presenting quad samples', () => {
  const display = new Vector2(420, 240);
  let bound: unknown;
  const presents: unknown[] = [];
  const renderer = {
    getDrawingBufferSize: (target: Vector2) => target.copy(display),
    getRenderTarget: () => null,
    setRenderTarget: (next: unknown) => {
      bound = next;
    },
    getContext: () => ({ SAMPLES: 4, getParameter: () => 4 }),
    render: (root: unknown) => presents.push({ root, target: bound }),
  } as unknown as WebGLRenderer;
  const scale = new ScreenScale();
  let sceneTarget: unknown;
  scale.render(renderer, 0.7, () => {
    sceneTarget = bound;
  });
  const { quad } = scale as unknown as {
    quad: { material: { uniforms: { tDiffuse: { value: unknown } } }; _mesh: unknown };
  };
  expect(presents, 'the quad presents to the canvas').toEqual([{ root: quad._mesh, target: null }]);
  const drawn = sceneTarget as unknown as {
    width: number;
    height: number;
    samples: number;
    isXRRenderTarget?: boolean;
    texture: { colorSpace: string; type: number };
  };
  // Canvas-shaped: byte-sized, the canvas's own sample count, and on the canvas's colour-space and
  // tone-mapping output path, so the scene encodes the way the canvas draw encoded it.
  expect(drawn).toMatchObject({
    width: Math.floor(420 * 0.7),
    height: Math.floor(240 * 0.7),
    samples: 4,
    isXRRenderTarget: true,
  });
  expect(drawn.texture.colorSpace).toBe('srgb');
  expect(drawn.texture.type).toBe(UnsignedByteType);
  expect(quad.material.uniforms.tDiffuse.value).toBe(drawn.texture);
});
