// Entry point. `?bench=1` runs the milestone 1.0 benchmark, `?bench=report` shows its
// results; otherwise the game starts (`?radius=` in metres, `?seed=`).

import { loadRecord } from './bench/plan.ts';
import { applyBenchWeathering } from './bench/post.ts';
import { showReport } from './bench/report.ts';
import { benchRunFromUrl, currentConfig, startBench } from './bench/run.ts';
import { shamblerRunFromUrl, startShamblerBench } from './bench/shamblers.ts';
import assetManifest from './content/base/assets/manifest.json' with { type: 'json' };
import { validateManifest } from './core/assets.ts';
import { getBuildRevision } from './core/buildInfo.ts';
import { parseTimeOfDay } from './core/clock.ts';
import { CORE_CONTENT_IDS } from './core/contentIds.ts';
import { bundledModIdsFromUrl, selectBundledMods } from './game/bundledMods.ts';
import {
  applyWeatheringConfig,
  configFromUrl,
  DEFAULT_RADIUS_M,
  makeConfig,
  savingEnabledFromUrl,
  siteFromUrl,
} from './game/config.ts';
import { mountControlsCard } from './game/controls.ts';
import { createEngine } from './game/engine.ts';
import { requestInputLock } from './game/input.ts';
import { inputBindings, keyboardInput, labelForAction } from './game/inputBindings.ts';
import { clearPendingInputReplay, decodeInputReplay, pendingInputReplay } from './game/inputReplay.ts';
import { startPlay } from './game/play.ts';
import { renderFreeFromUrl } from './game/renderMode.ts';
import type { SaveBackendPreference } from './game/saveStorage.ts';
import type { StreamerStats } from './game/streamer.ts';
import { tutorialRequested, tutorialUrl } from './game/tutorialUrl.ts';
import { WorldLoading } from './game/worldLoading.ts';
import { mountCredits } from './ui/credits.ts';
import { installErrorReportHandler } from './ui/errorReport.ts';
import { mountFullscreenOptions } from './ui/fullscreenOptions.ts';
import { mountInputOptions } from './ui/inputOptions.ts';
import { chooseMods } from './ui/modsPanel.ts';
import { contentLookup, SaveController } from './ui/saveController.ts';
import { applyUiTokens } from './ui/uiTokens.ts';
import { mountWorldLoading } from './ui/worldLoading.ts';

document.getElementById('build-revision')!.textContent = `Build: ${getBuildRevision()}`;

const params = new URLSearchParams(location.search);
const view = document.getElementById('view')!;
const startupScreen = document.getElementById('startup-screen')!;
installErrorReportHandler();
const overlay = document.getElementById('overlay')!;
overlay.inert = true;
const modsScreen = document.getElementById('mods-screen')!;
const showMods = params.get('mods') === '1' && !params.has('bench');
if (showMods) {
  startupScreen.hidden = true;
  modsScreen.hidden = false;
}
const bundled = selectBundledMods(showMods ? [] : bundledModIdsFromUrl(params));
// The mods screen is drawn before any mod is chosen, so it reads the bundled packs' text.
const browserSelection = showMods
  ? await chooseMods(modsScreen, bundled.content.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.mods)
  : undefined;
