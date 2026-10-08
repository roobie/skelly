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
import { inputBindings, keyboardInput, labelForAction } from './game/inputBindings.ts';
import { clearPendingInputReplay, decodeInputReplay, pendingInputReplay } from './game/inputReplay.ts';
import { startPlay } from './game/play.ts';
import { renderFreeFromUrl } from './game/renderMode.ts';
import type { SaveBackendPreference } from './game/saveStorage.ts';
import type { StreamerStats } from './game/streamer.ts';
import { mountInputOptions } from './ui/inputOptions.ts';
import { contentLookup, SaveController } from './ui/saveController.ts';

const params = new URLSearchParams(location.search);
const view = document.getElementById('view')!;
const menuKeyLabel = document.querySelector<HTMLElement>('[data-key-binding="mainMenu"]');
const drawMenuLabel = () => {
  if (menuKeyLabel) {
    menuKeyLabel.textContent = labelForAction('ui.main-menu-toggle');
    menuKeyLabel.dataset.code = inputBindings.chords('ui.main-menu-toggle')[0]!.code;
  }
};
inputBindings.subscribe(drawMenuLabel);
drawMenuLabel();
const bench = params.get('bench');
const renderFree = renderFreeFromUrl(params, import.meta.env.DEV);

if (bench === 'report') {
  document.body.classList.add('bench');
  showReport(document.querySelector<HTMLElement>('#overlay .card')!, loadRecord());
} else if (bench === null) {
  mountControlsCard(document.getElementById('controls')!);
  mountInputOptions(document.getElementById('input-options')!);
  keyboardInput.install();
  inputBindings.loadLayout();
  let config = configFromUrl(params);
  keyboardInput.context = () => ({ context: 'title', debug: config.debug });
  let pendingReplay: Uint8Array | undefined;
  try {
    pendingReplay = pendingInputReplay();
  } catch (error) {
    clearPendingInputReplay();
    document.getElementById('errors')!.textContent =
      `Replay rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (pendingReplay) {
    config.debug = true;
  }
  const debugModule = config.debug ? await import('./debug/index.ts') : undefined;
  if (pendingReplay) {
    try {
      const preliminary = await decodeInputReplay(pendingReplay, { contentLookup: () => true });
      const identity = preliminary.worldOptions;
      const replayConfig = makeConfig(identity.seed, config.radiusM, identity.blockSize);
      replayConfig.start = identity.clock.start;
      replayConfig.debug = true;
      replayConfig.actors = config.actors;
      replayConfig.site = identity.site;
      replayConfig.storeys = identity.storeys;
      replayConfig.density = identity.density;
      const engine = createEngine(replayConfig, view, undefined, { render: !renderFree });
      const decoded = await decodeInputReplay(pendingReplay, {
        contentLookup: (kind, id) => contentLookup(engine.registry, kind, id),
      });
      clearPendingInputReplay();
      startPlay(engine, debugModule!, {
        restore: decoded.snapshot,
        replay: {
          inputs: decoded.inputs,
          startState: decoded.startState,
          endStateFingerprint: decoded.endStateFingerprint,
          endSimTimestamp: decoded.endSimTimestamp,
        },
      });
    } catch (error) {
      clearPendingInputReplay();
      document.getElementById('errors')!.textContent =
        `Replay rejected: ${error instanceof Error ? error.message : String(error)}`;
    }
  } else {
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
    const engine = createEngine(config, view, undefined, { render: !renderFree });
    const restored = await saveController.validateContent(engine.registry);
    if (saveController.isRestored && restored) {
      startPlay(engine, debugModule, { saveController, restore: restored });
    } else {
      saveController.setNewWorldLauncher((creation) => startPlay(engine, debugModule, { saveController, ...creation }));
    }
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
