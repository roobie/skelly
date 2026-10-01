// Records the current look (tone mapping, exposure, colour decode, mood pass, fogginess, game time) with where
// and on what build it was seen, as a JSON file the operator can keep next to a screenshot.

import type { Vec3 } from '../core/coords.ts';
import type { MoodState, ShadowState } from '../core/mood.ts';
import type { FrameSummary } from '../render/frameTimes.ts';
import { camValue } from './camUrl.ts';

// `vite.config.ts` supplies it; outside a Vite build (tests) it isn't defined.
declare const __DEADVOX_BUILD_REVISION__: string;

export const buildRevision = (): string => {
  try {
    return __DEADVOX_BUILD_REVISION__;
  } catch {
    return 'unavailable';
  }
};

export interface LookDumpInput {
  toneMapping: string;
  exposure: number;
  srgbBlockColours: boolean;
  surfacePatterns: boolean;
  /** The mood pass: post master, bloom, film (vignette and grain), grade strength. */
  mood: MoodState;
  /** The weather's fogginess: 0 clear, 1 thick fog. */
  fogginess: number;
  /** Sun and flashlight shadows, and the sun's shadow distance. */
  shadows: ShadowState;
  /** The readout's last numbers, so a screenshot's cost comes with it: smoothed fps, frame interval and CPU work. */
  performance: { fps: number; frame: FrameSummary; work: FrameSummary };
  /** The game clock, "Day N, HH:MM". */
  gameTime: string;
  site: string;
  seed: number;
  viewRadiusM: number;
  blockSizeM: number;
  /** Feet position in metres. */
  positionM: Vec3;
  yawRad: number;
  pitchRad: number;
  /** Camera roll from damage feedback; 0 normally. */
  rollRad: number;
  buildRevision: string;
  /** The page URL with the look parameters set, which reproduces this look when opened. */
  url: string;
  now: Date;
}

const round = (value: number, places: number): number => Number(value.toFixed(places));

/** The settings as the JSON-ready object that gets saved. */
export const lookDump = (input: LookDumpInput) => ({
  timestamp: input.now.toISOString(),
  buildRevision: input.buildRevision,
  url: input.url,
  look: {
    toneMapping: input.toneMapping,
    exposure: round(input.exposure, 2),
    srgbBlockColours: input.srgbBlockColours,
    surfacePatterns: input.surfacePatterns,
    postProcessing: input.mood.post,
    bloom: input.mood.bloom,
    film: input.mood.film,
    gradeStrength: round(input.mood.grade, 2),
    fogginess: round(input.fogginess, 2),
    shadows: {
      sun: input.shadows.sun,
      flashlight: input.shadows.torch,
      distanceM: input.shadows.distance,
    },
    gameTime: input.gameTime,
  },
  performance: {
    fps: round(input.performance.fps, 0),
    frameMs: { p50: round(input.performance.frame.p50, 1), p95: round(input.performance.frame.p95, 1) },
    cpuMs: { p50: round(input.performance.work.p50, 1), p95: round(input.performance.work.p95, 1) },
  },
  world: {
    site: input.site,
    seed: input.seed,
    viewRadiusM: input.viewRadiusM,
    blockSizeM: input.blockSizeM,
  },
  player: {
    positionM: input.positionM.map((v) => round(v, 2)),
    yawRad: round(input.yawRad, 3),
    pitchRad: round(input.pitchRad, 3),
    /** The `?cam=` value that returns to this view (camUrl.ts). */
    cam: camValue({ position: input.positionM, yaw: input.yawRad, pitch: input.pitchRad, roll: input.rollRad }),
  },
});

/** `deadvox-look-YYYYMMDD-HHMMSS.json`, in the operator's local time. */
export const lookDumpFilename = (now: Date): string => {
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `deadvox-look-${date}-${time}.json`;
};