const content = browserSelection?.content ?? bundled.content;
startupScreen.hidden = false;
applyUiTokens(content.registry, document.documentElement);
const { screenText } = content.registry.ui.get(CORE_CONTENT_IDS.coreUi)!;
inputBindings.setPointerLabels(screenText.pointerButtonLabels);
const saveStatus = document.getElementById('save-status')!;
const saveStatusHome = saveStatus.parentElement!;
const saveStatusNextSibling = saveStatus.nextSibling;
const restoreSaveStatus = () => {
  if (saveStatus.parentElement === startupScreen) {
    saveStatusHome.insertBefore(saveStatus, saveStatusNextSibling);
  }
};
const hideStartupScreen = () => {
  restoreSaveStatus();
  overlay.inert = false;
  startupScreen.hidden = true;
};
const showStartupFailure = (message: string) => {
  document.getElementById('errors')!.textContent = message;
  hideStartupScreen();
};
if (bundled.issues.length > 0) {
  showStartupFailure(bundled.issues.map((issue) => `${issue.source} ${issue.path}: ${issue.message}`).join('\n'));
  // Refused mods must not start a game with other content; stop the module here.
  await new Promise<never>(() => undefined);
}
const menuCard = document.querySelector<HTMLElement>('#overlay .card');
const scrollUpCue = document.getElementById('card-scroll-up');
const scrollDownCue = document.getElementById('card-scroll-down');
if (menuCard && scrollUpCue && scrollDownCue) {
  const updateScrollCues = () => {
    const overflows = menuCard.scrollHeight > menuCard.clientHeight + 1;
    scrollUpCue.hidden = !overflows || menuCard.scrollTop <= 1;
    scrollDownCue.hidden = !overflows || menuCard.scrollTop + menuCard.clientHeight >= menuCard.scrollHeight - 1;
  };
  menuCard.addEventListener('scroll', updateScrollCues, { passive: true });
  window.addEventListener('resize', updateScrollCues);
  new ResizeObserver(updateScrollCues).observe(menuCard);
  new MutationObserver(updateScrollCues).observe(menuCard, { attributes: true, childList: true, subtree: true });
  updateScrollCues();
}
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
if (bench === null) {
  const credits = validateManifest('assets/manifest.json', assetManifest);
  document.getElementById('errors')!.textContent = credits.issues
    .map((issue) => `${issue.source} ${issue.path}: ${issue.message}`)
    .join('\n');
  mountCredits(
    {
      about: document.getElementById('about')!,
      box: document.getElementById('credits')!,
      show: document.getElementById('show-credits')!,
    },
    credits.manifest,
    screenText.credits,
  );
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-view-distance]')) {
    const radius = link.dataset.viewDistance;
    if (radius) {
      const target = new URL(location.href);
      target.searchParams.set('radius', radius);
      link.href = target.href;
    }
  }
}

