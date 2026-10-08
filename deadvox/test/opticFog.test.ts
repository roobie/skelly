import { Fog, PerspectiveCamera, Scene, type Vector2, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import type { OpticLensFrame } from '../src/core/opticView.ts';
import { OpticLensRenderer } from '../src/render/opticLens.ts';

const frame: OpticLensFrame = { magnification: 4, center: [0.5, 0.5], radius: [0.25, 0.4] };

describe('scope fog lift (d172 spike)', () => {
  it('lifts the fog for the zoom render only, leaving the main view fog and far plane as they were', () => {
    const scene = new Scene();
    scene.fog = new Fog(0, 48, 80);
    const camera = new PerspectiveCamera(70, 1.5, 0.05, 80);
    const seen: { near: number; far: number; cameraFar: number }[] = [];
    const renderer = {
      getDrawingBufferSize: (size: Vector2) => size.set(4, 4),
      getRenderTarget: () => null,
      setRenderTarget: () => undefined,
      render: (_scene: Scene, zoom: PerspectiveCamera) => {
        const fog = scene.fog as Fog;
        seen.push({ near: fog.near, far: fog.far, cameraFar: zoom.far });
      },
    } as unknown as WebGLRenderer;

    new OpticLensRenderer().prepare(renderer, scene, camera, { ...frame, scopeFog: { near: 60, far: 100 } });

    expect(seen).toEqual([{ near: 60, far: 100, cameraFar: 100 }]);
    const fog = scene.fog as Fog;
    expect([fog.near, fog.far, camera.far]).toEqual([48, 80, 80]);
  });
});
