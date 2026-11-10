import type { NightVision } from '@skelly/engine/content';
import { realSeconds } from '@skelly/engine/sim';
import type { Sky } from '@skelly/engine/sky';
import { Mood } from '@skelly/presentation/render';
import {
  Color,
  Fog,
  NeutralToneMapping,
  NoToneMapping,
  type Object3D,
  PerspectiveCamera,
  Scene,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import type { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { expect, it, vi } from 'vitest';
import graphics from '../../mods/skelly.graphics/graphics.json' with { type: 'json' };

const owner = vi.hoisted(() => ({
  composers: [] as {
    passes: unknown[];
    readBuffer: object;
    dispose: ReturnType<typeof vi.fn>;
    setPixelRatio: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  }[],
  /** Runs inside each composer render, while the chain's per-frame colours are in place. */
  onRender: undefined as (() => void) | undefined,
}));
vi.mock('three/addons/postprocessing/EffectComposer.js', () => {
  class EffectComposer {
    passes: { dispose: () => void }[] = [];
    readBuffer = {};
    dispose = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn(() => owner.onRender?.());
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

const GOGGLES: NightVision = {
  gain: 2,
  tint: '#00ff00',
  grain: 0,
  edge: { darkening: 1, inner: 0.2, outer: 0.4 },
  flare: { strength: 1, distanceMetres: 1, blastIntensity: 1, recoverRealSeconds: realSeconds(1), haloRadius: 0.1 },
};

const fakeRenderer = (toneMapping: ToneMapping, toneMappingExposure: number) =>
  ({
    domElement: new EventTarget(),
    getPixelRatio: () => 1,
    toneMapping,
    toneMappingExposure,
    render: vi.fn(),
  }) as unknown as WebGLRenderer;

/** A mood with the goggles on and the look's post off, as play starts. */
const gogglesMood = (renderer: WebGLRenderer, scene = new Scene()) => {
  const mood = new Mood(renderer, scene, new PerspectiveCamera(), graphics.graphics[0]!);
  mood.externalGpuTiming = true;
  mood.setNightVision(GOGGLES);
  return mood;
};

it('undoes exposure on the sky in the chain only for a tone mapper that applies it', () => {
  const sky = new Color(0.1, 0.2, 0.3);
  const skyInChain = (toneMapping: ToneMapping, exposure: number): Color => {
    const scene = new Scene();
    scene.fog = new Fog(sky.clone(), 1, 2);
    scene.background = scene.fog.color;
    const mood = gogglesMood(fakeRenderer(toneMapping, exposure), scene);
    let seen: Color | undefined;
    owner.onRender = () => {
      seen = (scene.background as Color).clone();
    };
    mood.render(() => undefined);
    owner.onRender = undefined;
    return seen!;
  };

  // With no tone mapper nothing applies exposure, so the chain's sky is the direct path's at any exposure.
  for (const exposure of [1, 0.2, 3]) {
    expect(skyInChain(NoToneMapping, exposure).equals(sky)).toBe(true);
  }
  expect(skyInChain(NeutralToneMapping, 0.5).r).toBeGreaterThan(sky.r);
});

it("shows only the goggles' view in a chain run for them while the look's post is off", () => {
  const mood = gogglesMood(fakeRenderer(NeutralToneMapping, 1));
  mood.restore({ post: false, bloom: true, film: true, grade: 1, bloomClip: null });
  mood.setSky({ tone: 0.5, heightFogColor: [0, 0, 0], bloom: 1, heightFog: 0 } as unknown as Sky);
  mood.setPainDesaturation(1);
  mood.setDrugVignette(1);

  mood.render(() => undefined);

  const passes = owner.composers.at(-1)!.passes as unknown[];
  const bloom = passes.find((pass) => pass instanceof UnrealBloomPass)!;
  const output = passes.find((pass): pass is OutputPass => (pass as OutputPass).uniforms?.uGradeEnabled !== undefined)!;
  const u = output.uniforms;
  expect(u.uNightVision!.value).toBe(1);
  expect(bloom.enabled).toBe(false);
  expect(u.uGradeEnabled!.value).toBe(0);
  expect(u.uVignette!.value).toBe(0);
  expect(u.uGrain!.value).toBe(0);
  expect(u.uDrugVignette!.value).toBe(0);
});

it.each([false, true])(
  'warms each scene for both the direct screen path and the post chain with post %s',
  async (post) => {
    let target: unknown = null;
    const compiled: [Object3D, unknown][] = [];
    const renderer = {
      ...fakeRenderer(NeutralToneMapping, 1),
      getRenderTarget: () => target,
      setRenderTarget: (into: unknown) => {
        target = into;
      },
      compileAsync: vi.fn((root: Object3D) => {
        compiled.push([root, target]);
        return Promise.resolve();
      }),
    } as unknown as WebGLRenderer;
    const scene = new Scene();
    const mood = new Mood(renderer, scene, new PerspectiveCamera(), graphics.graphics[0]!);
    mood.externalGpuTiming = true;
    mood.setPost(post);

    await mood.warmUp([{ scene, camera: new PerspectiveCamera() }]);

    const chain = owner.composers.at(-1)!.readBuffer;
    const targets = compiled.filter(([root]) => root === scene).map(([, into]) => into);
    expect(targets).toContain(null);
    expect(targets).toContain(chain);
    expect(target).toBeNull();
  },
);

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
