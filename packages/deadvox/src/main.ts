// Entry point. `?bench=1` runs the milestone 1.0 benchmark, `?bench=shamblers` the shambler benchmark and
// `?bench=report` shows their results; otherwise the game starts (hash `radius` in metres, `seed`).

import { clearPendingInputReplay, decodeInputReplay, pendingInputReplay } from '@skelly/engine/input';
import { claimed } from '@skelly/engine/inventory';
import {
  bundledModIdsFromUrl,
  getBuildRevision,
  practiceModId,
  selectBundledMods,
  startModFromUrl,
} from '@skelly/engine/packs';
import type { SaveBackendPreference } from '@skelly/engine/save';
import {
  applyWeatheringConfig,
  configFromUrl,
  DEFAULT_RADIUS_M,
  isPracticeStart,
  makeConfig,
  savingEnabledFromUrl,
} from '@skelly/engine/session';
import { countText, fillText } from '@skelly/engine/text';
import type { StreamerStats } from '@skelly/engine/world';
import {
  createEngine,
  fetchActorFigureFiles,
  renderFreeFromUrl,
  requestInputLock,
  startPlay,
  WorldLoading,
} from '@skelly/presentation/play';
import { tutorialUrl } from '@skelly/presentation/tutorialUrl';
import {
  applyUiTokens,
  chooseMods,
  contentLookup,
  installErrorReportHandler,
  mountControlsCard,
  mountCredits,
  mountFullscreenOptions,
  mountInputOptions,
  mountWorldLoading,
  SaveController,
} from '@skelly/presentation/ui';
import { loadRecord } from './bench/plan.ts';
import { showReport } from './bench/report.ts';
import { benchGameConfig, benchRunFromUrl, benchStartConfig, startBench } from './bench/run.ts';
import { shamblerRunFromUrl, startShamblerBench } from './bench/shamblers.ts';
import { bundledCredits } from './bundledCredits.ts';
import { writeHash } from './hashState.ts';
import { pageUrl } from './pageUrl.ts';
import { productAssets as assets } from './product/assets.ts';
import { inputBindings, keyboardInput } from './product/input.ts';
import { productModIntake } from './product/mods.ts';
import { playPage, tutorialHash } from './product/page.ts';
import { ragdollConfig, ragdollSweepViewer } from './product/ragdoll.ts';

document.getElementById('build-revision')!.textContent = `Build: ${getBuildRevision()}`;

const { query: params, hash, refused } = pageUrl();
// A link or an edit that changes only the hash does not load the page again, and the game reads its hash once at
// startup, so it reloads. The debug write-back replaces the address, which fires no `hashchange`.
addEventListener('hashchange', () => location.reload());
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
const bundled = selectBundledMods(
  productModIntake,
  showMods ? [] : bundledModIdsFromUrl(params),
  [],
  startModFromUrl(params),
);
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
  modsScreen.hidden = true;
  document.getElementById('errors')!.textContent = message;
  hideStartupScreen();
};
if (bundled.issues.length > 0) {
  showStartupFailure(bundled.issues.map((issue) => `${issue.source} ${issue.path}: ${issue.message}`).join('\n'));
  // Refused mods must not start a game with other content; stop the module here.
  await new Promise<never>(() => undefined);
}
if (refused !== undefined || bundled.startModRows !== undefined) {
  const { linkRefused, startModRows } = claimed(bundled.content.registry.ui, 'interface')!.screenText.startup;
  showStartupFailure(
    refused === undefined
      ? fillText(startModRows, { count: countText(bundled.startModRows!) })
      : fillText(linkRefused, { name: refused }),
  );
  // A link the game cannot read must not start a game that ignores part of it; stop the module here.
  await new Promise<never>(() => undefined);
}
// The mods screen is drawn before any mod is chosen, so it reads the bundled packs' text.
const browserSelection = showMods
  ? await chooseMods(modsScreen, claimed(bundled.content.registry.ui, 'interface')!.screenText.mods, productModIntake)
  : undefined;
