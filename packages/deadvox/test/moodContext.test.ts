import { NeutralToneMapping, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import graphics from '../src/content/base/graphics.json' with { type: 'json' };
import { realSeconds } from '../src/core/time.ts';
import { Mood } from '../src/render/mood.ts';

const owner = vi.hoisted(() => ({
  composers: [] as {
    dispose: ReturnType<typeof vi.fn>;
    setPixelRatio: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('three/addons/postprocessing/EffectComposer.js', () => {
  class EffectComposer {
    passes: { dispose: () => void }[] = [];
    dispose = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    constructor() {
      owner.composers.push(this);
    }
    addPass(pass: { dispose: () => void }) {
      this.passes.push(pass);
    }
  }
  return {
    // biome-ignore lint/style/useNamingConvention: the mock must match the three.js class export.
    EffectComposer,
  };
});

it("draws the goggles' night-vision view through the post chain while the look's post is off", () => {
  const renderer = {
    domElement: new EventTarget(),
    getPixelRatio: () => 1,
    toneMapping: NeutralToneMapping,
    toneMappingExposure: 1,
    render: vi.fn(),
  } as unknown as WebGLRenderer;
  const mood = new Mood(renderer, new Scene(), new PerspectiveCamera(), graphics.graphics[0]!);
  mood.externalGpuTiming = true;
  mood.setNightVision({
    gain: 2,
    tint: '#00ff00',
    grain: 0,
    edge: { darkening: 1, inner: 0.2, outer: 0.4 },
    flare: { strength: 1, distanceMetres: 1, blastIntensity: 1, recoverRealSeconds: realSeconds(1), haloRadius: 0.1 },
  });
  const composersBefore = owner.composers.length;

  mood.render(() => undefined);

  expect(mood.post).toBe(false);
  expect(owner.composers.length).toBe(composersBefore + 1);
  expect(owner.composers.at(-1)!.render).toHaveBeenCalled();
  expect(renderer.render).not.toHaveBeenCalled();
});

it('abandons lost-context post targets without deleting dead handles and rebuilds them for rendering', () => {
  const canvas = new EventTarget();
  const renderer = {
    domElement: canvas,
    getPixelRatio: () => 1,
    toneMapping: NeutralToneMapping,
    toneMappingExposure: 1,
  } as unknown as WebGLRenderer;
  const policy = graphics.graphics[0]!;
  const mood = new Mood(renderer, new Scene(), new PerspectiveCamera(), policy);
  mood.externalGpuTiming = true;
  mood.setPost(true);
  mood.render(() => undefined);
  const old = owner.composers.at(-1)!;
  old.setPixelRatio.mockClear();
  canvas.dispatchEvent(new Event('webglcontextlost'));
  expect(old.dispose).not.toHaveBeenCalled();
  mood.setRenderScale(policy.renderScale.min);
  expect(old.setPixelRatio).not.toHaveBeenCalled();
  mood.render(() => undefined);
  expect(owner.composers.at(-1)).toBe(old);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  mood.render(() => undefined);
  const rebuilt = owner.composers.at(-1)!;
  expect(rebuilt).not.toBe(old);
  expect(rebuilt.setPixelRatio).toHaveBeenCalledWith(renderer.getPixelRatio() * mood.renderScale);
});
