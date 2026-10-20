// Browser-test wall bound only; never advances the simulation or changes its frame policy.
// play.ts caps a simulated frame at 100ms. Below 10fps, queued simulation seconds
// therefore take longer than wall seconds. Allow measured p95 pacing plus 50% headroom
// and two frames for admission/completion instead of a flat, generous deadline.
export const handlingWaitMilliseconds = (seconds: number, frameP95Milliseconds: number): number =>
  Math.ceil((Math.ceil(Math.max(0, seconds) / 0.1) + 2) * Math.max(100, frameP95Milliseconds) * 1.5);
