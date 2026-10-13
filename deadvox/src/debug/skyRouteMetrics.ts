import type { Vec3 } from '../core/coords.ts';
import type { Skylight } from '../render/skylight.ts';

export const SKY_ROUTE = { start: 430, end: 490, z: 523 };
export type SkyRoutePhase = 'cold' | 'warm';
export interface SkyRouteField {
  index: number;
  complete: boolean;
  current: boolean;
  resident: boolean;
}
export interface SkyRouteFrame {
  phase: SkyRoutePhase;
  realMs: number;
  intervalRealMs: number | null;
  frameRealMs: number;
  serviceRealMs: number;
  textureRealMs: number;
  uniformRealMs: number;
  programRealMs: number;
  lightingRealMs: number;
  position: Vec3;
  estimate: number;
  eligible: SkyRouteField[];
  stats: Skylight['stats'];
}
export interface SkyRouteJob {
  phase: SkyRoutePhase;
  bounds: { min: Vec3; max: Vec3 };
  requestedRealMs: number;
  dispatchRealMs: number | null;
  workerRealMs: number | null;
  latencyRealMs: number | null;
  resultComplete: boolean | null;
}
function percentile(values: number[], fraction: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.ceil(sorted.length * fraction) - 1]! : null;
}
function summarizeSkyFrames(frames: SkyRouteFrame[]) {
  const intervals = frames.flatMap((frame) => (frame.intervalRealMs === null ? [] : [frame.intervalRealMs]));
  const lighting = frames.map((frame) => frame.lightingRealMs);
  const elapsed = intervals.reduce((sum, value) => sum + value, 0);
  const over18 = intervals.filter((value) => value > 18).length;
  return {
    frameDenominator: frames.length,
    frameGapDenominator: intervals.length,
    serviceP99RealMs: percentile(
      frames.map((frame) => frame.serviceRealMs),
      0.99,
    ),
    lightingP99RealMs: percentile(lighting, 0.99),
    lightingMaxRealMs: lighting.length > 0 ? Math.max(...lighting) : null,
    lightingOver2Count: lighting.filter((value) => value > 2).length,
    sceneFps: elapsed > 0 ? (intervals.length * 1000) / elapsed : null,
    framesOver18Count: over18,
    framesOver18Percent: intervals.length > 0 ? (100 * over18) / intervals.length : null,
    eligibleFrames: frames.filter((frame) => frame.eligible.length > 0).length,
    unknownHeightFrames: frames.filter((frame) => frame.eligible.some((field) => !field.complete)).length,
    nonresidentFrames: frames.filter((frame) => frame.eligible.some((field) => field.complete && !field.resident))
      .length,
    staleDisplayFrames: frames.filter((frame) => frame.eligible.some((field) => field.complete && !field.current))
      .length,
    initialStats: frames[0]?.stats,
    finalStats: frames.at(-1)?.stats,
  };
}
interface Episode {
  phase: SkyRoutePhase;
  index: number;
  startRealMs: number;
  elapsedRealMs: number;
  end: 'ready' | 'left-region' | 'route-ended';
}
export function pendingSkyEpisodes(frames: SkyRouteFrame[], pendingState: (field: SkyRouteField) => boolean) {
  const open = new Map<string, Omit<Episode, 'elapsedRealMs' | 'end'>>();
  const episodes: Episode[] = [];
  for (const frame of frames) {
    const seen = new Set<string>();
    for (const field of frame.eligible) {
      const key = `${frame.phase}:${field.index}`;
      seen.add(key);
      if (pendingState(field) && !open.has(key)) {
        open.set(key, { phase: frame.phase, index: field.index, startRealMs: frame.realMs });
      }
      if (!pendingState(field) && open.has(key)) {
        const pending = open.get(key)!;
        episodes.push({ ...pending, elapsedRealMs: frame.realMs - pending.startRealMs, end: 'ready' });
        open.delete(key);
      }
    }
    const left = [...open].filter(([key]) => !seen.has(key));
    for (const [key, pending] of left) {
      episodes.push({ ...pending, elapsedRealMs: frame.realMs - pending.startRealMs, end: 'left-region' });
      open.delete(key);
    }
  }
  for (const pending of open.values()) {
    episodes.push({ ...pending, elapsedRealMs: frames.at(-1)!.realMs - pending.startRealMs, end: 'route-ended' });
  }
  const resolved = episodes.filter((episode) => episode.end === 'ready').map((episode) => episode.elapsedRealMs);
  return {
    denominator: episodes.length,
    resolvedDenominator: resolved.length,
    censoredDenominator: episodes.length - resolved.length,
    resolvedP99RealMs: percentile(resolved, 0.99),
    episodes,
  };
}
export function skyRouteSummary(frames: SkyRouteFrame[], jobs: SkyRouteJob[]) {
  const phases = ['cold', 'warm'] as const;
  const phaseFrames = (phase: SkyRoutePhase) => frames.filter((frame) => frame.phase === phase);
  return {
    cold: summarizeSkyFrames(phaseFrames('cold')),
    warm: summarizeSkyFrames(phaseFrames('warm')),
    fallback: Object.fromEntries(
      phases.map((phase) => [phase, pendingSkyEpisodes(phaseFrames(phase), (field) => !field.complete)]),
    ),
    revalidation: Object.fromEntries(
      phases.map((phase) => [
        phase,
        pendingSkyEpisodes(phaseFrames(phase), (field) => field.complete && !field.current),
      ]),
    ),
    jobDenominator: jobs.length,
    completedJobDenominator: jobs.filter((job) => job.latencyRealMs !== null).length,
    censoredJobDenominator: jobs.filter((job) => job.latencyRealMs === null).length,
    workerP99RealMs: percentile(
      jobs.flatMap((job) => (job.workerRealMs === null ? [] : [job.workerRealMs])),
      0.99,
    ),
    arrivalP99RealMs: percentile(
      jobs.flatMap((job) => (job.latencyRealMs === null ? [] : [job.latencyRealMs])),
      0.99,
    ),
  };
}
