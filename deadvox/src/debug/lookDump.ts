// Records the current look (tone mapping, exposure, colour decode, game time) with where
// and on what build it was seen, as a JSON file the operator can keep next to a screenshot.

import type { Vec3 } from '../core/coords.ts';

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
    gameTime: input.gameTime,
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
  },
});

/** `deadvox-look-YYYYMMDD-HHMMSS.json`, in the operator's local time. */
export const lookDumpFilename = (now: Date): string => {
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `deadvox-look-${date}-${time}.json`;
};
