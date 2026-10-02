// Opt-in: the benchmarks render through the game's mood pass (bloom, grade, film, height fog, shadows) with
// the default look, so frame times with and without post-processing can be compared. `&post=1` on a bench URL
// turns it on; without it the benchmarks draw with `renderer.render` and three.js's own defaults, as they
// always did, so older results still compare. The flag is carried from run to run by each bench's nextUrl.
// Its URL parameter is read here, not in run.ts or shamblers.ts, because the site launcher offers only the
// parameters those read (test/site-launcher.test.mjs); this is a benchmark option, like the debug look
// parameters, not something to launch from the site page.

import { DEFAULT_LOOK, DEFAULT_MOOD, DEFAULT_SHADOWS } from '../core/mood.ts';
import { skyAt, sunDirection, sunShadowStrength } from '../core/sky.ts';
import { DEFAULT_FOGGINESS, skyInWeather } from '../core/weather.ts';
import type { Engine } from '../game/engine.ts';
import { applyLook } from '../render/look.ts';

export const benchPostFromUrl = (params: URLSearchParams): boolean => params.get('post') === '1';

/** The URL fragment that keeps the flag on for the next run of a bench. */
export const postUrlPart = (post: boolean): string => (post ? '&post=1' : '');

/**
 * What a bench calls instead of `renderer.render(scene, camera)` each frame. With `post` it applies the
 * default look once and returns a draw through the mood pass at `hour` (no weather beyond the default
 * fogginess, no held items); without, the plain render. The distance fog and far plane stay the bench's own.
 * The optional callback samples scene counters before post-processing overwrites renderer.info.
 */
export interface BenchSceneRenderStats {
  readonly calls: number;
  readonly triangles: number;
}

/** Renderer counters sampled immediately after the scene pass, before post-processing overwrites them. */
export const benchDraw = (
  engine: Engine,
  post: boolean,
  hour: number,
  reportSceneRender?: (stats: BenchSceneRenderStats) => void,
): (() => void) => {
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
  applyLook(renderer, engine.meshes, DEFAULT_LOOK);
  mood.restore(DEFAULT_MOOD);
  shadows.restore(DEFAULT_SHADOWS);
  const sky = skyInWeather(skyAt(hour), { fogginess: DEFAULT_FOGGINESS });
  mood.setSky(sky);
  const sunStrength = sunShadowStrength(sunDirection(hour)[1], sky.lightIntensity);
  return () => {
    shadows.update(sunStrength, camera.position);
    mood.render(report);
  };
};
