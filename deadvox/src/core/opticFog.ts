// Spike (d172): the scope's zoom pass sees past the main view's daylight fog, out to just short of
// the meshed world's edge. The main view's distance fog stands in for three things at once: draw
// distance, darkness and weather. Only the draw-distance part lifts, because a scope magnifies but
// doesn't see through night or fog. The height mist (render/heightFog.ts) is weather and is never lifted.

import { DAYLIGHT_FOG_FAR, TWILIGHT_FOG_FAR } from './sky.ts';
import { DEFAULT_FOGGINESS } from './weather.ts';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * How much of the lift applies, in [0, 1]. Darkness: 1 in full daylight, falling to 0 as the
 * time-of-day fog end falls to twilight's. Weather: 1 up to the default light mist, falling to 0 in
 * thick fog. `timeOfDayFogFar` is the sky's fog end before the weather (core/sky.ts, `skyAt`).
 */
export const scopeFogLiftWeight = (timeOfDayFogFar: number, fogginess: number): number => {
  const daylight = clamp01((timeOfDayFogFar - TWILIGHT_FOG_FAR) / (DAYLIGHT_FOG_FAR - TWILIGHT_FOG_FAR));
  const clear = clamp01((1 - fogginess) / (1 - DEFAULT_FOGGINESS));
  return daylight * clear;
};

/** The square of meshed chunk columns around the streamer's centre (game/streamer.ts). */
export interface MeshedSquare {
  /** The centre column, in chunks (x, z). */
  centre: readonly [number, number];
  /** Meshes reach this many chunks from the centre on each axis. */
  radiusChunks: number;
  chunkMetres: number;
}

/** Horizontal distance in metres from `eye` along the unit direction `dir` (both x, z) to the square's edge. */
export const distanceToMeshedEdge = (
  eye: readonly [number, number],
  dir: readonly [number, number],
  { centre, radiusChunks, chunkMetres }: MeshedSquare,
): number => {
  let t = Number.POSITIVE_INFINITY;
  for (const axis of [0, 1] as const) {
    const low = (centre[axis] - radiusChunks) * chunkMetres;
    const high = (centre[axis] + radiusChunks + 1) * chunkMetres;
    const d = dir[axis];
    if (d > 0) {
      t = Math.min(t, (high - eye[axis]) / d);
    } else if (d < 0) {
      t = Math.min(t, (low - eye[axis]) / d);
    }
  }
  return Math.max(0, t);
};

/** Metres the lifted fog end keeps inside the meshed edge, so the edge never shows. */
const EDGE_MARGIN_M = 2;

/**
 * The deepest far plane at which the whole zoom frustum stays over meshed chunks. `corners` are the
 * frustum's four corner rays per metre of depth, reduced to their horizontal (x, z) parts. The meshed
 * region is a vertical prism and the frustum is convex, so it stays inside exactly when its far
 * corners do.
 */
export const scopeEdgeDepth = (
  eye: readonly [number, number],
  corners: readonly (readonly [number, number])[],
  square: MeshedSquare,
): number => {
  let depth = Number.POSITIVE_INFINITY;
  for (const [x, z] of corners) {
    const reach = Math.hypot(x, z);
    if (reach > 0) {
      depth = Math.min(depth, distanceToMeshedEdge(eye, [x / reach, z / reach], square) / reach);
    }
  }
  return depth - EDGE_MARGIN_M;
};

export interface ScopeFog {
  near: number;
  far: number;
}

/**
 * The zoom pass's fog: the main view's, with its end moved `weight` of the way out to `edgeDepth`
 * and its start scaled with it. It never comes in closer than the main view's.
 */
export const liftedScopeFog = (main: ScopeFog, edgeDepth: number, weight: number): ScopeFog => {
  const reach = Number.isFinite(edgeDepth) ? Math.max(0, edgeDepth - main.far) : 0;
  const far = main.far + clamp01(weight) * reach;
  return { near: main.near * (far / main.far), far };
};