if (bench !== null) {
  hideStartupScreen();
}
if (bench === 'report') {
  document.body.classList.add('bench');
  showReport(document.querySelector<HTMLElement>('#overlay .card')!, loadRecord());
} else if (bench === null) {
  keyboardInput.install();
  inputBindings.loadLayout();
  let config = configFromUrl(params, content);
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
  if (config.debug) {
    inputBindings.setDebugRun();
  }
  mountFullscreenOptions(document.getElementById('fullscreen-options')!, screenText.options);
  mountInputOptions(document.getElementById('input-options')!, screenText.inputOptions, config.debug);
  mountControlsCard(
    document.getElementById('controls')!,
    document.getElementById('controls-search') as HTMLInputElement,
    () => config.debug,
  );
  const debugModule = config.debug ? await import('./debug/index.ts') : undefined;
  const skyRoute = params.get('skyRoute') === '1' ? await debugModule?.loadSkyRoute() : undefined;
  if (pendingReplay) {
    try {
      const preliminary = await decodeInputReplay(pendingReplay, { contentLookup: () => true });
      const identity = preliminary.worldOptions;
      const replayConfig = makeConfig(identity.seed, config.radiusM, content, identity.blockSize);
      replayConfig.start = identity.clock.start;
      replayConfig.debug = true;
      replayConfig.actors = config.actors;
      replayConfig.site = identity.site;
      replayConfig.storeys = identity.storeys;
      replayConfig.density = identity.density;
      applyWeatheringConfig(replayConfig, params);
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
      hideStartupScreen();
    } catch (error) {
      clearPendingInputReplay();
      showStartupFailure(`Replay rejected: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (tutorialRequested(params)) {
    const practiceParams = new URLSearchParams(new URL(tutorialUrl(location.href, true)).search);
    practiceParams.set('site', 'tutorial');
    const practiceConfig = configFromUrl(practiceParams, content);
    const engine = createEngine(practiceConfig, view, undefined, { render: !renderFree });
    startPlay(engine, undefined, { tutorial: true });
    document.getElementById('new-character-options')!.hidden = true;
    document.getElementById('tutorial-start')!.hidden = true;
    document.getElementById('save-status')!.textContent = 'Unsaved practice';
    hideStartupScreen();
  } else {
    document.getElementById('tutorial-start')!.addEventListener('click', (event) => {
      event.stopPropagation();
      location.assign(tutorialUrl(location.href, true));
    });
    const saveBackend = params.get('save-backend');
    const backend: SaveBackendPreference = saveBackend === 'opfs' || saveBackend === 'indexeddb' ? saveBackend : 'auto';
    const saveController = new SaveController(
      screenText,
      { backend, savingEnabled: savingEnabledFromUrl(params) },
      bundled.admitted,
      browserSelection?.admitted,
    );
    startupScreen.append(saveStatus);
    if (params.get('save-test') === '1') {
      Object.assign(globalThis, {
        deadvoxSaveTest: {
          storage: saveController.storage,
          get namespace() {
            return saveController.namespace;
          },
          controller: saveController,
          saveState: () => {
            const { savedGeneration, failure } = saveController as unknown as {
              savedGeneration: number;
              failure: string;
            };
            return { savedGeneration, failure };
          },
          triggerPeriodicCheckpoint: () => {
            (saveController as unknown as { checkpoints: { nextAt: number } }).checkpoints.nextAt = 0;
            saveController.afterFrame();
          },
        },
      });
    }
    const savedWorld = await saveController.prepare();
    if (savedWorld) {
      const resumed = makeConfig(savedWorld.seed, config.radiusM, content, savedWorld.blockSize);
      resumed.start = savedWorld.clock.start;
      resumed.debug = config.debug;
      resumed.actors = config.actors;
      resumed.site = savedWorld.site;
      resumed.storeys = savedWorld.storeys;
      resumed.density = savedWorld.density;
      applyWeatheringConfig(resumed, params);
      config = resumed;
    }
    const engine = createEngine(config, view, undefined, { render: !renderFree });
    const restored = await saveController.validateContent(engine.registry);
    if (saveController.isRestored && restored) {
      startPlay(engine, debugModule, { saveController, restore: restored, ...(skyRoute ? { skyRoute } : {}) });
      hideStartupScreen();
    } else {
      saveController.setNewWorldLauncher(async (creation) => {
        // Capture transient activation before setup, then return the gesture handler before doing expensive work.
        const target = engine.renderer?.domElement ?? view;
        const locked = requestInputLock(target);
        const owner = new WorldLoading(engine);
        const draw = mountWorldLoading(owner, screenText.worldLoading);
        await locked;
        await new Promise<void>((done) => setTimeout(done, 0));
        let entry: ReturnType<typeof startPlay>;
        try {
          entry = startPlay(engine, debugModule, {
            saveController,
            loading: { owner, draw },
            ...creation,
            ...(skyRoute ? { skyRoute } : {}),
          });
        } catch (error) {
          owner.fail(error);
          draw();
          if (document.pointerLockElement === target) {
            document.exitPointerLock();
          }
          throw error;
        }
        return {
          enter: () => {
            overlay.classList.remove('startup-ready');
            entry.enter();
          },
        };
      });
      saveController.setNewWorldGoLabel(screenText.save.newWorld);
      overlay.classList.add('startup-ready');
      hideStartupScreen();
    }
  }
} else if (bench === 'shamblers') {
  const run = shamblerRunFromUrl(params);
  if (run) {
    const config = makeConfig(run.seed, DEFAULT_RADIUS_M, content);
    config.site = 'forest';
    config.start = parseTimeOfDay(run.time)!;
    applyBenchWeathering(config);
    startShamblerBench(createEngine(config, view, undefined, { graphicsSource: 'mod' }), run);
  } else {
    document.getElementById('hud')!.textContent =
      'Invalid shambler benchmark parameters. Use n as unique positive integers up to 500, seed as a signed 32-bit integer, and time as HH:MM (default 23:30).';
  }
} else {
  const run = benchRunFromUrl(params, content.registry);
  const { blockSize, radiusM } = currentConfig(run);
  const stats: StreamerStats = { genMs: [], meshMs: [], triangles: [] };
  const config = makeConfig(Number(params.get('seed') ?? 1) | 0, radiusM, content, blockSize);
  // The test house is defined in metres, so it compares across block sizes; `&site=city` benchmarks the city.
  Object.assign(config, siteFromUrl(params, 'testHouse', content.registry));
  applyBenchWeathering(config);
  startBench(createEngine(config, view, stats, { graphicsSource: 'mod' }), run, stats);
}