const content = browserSelection?.content ?? bundled.content;
startupScreen.hidden = false;
const reportError = (message: string) => {
  const errors = document.getElementById('errors')!;
  errors.textContent = [errors.textContent, message].filter(Boolean).join('\n');
};
applyUiTokens(content.registry, document.documentElement, { report: reportError, files: assets.cursors });
const { screenText } = claimed(content.registry.ui, 'interface')!;
inputBindings.setPointerLabels(screenText.pointerButtonLabels);
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
  // ResizeObserver delivers the open-path update when unhiding lays out the card; the subtree observer covers content changes while open.
  new ResizeObserver(updateScrollCues).observe(menuCard);
  new MutationObserver(updateScrollCues).observe(menuCard, { attributes: true, childList: true, subtree: true });
  updateScrollCues();
}
const menuKeyLabel = document.querySelector<HTMLElement>('[data-key-binding="mainMenu"]');
const drawMenuLabel = () => {
  if (menuKeyLabel) {
    menuKeyLabel.textContent = inputBindings.label('ui.main-menu-toggle');
    menuKeyLabel.dataset.code = inputBindings.chords('ui.main-menu-toggle')[0]!.code;
  }
};
inputBindings.subscribe(drawMenuLabel);
drawMenuLabel();
const bench = params.get('bench');
const renderFree = renderFreeFromUrl(params, import.meta.env.DEV);
if (bench === null) {
  const credits = bundledCredits();
  for (const issue of credits.issues) {
    reportError(`${issue.source} ${issue.path}: ${issue.message}`);
  }
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
      target.hash = writeHash({ ...hash, radius: Number(radius) });
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
  let config = configFromUrl(params, hash, content, ragdollSweepViewer);
  keyboardInput.context = () => ({ context: 'title', debug: config.debug });
  const replayStash = () => sessionStorage;
  let pendingReplay: Uint8Array | undefined;
  try {
    pendingReplay = pendingInputReplay(replayStash);
  } catch (error) {
    clearPendingInputReplay(replayStash);
    reportError(`Replay rejected: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (pendingReplay) {
    config.debug = true;
  }
  if (config.debug) {
    inputBindings.setDebugRun();
  }
  mountFullscreenOptions(document.getElementById('fullscreen-options')!, screenText.options);
  mountInputOptions(document.getElementById('input-options')!, screenText.inputOptions, keyboardInput, config.debug);
  mountControlsCard(
    document.getElementById('controls')!,
    document.getElementById('controls-search') as HTMLInputElement,
    () => config.debug,
    inputBindings,
  );
  const debugModule = config.debug ? await import('./debug/index.ts') : undefined;
  const skyRoute = params.get('skyRoute') === '1' ? await debugModule?.loadSkyRoute() : undefined;
  const practiceMod = practiceModId(productModIntake, content.registry);
  const page = playPage(practiceMod);
  const engineOptions = { render: !renderFree };
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
      applyWeatheringConfig(replayConfig, hash);
      const engine = createEngine(replayConfig, view, undefined, engineOptions);
      const decoded = await decodeInputReplay(pendingReplay, {
        contentLookup: (kind, id) => contentLookup(engine.registry, kind, id),
      });
      clearPendingInputReplay(replayStash);
      await startPlay(engine, debugModule!, {
        assets,
        page,
        keyboard: keyboardInput,
        ragdoll: ragdollConfig,
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
      clearPendingInputReplay(replayStash);
      showStartupFailure(`Replay rejected: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (isPracticeStart(content.registry, config.startId)) {
    const engine = createEngine(config, view, undefined, engineOptions);
    try {
      await startPlay(engine, debugModule, {
        assets,
        page,
        keyboard: keyboardInput,
        ragdoll: ragdollConfig,
        tutorial: true,
      });
      document.getElementById('new-character-options')!.hidden = true;
      document.getElementById('tutorial-start')!.hidden = true;
      document.getElementById('save-status')!.textContent = 'Unsaved practice';
      hideStartupScreen();
    } catch (error) {
      showStartupFailure(`Practice failed to load: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    const practiceStart = document.getElementById('tutorial-start')!;
    practiceStart.hidden = practiceMod === undefined;
    practiceStart.addEventListener('click', (event) => {
      event.stopPropagation();
      location.assign(tutorialUrl(location.href, practiceMod, true, tutorialHash(hash)));
    });
    const saveBackend = params.get('save-backend');
    const backend: SaveBackendPreference = saveBackend === 'opfs' || saveBackend === 'indexeddb' ? saveBackend : 'auto';
    const saveController = new SaveController(
      screenText,
      { backend, savingEnabled: savingEnabledFromUrl(hash) },
      {
        bundledMods: bundled.admitted,
        browserMods: [...bundled.inlineAdmitted, ...(browserSelection?.admitted ?? [])],
        folderPacks: bundled.admittedFolderPacks,
      },
    );
    startupScreen.append(saveStatus);
    if (params.get('save-test') === '1') {
      Object.assign(globalThis, {
        skellySaveTest: {
          storage: saveController.storage,
          get namespace() {
            return saveController.namespace;
          },
          controller: saveController,
          identity: () => (saveController as unknown as { identity: Promise<unknown> | undefined }).identity,
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
      applyWeatheringConfig(resumed, hash);
      config = resumed;
    }
    const engine = createEngine(config, view, undefined, engineOptions);
    const restored = await saveController.validateContent(engine.registry);
    if (saveController.isRestored && restored) {
      try {
        await startPlay(engine, debugModule, {
          assets,
          page,
          keyboard: keyboardInput,
          ragdoll: ragdollConfig,
          saveController,
          restore: restored,
          ...(skyRoute ? { skyRoute } : {}),
        });
        hideStartupScreen();
      } catch (error) {
        showStartupFailure(`Saved world failed to load: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      saveController.setNewWorldLauncher(async (creation) => {
        // Capture transient activation before setup, then return the gesture handler before doing expensive work.
        const target = engine.renderer?.domElement ?? view;
        const locked = requestInputLock(target);
        const owner = new WorldLoading(engine);
        const draw = mountWorldLoading(owner, screenText.worldLoading);
        await locked;
        await new Promise<void>((done) => setTimeout(done, 0));
        let entry: Awaited<ReturnType<typeof startPlay>>;
        try {
          entry = await startPlay(engine, debugModule, {
            assets,
            page,
            keyboard: keyboardInput,
            ragdoll: ragdollConfig,
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
  const run = shamblerRunFromUrl(hash);
  if (run) {
    const config = benchStartConfig(content, run.seed, DEFAULT_RADIUS_M);
    const engine = createEngine(config, view, undefined, { graphicsSource: 'mod' });
    startShamblerBench(engine, run, await fetchActorFigureFiles(engine.registry, assets.figures));
  } else {
    document.getElementById('hud')!.textContent =
      'Invalid shambler benchmark parameters. Use the hash shamblers as unique positive integers up to 500 and the hash seed as a signed 32-bit integer.';
  }
} else {
  const run = benchRunFromUrl(hash);
  const stats: StreamerStats = { genMs: [], meshMs: [], triangles: [] };
  const config = benchGameConfig(run, content);
  const engine = createEngine(config, view, stats, { graphicsSource: 'mod' });
  startBench(engine, run, stats, await fetchActorFigureFiles(engine.registry, assets.figures));
}
