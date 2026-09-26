// Entry point. `?bench=1` runs the milestone 1.0 benchmark, `?bench=report` shows its
// results; otherwise the game starts (`?radius=` in metres, `?seed=`).

import { loadRecord } from './bench/plan.ts';
import { showReport } from './bench/report.ts';
import { benchRunFromUrl, currentConfig, startBench } from './bench/run.ts';
import { configFromUrl, makeConfig, siteFromUrl } from './game/config.ts';
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
  startPlay(createEngine(configFromUrl(params), view));
} else {
  const run = benchRunFromUrl(params);
  const { blockSize, radiusM } = currentConfig(run);
  const stats: StreamerStats = { genMs: [], meshMs: [], triangles: [] };
  const config = makeConfig(Number(params.get('seed') ?? 1) | 0, radiusM, blockSize);
  // The test house is defined in metres, so it compares across block sizes; `&site=city` benchmarks the city.
  Object.assign(config, siteFromUrl(params, 'testHouse'));
  startBench(createEngine(config, view, stats), run, stats);
}
