// Opt-in: the benchmarks render through the game's mood pass (bloom, grade, film, height fog, shadows) with
// a fixed look, so frame times with and without post-processing can be compared. `&post=1` on a bench URL
// turns it on; without it the benchmarks draw with `renderer.render` and three.js's own defaults, as they
// always did, so older results still compare. The flag is carried from run to run by each bench's nextUrl.
// Its URL parameter is read here, not in run.ts or shamblers.ts, because the site launcher offers only the
// parameters those read (test/site-launcher.test.mjs); this is a benchmark option, like the debug look
// parameters, not something to launch from the site page.

import { requireDayCycle } from '../core/content.ts';
import { AUTO_TONE, DEFAULT_SHADOWS, type LookState, type MoodState } from '../core/mood.ts';
import { skyAt, sunShadowStrength } from '../core/sky.ts';
import { skyInWeather } from '../core/weather.ts';
import type { GameConfig } from '../game/config.ts';
import type { RenderedEngine } from '../game/engine.ts';
import { applyLook } from '../render/look.ts';

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

/**
 * What a bench calls instead of `renderer.render(scene, camera)` each frame. With `post` it applies the
 * bench look once and returns a draw through the mood pass at `hour` (no weather beyond the default
 * fogginess, no held items); without, the plain render. The distance fog and far plane stay the bench's own.
 * The optional callback samples scene counters before post-processing overwrites renderer.info.
 */
interface BenchSceneRenderStats {
  readonly calls: number;
  readonly triangles: number;
}

export interface BenchDrawOptions {
  readonly post: boolean;
  readonly nightVision: boolean;
  readonly skyAngle: number;
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
  if (!post) {
    return () => {
      renderer.render(scene, camera);
      report();
    };
  }
  applyLook(renderer, engine.meshes, BENCH_LOOK);
  mood.restore(BENCH_MOOD);
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
  return () => {
    shadows.update(sunStrength, camera.position);
    mood.render(report);
  };
};
