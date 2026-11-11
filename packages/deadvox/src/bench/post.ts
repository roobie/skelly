import { requireDayCycle } from '@skelly/engine/content';
import { AUTO_TONE, DEFAULT_SHADOWS, type LookState, lookDefaultsOf, type MoodState } from '@skelly/engine/look';
import type { GameConfig } from '@skelly/engine/session';
import { skyAt, skyInWeather, sunShadowStrength } from '@skelly/engine/sky';
import type { RenderedEngine } from '@skelly/presentation/play';
import { applyLook, setHeightFogTuning } from '@skelly/presentation/render';

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
  config.weathering = profile ? { ...profile } : undefined;
};

/** Scene counters before post-processing overwrites renderer.info. */
interface BenchSceneRenderStats {
  readonly calls: number;
  readonly triangles: number;
}

export interface BenchDrawOptions {
  readonly post: boolean;
  readonly skyAngle: number;
  readonly reportSceneRender?: (stats: BenchSceneRenderStats) => void;
}

/** Renderer counters sampled immediately after the scene pass, before post-processing overwrites them. */
export const benchDraw = (engine: RenderedEngine, options: BenchDrawOptions): (() => void) => {
  const { post, reportSceneRender } = options;
  const { renderer, scene, camera, mood, shadows } = engine;
  const defaults = lookDefaultsOf(engine.registry);
  setHeightFogTuning(defaults.heightFog);
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
  shadows.restore(DEFAULT_SHADOWS);
  const dayCycle = requireDayCycle(engine.registry);
  const sky = skyInWeather(
    skyAt(options.skyAngle, dayCycle),
    dayCycle.weather.defaults,
    dayCycle.weather,
  );
  mood.setSky(sky);
  const sunStrength = sunShadowStrength(sky.lightIntensity);
  return () => {
    camera.updateMatrixWorld();
    shadows.update(sunStrength, camera.position);
    mood.render(report);
  };
};
