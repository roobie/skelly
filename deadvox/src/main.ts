// Entry point. `?bench=1` runs the milestone 1.0 benchmark, `?bench=report` shows its
// results; otherwise the game starts (`?radius=` in metres, `?seed=`).

import { loadRecord } from './bench/plan.ts';
import { showReport } from './bench/report.ts';
import { benchRunFromUrl, currentConfig, startBench } from './bench/run.ts';
import { shamblerRunFromUrl, startShamblerBench } from './bench/shamblers.ts';
import { parseTimeOfDay } from './core/clock.ts';
import { configFromUrl, DEFAULT_RADIUS_M, makeConfig, siteFromUrl } from './game/config.ts';
import { mountControlsCard } from './game/controls.ts';
import { createEngine } from './game/engine.ts';
import { KEY_BINDINGS } from './game/input.ts';
import { startPlay } from './game/play.ts';
import { renderFreeFromUrl } from './game/renderMode.ts';
import type { SaveBackendPreference } from './game/saveStorage.ts';
import type { StreamerStats } from './game/streamer.ts';
import { SaveController } from './ui/saveController.ts';

const params = new URLSearchParams(location.search);
const view = document.getElementById('view')!;
const menuKeyLabel = document.querySelector<HTMLElement>('[data-key-binding="mainMenu"]');
if (menuKeyLabel) {
  menuKeyLabel.textContent = KEY_BINDINGS.mainMenu.label;
  menuKeyLabel.dataset.code = KEY_BINDINGS.mainMenu.code;
}
const bench = params.get('bench');
const renderFree = renderFreeFromUrl(params, import.meta.env.DEV);

if (bench === 'report') {
  document.body.classList.add('bench');
  showReport(document.querySelector<HTMLElement>('#overlay .card')!, loadRecord());
} else if (bench === null) {
  mountControlsCard(document.getElementById('controls')!);
  let config = configFromUrl(params);
  const saveBackend = params.get('save-backend');
  const backend: SaveBackendPreference = saveBackend === 'opfs' || saveBackend === 'indexeddb' ? saveBackend : 'auto';
  const saveController = new SaveController(backend);
  const savedWorld = await saveController.prepare();
  if (params.get('save-test') === '1') {
    Object.assign(globalThis, {
      deadvoxSaveTest: {
        storage: saveController.storage,
        namespace: saveController.namespace,
        controller: saveController,
        triggerPeriodicCheckpoint: () => {
          (saveController as unknown as { nextAutosaveAt: number }).nextAutosaveAt = 0;
          saveController.afterFrame();
        },
      },
    });
  }
  if (savedWorld) {
    const resumed = makeConfig(savedWorld.seed, config.radiusM, savedWorld.blockSize);
    resumed.start = savedWorld.clock.start;
    resumed.debug = config.debug;
    resumed.actors = config.actors;
    resumed.site = savedWorld.site;
    resumed.storeys = savedWorld.storeys;
    resumed.density = savedWorld.density;
    config = resumed;
  }
  const debugModule = config.debug ? await import('./debug/index.ts') : undefined;
  const engine = createEngine(config, view, undefined, { render: !renderFree });
  const restored = await saveController.validateContent(engine.registry);
  if (saveController.isRestored && restored) {
    startPlay(engine, debugModule, { saveController, restore: restored });
  } else {
    saveController.setNewWorldLauncher((creation) => startPlay(engine, debugModule, { saveController, ...creation }));
  }
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
