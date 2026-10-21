import { requireDayCycle } from '../core/content.ts';
import { lookDefaultsOf } from '../core/lookDefaults.ts';
import { AUTO_TONE, DEFAULT_SHADOWS, type LookState, lookOf, type MoodState, moodOf } from '../core/mood.ts';
import { skyAt, sunShadowStrength } from '../core/sky.ts';
import { skyInWeather } from '../core/weather.ts';
import type { GameConfig } from '../game/config.ts';
import type { RenderedEngine } from '../game/engine.ts';
import type { LightPool } from '../render/lightPool.ts';
import { applyLook } from '../render/look.ts';
import { createNightVisionFlareUpdate } from '../render/nightVisionFlare.ts';

// The benchmark's own look, fixed so results stay comparable whatever the game's default look is: every
// effect on, which is the full cost of the mood pass.
const BENCH_LOOK: LookState = { tone: AUTO_TONE, exposure: 3, srgb: true, patterns: true, vao: true };
const BENCH_MOOD: MoodState = { post: true, bloom: true, film: true, grade: 1, bloomClip: null };

// The benchmark's own weathering, a content profile for the same reason: the play default's profile may change
// without changing what the benchmark measures.
const BENCH_WEATHERING_PROFILE_ID = 'bench';

/** Gives a bench config the bench weathering instead of the play default's. */
export const applyBenchWeathering = (config: GameConfig): void => {
  const profile = config.content.registry.weathering.get(BENCH_WEATHERING_PROFILE_ID);
  config.weatheringProfileId = BENCH_WEATHERING_PROFILE_ID;
  config.weatheringDefaultProfileId = BENCH_WEATHERING_PROFILE_ID;
  config.weathering = profile ? { ...profile } : undefined;
};

export const benchPostFromUrl = (params: URLSearchParams): boolean => params.get('post') === '1';

/** Enables the goggles' registry-authored night-vision view for a benchmark. */
export const benchNightVisionFromUrl = (params: URLSearchParams): boolean => params.get('nightVision') === '1';

/** The URL fragments that keep the post options on for the next run of a bench. */
export const postUrlPart = (post: boolean, nightVision = false): string =>
  `${post ? '&post=1' : ''}${nightVision ? '&nightVision=1' : ''}`;

/** Scene counters before post-processing overwrites renderer.info. */
interface BenchSceneRenderStats {
  readonly calls: number;
  readonly triangles: number;
}

export interface BenchDrawOptions {
  readonly post: boolean;
  readonly nightVision: boolean;
  readonly skyAngle: number;
  readonly playLook?: boolean;
  readonly lightPool?: LightPool;
  readonly reportSceneRender?: (stats: BenchSceneRenderStats) => void;
}

/** Renderer counters sampled immediately after the scene pass, before post-processing overwrites them. */
export const benchDraw = (engine: RenderedEngine, options: BenchDrawOptions): (() => void) => {
  const { post, nightVision, reportSceneRender } = options;
  const { renderer, scene, camera, mood, shadows } = engine;
  // renderer.info auto-resets on each WebGLRenderer.render. Mood invokes this from its DrawPass,
  // immediately after the scene RenderPass; reading after mood.render() would see only the final post pass.
  const report = (): void => {
    reportSceneRender?.({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  };
  if (!(post || nightVision || options.playLook)) {
    return () => {
      renderer.render(scene, camera);
      report();
    };
  }
  const defaults = lookDefaultsOf(engine.registry);
  applyLook(renderer, engine.meshes, post ? BENCH_LOOK : lookOf(defaults));
  mood.restore(post ? BENCH_MOOD : moodOf(defaults));
  const nightVisionView = engine.registry.items.get('night_vision_goggles')?.light?.nightVision;
  if (nightVision && !nightVisionView) {
    throw new Error('Missing benchmark night-vision goggles content');
  }
  mood.setNightVision(nightVision ? nightVisionView : undefined);
  shadows.restore(DEFAULT_SHADOWS);
  const dayCycle = requireDayCycle(engine.registry);
  const sky = skyInWeather(
    skyAt(options.skyAngle, dayCycle),
    { fogginess: dayCycle.weather.defaultFogginess },
    dayCycle.weather,
  );
  mood.setSky(sky);
  const sunStrength = sunShadowStrength(sky.lightIntensity);
  const updateFlare = options.lightPool
    ? createNightVisionFlareUpdate({
        mood,
        pool: options.lightPool,
        fireballs: () => [],
        camera,
        isSolid: engine.isSolid,
        blockSize: engine.config.scale.blockSize,
      })
    : undefined;
  let last = performance.now();
  return () => {
    const now = performance.now();
    camera.updateMatrixWorld();
    updateFlare?.(nightVision ? nightVisionView : undefined, (now - last) / 1000);
    last = now;
    shadows.update(sunStrength, camera.position);
    mood.render(report);
  };
};
