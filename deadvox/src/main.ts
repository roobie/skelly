// Entry point. `?bench=1` runs the milestone 1.0 benchmark, `?bench=report` shows its
// results; otherwise the game starts (`?radius=` in metres, `?seed=`).

import { loadRecord } from './bench/plan.ts';
import { showReport } from './bench/report.ts';
import { benchRunFromUrl, currentConfig, startBench } from './bench/run.ts';
import { shamblerRunFromUrl, startShamblerBench } from './bench/shamblers.ts';
import { parseTimeOfDay } from './core/clock.ts';
import { configFromUrl, DEFAULT_RADIUS_M, makeConfig, siteFromUrl } from './game/config.ts';
import { createEngine } from './game/engine.ts';
import { startPlay } from './game/play.ts';
import type { StreamerStats } from './game/streamer.ts';

const params = new URLSearchParams(location.search);
const view = document.getElementById('view')!;
const bench = params.get('bench');

if (bench === 'report') {
  document.body.classList.add('bench');
  showReport(document.querySelector<HTMLElement>('#overlay .card')!, loadRecord());
} else if (bench === null) {
  const config = configFromUrl(params);
  const debugModule = config.debug ? await import('./debug/index.ts') : undefined;
  startPlay(createEngine(config, view), debugModule);
} else if (bench === 'shamblers') {
  const run = shamblerRunFromUrl(params);
  if (run) {
    const config = makeConfig(run.seed, DEFAULT_RADIUS_M);
    config.start = parseTimeOfDay(run.time)!;
    startShamblerBench(createEngine(config, view), run);
  } else {
    document.getElementById('hud')!.textContent =
      'Invalid shambler benchmark parameters. Use n as unique positive integers up to 500, seed as a signed 32-bit integer, and time as HH:MM (default 23:30).';
  }
} else {
  const run = benchRunFromUrl(params);
  const { blockSize, radiusM } = currentConfig(run);
  const stats: StreamerStats = { genMs: [], meshMs: [], triangles: [] };
  const config = makeConfig(Number(params.get('seed') ?? 1) | 0, radiusM, blockSize);
  // The test house is defined in metres, so it compares across block sizes; `&site=city` benchmarks the city.
  Object.assign(config, siteFromUrl(params, 'testHouse'));
  startBench(createEngine(config, view, stats), run, stats);
}
