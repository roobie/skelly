import {
  type FramebufferTexture,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector4,
  type WebGLRenderer,
} from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GraphicsOptions } from '../src/core/graphics.ts';
import { Mood } from '../src/render/mood.ts';

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
};

it('non-post rendering scales the scene and hands, presents at display resolution, and probes the complete draw', () => {
  vi.stubGlobal('document', { visibilityState: 'visible' });
  const display = new Vector2(420, 240);
  const ratio = 1.5;
  const viewport = new Vector4(0, 0, display.x / ratio, display.y / ratio);
  const original = viewport.clone();
  const scissor = original.clone();
  const scene = new Scene();
  const drawing: { kind: string; viewport: Vector4 }[] = [];
  query.begin.mockImplementation(() => query.end);
  const renderer = {
    domElement: new EventTarget(),
    toneMapping: NoToneMapping,
    getContext: () => ({}),
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
    getScissor: (target: Vector4) => target.copy(scissor),
    setScissor: vi.fn(),
    getScissorTest: () => false,
    setScissorTest: vi.fn(),
    render: vi.fn((root: unknown) => {
      drawing.push({ kind: root === scene ? 'scene' : 'present', viewport: viewport.clone() });
      expect(query.end).not.toHaveBeenCalled();
    }),
    copyFramebufferToTexture: vi.fn((_texture: FramebufferTexture) => undefined),
  };
  const mood = new Mood(renderer as unknown as WebGLRenderer, scene, new PerspectiveCamera(), tuning);
  expect(mood.post).toBe(false);
  mood.render(() => drawing.push({ kind: 'hands', viewport: viewport.clone() }));
  const scaled = new Vector4(
    0,
    0,
    Math.floor(display.x * mood.renderScale) / ratio,
    Math.floor(display.y * mood.renderScale) / ratio,
  );
  expect(drawing).toEqual([
    { kind: 'scene', viewport: scaled },
    { kind: 'hands', viewport: scaled },
    { kind: 'present', viewport: original },
  ]);
  const texture = renderer.copyFramebufferToTexture.mock.calls[0]?.[0];
  expect(texture?.image).toMatchObject({ width: scaled.z * ratio, height: scaled.w * ratio });
  expect(query.begin).toHaveBeenCalled();
  expect(query.end).toHaveBeenCalled();
  expect(viewport).toEqual(original);
  expect(display).toEqual(new Vector2(420, 240));
});
