// Run under Xvfb for Firefox: `timeout 300 xvfb-run -a node test/browser/save-storage.mjs firefox`.
// The production-bundle stages serve a bundle built before the script starts; their package scripts build it.
// biome-ignore-all lint/correctness/noNodejsModules: opt-in browser contract launches Vite and Playwright
// biome-ignore-all lint/performance/noAwaitInLoops: backend and crash-stage matrix is deliberately sequential
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: environment selects a browser-contract subset
// biome-ignore-all lint/complexity/useSimplifiedLogicExpression: readable browser status checks
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { preview as vitePreview } from 'vite';
import { launchChromium, loadPlaywright } from './chromium.mjs';
import { observeFailures } from './failure-diagnostics.mjs';
import { gameUrl, inlineStartMod } from './gameUrl.mjs';
import { createRequestTimeline } from './requestTimeline.mjs';
import { outgoingCancellation } from './save-request-cancellation.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';

/**
 * @import { SaveBackend } from '@skelly/engine/save'
 * @import { SaveStorage, SaveStorageOptions } from '@skelly/presentation/internal/presentation/saveStorage.ts'
 * @import { Browser, BrowserContext, BrowserServer, Page, Request } from 'playwright'
 * @import { PreviewServer, ViteDevServer } from 'vite'
 */

/** @typedef {NonNullable<SaveStorageOptions['testCrashAt']>} CrashStage */
/** @typedef {{ label: string, source: unknown }} PageNavigation */
/**
 * The details the save storage logs when its lock request times out.
 * @typedef {object} SaveLockTimeoutDetails
 * @property {LockMode} requestedMode
 * @property {{ mode: LockMode | undefined }[]} held
 * @property {{ mode: LockMode | undefined }[]} pending
 * @property {boolean | null} holderIsAnotherClient
 */

/**
 * Which document generation each request and navigation belongs to; see `save-request-cancellation.mjs`.
 * @typedef {object} NavigationState
 * @property {number} generation
 * @property {boolean} newDocumentPending
 * @property {WeakMap<Request, number>} requestGeneration
 * @property {Map<number, PageNavigation>} navigationByGeneration
 */

const BUSY_LOCK_START = inlineStartMod('fixture.save-storage.busy-lock', {
  density: null,
  id: 'save_storage_busy_lock_start',
  kit: [
    { condition: 0.7, count: 1, destination: { kind: 'worn' }, id: 'jeans', item: 'jeans' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'sneakers', item: 'sneakers' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'hoodie', item: 'hoodie' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'beans', item: 'canned_beans' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'matches', item: 'matches' },
    { count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 }, id: 'bandages', item: 'bandage' },
  ],
  placement: {
    cell: [0, 0],
    descents: [
      { kind: 'ladder', ladder: [39, 1, 10], lower: [41, 1, 11], upper: [36, 41, 11] },
      { hatch: [10, 40, 5], kind: 'stairs', lower: [14, 1, 1], upper: [18, 41, 6] },
      { edge: [5, 41, 8], kind: 'drop', landing: [5, 3, 8], lower: [5, 1, 14], upper: [6, 41, 8] },
    ],
    fixedLoot: [{ at: [35, 17, 6], items: [{ condition: 0.7, item: 'revolver_357', key: true }] }],
    minimumOpenDescents: 2,
    spawn: [22, 41, 4],
    template: 'gauntlet_start',
  },
  recipes: [
    'torch',
    'candle',
    'repair_kit',
    'repair_crowbar',
    'sawn_plank',
    'door_bar',
    'make_rope',
    'grind_kitchen_knife',
    'hone_kitchen_knife',
    'grind_kabar',
    'hone_kabar',
    'grind_machete',
    'hone_machete',
  ],
  seed: 1,
  site: 'gauntlet',
  skills: {},
  startTimeGameTimeOfDay: '18:30',
  storeys: 1,
  wounds: [],
});
const STAGE_TIMEOUT_MS = 30_000;
const OVERALL_TIMEOUT_MS = 180_000;
const browserName = process.argv[2] ?? 'chromium';
const autosaveOnly = process.env.SAVE_AUTOSAVE_ONLY === '1';
const navigationOnly = process.env.SAVE_NAVIGATION_ONLY === '1';
const requestedAutosaveBackend = process.env.SAVE_AUTOSAVE_BACKEND;
const autosaveScenario = process.env.SAVE_AUTOSAVE_SCENARIO ?? 'continue';
const busyLockOnly = autosaveOnly && autosaveScenario === 'busy-lock';
const productionBundleStage =
  navigationOnly ||
  (autosaveOnly &&
    autosaveScenario === 'continue' &&
    ((browserName === 'chromium' && requestedAutosaveBackend === 'opfs') ||
      (browserName === 'firefox' && requestedAutosaveBackend === 'indexeddb')));
const continueBundleStageId =
  browserName === 'chromium' ? 'save-storage-opfs-continue' : 'save-storage-indexeddb-continue';
const productionBundleStageId = navigationOnly ? 'save-storage-navigation' : continueBundleStageId;
const stageId = productionBundleStage ? productionBundleStageId : 'save-storage';
if (!['continue', 'replacement', 'busy-lock'].includes(autosaveScenario)) {
  throw new Error(`Unsupported autosave scenario ${autosaveScenario}`);
}
if (requestedAutosaveBackend && !['opfs', 'indexeddb'].includes(requestedAutosaveBackend)) {
  throw new Error(`Unsupported save backend ${requestedAutosaveBackend}`);
}
if (!['chromium', 'firefox'].includes(browserName)) {
  throw new Error(`Expected browser name chromium or firefox, got ${browserName}`);
}
const { firefox } = loadPlaywright();
const { expect } = await import('playwright/test');
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const viteConfig = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));
/** @type {ViteDevServer | PreviewServer | undefined} */
let vite;
const requestTimeline = createRequestTimeline();
/**
 * @template T
 * @param {string} label
 * @param {Promise<T>} task
 */
const withTimeout = async (label, task, timeoutMs = STAGE_TIMEOUT_MS) => {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {Promise<never>} */
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    globalThis.clearTimeout(timer);
  }
};
/**
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} action
 */
const navigationPhase = async (label, action) => {
  const startedRealMs = performance.now();
  process.stdout.write(`SAVE_NAV_PHASE ${JSON.stringify({ label, event: 'start', at: Date.now() })}\n`);
  try {
    const result = await withTimeout(label, action());
    process.stdout.write(
      `SAVE_NAV_PHASE ${JSON.stringify({ label, event: 'end', elapsedRealMs: performance.now() - startedRealMs, at: Date.now() })}\n`,
    );
    return result;
  } catch (error) {
    process.stderr.write(
      `SAVE_NAV_PHASE ${JSON.stringify({ label, event: 'error', elapsedRealMs: performance.now() - startedRealMs, at: Date.now(), error: String(error) })}\n`,
    );
    throw error;
  }
};
const previewServer = async () => {
  if (!existsSync(fileURLToPath(new URL('../../dist/index.html', import.meta.url)))) {
    throw new Error(`${stageId} serves a prebuilt production bundle; run \`vite build\` in packages/deadvox first`);
  }
  const preview = await vitePreview({
    configFile: viteConfig,
    root: projectRoot,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 0 },
  });
  vite = preview;
  requestTimeline.watchServer(preview.httpServer);
  return listeningPort(preview);
};
const devServer = async () => {
  const dev = await createStageServer({
    configFile: viteConfig,
    root: projectRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  vite = dev;
  await dev.listen();
  assert(dev.httpServer, 'the stage server listens on its own HTTP server');
  requestTimeline.watchServer(dev.httpServer);
  return listeningPort(dev);
};
const startStageServer = productionBundleStage ? previewServer : devServer;
/** @type {Browser | undefined} */
let browser;
/** @type {BrowserServer | undefined} */
let firefoxServer;
try {
  const port = await (navigationOnly
    ? navigationPhase('Vite startup', startStageServer)
    : withTimeout('Vite startup', startStageServer()));
  const testUrl =
    autosaveOnly || navigationOnly
      ? `http://127.0.0.1:${port}/?save-test=1`
      : `http://127.0.0.1:${port}/test/browser/save-storage-contract.html`;
  /** @type {BrowserContext} */
  let context;
  if (browserName === 'chromium') {
    browser = await launchChromium(stageId, {
      headless: true,
      args: ['--disable-extensions', '--password-store=basic', '--window-size=1280,900'],
      ...(navigationOnly ? { channel: 'chromium', ignoreDefaultArgs: ['--disable-back-forward-cache'] } : {}),
      timeout: STAGE_TIMEOUT_MS,
    });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  } else {
    // The managed server exposes public child-process diagnostics without reaching into Playwright internals.
    firefoxServer = await withTimeout('Playwright Firefox launch', firefox.launchServer({ headless: false }));
    browser = await withTimeout('Playwright Firefox connection', firefox.connect(firefoxServer.wsEndpoint()));
    context = await browser.newContext();
  }
  await observeFailures(context, browser, firefoxServer?.process());
  if (navigationOnly || busyLockOnly) {
    await context.addInitScript(() => {
      globalThis.__lifecycleLockWarnings = [];
      // biome-ignore lint/suspicious/noConsole: browser test captures the required product diagnostics.
      const originalWarn = console.warn.bind(console);
      console.warn = (...args) => {
        if (String(args[0]).startsWith('Skelly save')) {
          globalThis.__lifecycleLockWarnings.push(args);
        }
        originalWarn(...args);
      };
    });
  }
  if (navigationOnly) {
    await context.addInitScript(() => {
      if (typeof navigator.locks?.request !== 'function') {
        return;
      }
      globalThis.__saveNavigationTiming = (entry) => {
        if (globalThis.self !== globalThis.top) {
          return;
        }
        const events = JSON.parse(sessionStorage.getItem('save-navigation-timings') ?? '[]');
        events.push({ ...entry, at: Date.now(), document: performance.timeOrigin });
        sessionStorage.setItem('save-navigation-timings', JSON.stringify(events.slice(-64)));
      };
      /** @param {Event} event */
      const lifecycle = (event) => {
        globalThis.__saveNavigationTiming?.({
          operation: event.type,
          persisted: event instanceof PageTransitionEvent ? event.persisted : undefined,
          visibilityState: document.visibilityState,
        });
      };
      document.addEventListener('visibilitychange', lifecycle);
      globalThis.addEventListener('pagehide', lifecycle);
      globalThis.addEventListener('pageshow', lifecycle);
      globalThis.__lifecycleEvent = 'none';
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          globalThis.__lifecycleEvent = 'visibilitychange';
        }
      });
      globalThis.addEventListener('pagehide', () => {
        globalThis.__lifecycleEvent = 'pagehide';
      });
      const request = navigator.locks.request.bind(navigator.locks);
      /**
       * @template T
       * @param {string} name
       * @param {LockOptions | LockGrantedCallback<T>} optionsOrCallback
       * @param {LockGrantedCallback<T>} [maybeCallback]
       * @returns {Promise<Awaited<T>>}
       */
      const heldRequest = (name, optionsOrCallback, maybeCallback) => {
        const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        if (!callback) {
          throw new TypeError('navigator.locks.request needs a callback');
        }
        if (
          name === 'skelly-save-storage' &&
          options.mode === 'exclusive' &&
          globalThis.__lifecycleHoldNextSave === true
        ) {
          globalThis.__lifecycleHoldNextSave = false;
          sessionStorage.setItem('lifecycle-writer-requested', 'true');
          sessionStorage.setItem('lifecycle-writer-trigger', globalThis.__lifecycleEvent);
          return request(name, options, async (lock) => {
            sessionStorage.setItem('lifecycle-held-writer', 'true');
            /** @type {Promise<void>} */
            const released = new Promise((resolve) => {
              globalThis.__lifecycleReleaseWriter = resolve;
              if (globalThis.__lifecycleReleaseOnAcquire) {
                resolve();
              }
            });
            await released;
            return callback(lock);
          });
        }
        return request(name, options, callback);
      };
      navigator.locks.request = heldRequest;
      globalThis.addEventListener('pagehide', (event) => {
        sessionStorage.setItem('lifecycle-pagehide', JSON.stringify({ persisted: event.persisted }));
      });
      globalThis.addEventListener('pageshow', (event) => {
        sessionStorage.setItem('lifecycle-pageshow', String(event.persisted));
        if (event.persisted) {
          globalThis.__lifecycleHoldNextSave = false;
          globalThis.__lifecycleReleaseOnAcquire = true;
          globalThis.__lifecycleReleaseWriter?.();
        }
      });
      globalThis.addEventListener('DOMContentLoaded', () => {
        if (!location.pathname.endsWith('/index.html')) {
          return;
        }
        let frames = 0;
        /** @param {unknown} error */
        const captureError = (error) => {
          sessionStorage.setItem('lifecycle-lock-snapshot', JSON.stringify({ error: String(error) }));
        };
        const captureLocks = async () => {
          const locks = await navigator.locks.query();
          const held = (locks.held ?? []).filter((lock) => lock.name === 'skelly-save-storage');
          const pending = (locks.pending ?? []).filter((lock) => lock.name === 'skelly-save-storage');
          const ready = globalThis.skellySaveTest?.saveState().ready === true;
          const writerWaiting = [...held, ...pending].some((lock) => lock.mode === 'exclusive');
          if (writerWaiting || ready || frames >= 120) {
            sessionStorage.setItem('lifecycle-lock-snapshot', JSON.stringify({ held, pending, ready, writerWaiting }));
            return;
          }
          frames += 1;
          requestAnimationFrame(() => captureLocks().catch(captureError));
        };
        captureLocks().catch(captureError);
      });
    });
  }
  if (busyLockOnly) {
    await context.addInitScript(() => {
      /** @type {Element | null} */
      let locked = null;
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
      Element.prototype.requestPointerLock = function () {
        locked = this;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
  }
  let page = await withTimeout('initial page creation', context.newPage());
  /** @type {string[]} */
  const pageErrors = [];
  /** @type {WeakMap<Page, NavigationState>} */
  const navigationDiagnostics = new WeakMap();
  /** @param {Page} trackedPage */
  const trackPageNavigation = (trackedPage) => {
    /** @type {NavigationState} */
    const state = {
      generation: 0,
      newDocumentPending: false,
      requestGeneration: new WeakMap(),
      navigationByGeneration: new Map(),
    };
    navigationDiagnostics.set(trackedPage, state);
    requestTimeline.watchPage(trackedPage);
    trackedPage.on('request', (request) => {
      if (!request.isNavigationRequest()) {
        state.requestGeneration.set(request, state.generation);
      } else if (request.frame() === trackedPage.mainFrame()) {
        state.newDocumentPending = true;
      }
    });
    trackedPage.on('framenavigated', (frame) => {
      if (frame === trackedPage.mainFrame() && state.newDocumentPending) {
        state.newDocumentPending = false;
        state.generation += 1;
      }
    });
    trackedPage.on('pageerror', (error) => pageErrors.push(error.message));
    trackedPage.on('requestfailed', (request) => recordRequestFailure(trackedPage, request));
  };
  /**
   * @template T
   * @param {string} label
   * @param {() => Promise<T>} action
   */
  const navigatePage = async (label, action) => {
    const state = navigationDiagnostics.get(page);
    assert(state, 'every stage page is tracked before it navigates');
    const readSource = () =>
      page.evaluate(() => {
        const controller = globalThis.skellySaveTest?.controller;
        const save = globalThis.skellySaveTest?.saveState?.();
        return {
          url: location.href,
          readyState: document.readyState,
          saveTimings: globalThis.__saveNavigationTiming
            ? JSON.parse(sessionStorage.getItem('save-navigation-timings') ?? '[]')
            : undefined,
          navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
          moduleLoads: performance
            .getEntriesByType('resource')
            .filter((entry) => entry.name.includes('/src/'))
            .map((entry) => ({ url: entry.name, startRealMs: entry.startTime, durationRealMs: entry.duration })),
          status: document.querySelector('#save-status')?.textContent ?? null,
          controller: controller
            ? {
                ready: save?.ready === true,
                entered: controller.isEntered,
                restored: controller.restored !== undefined,
                savedGeneration: save?.savedGeneration ?? null,
                failure: save?.failure ?? null,
              }
            : null,
        };
      });
    const source = await (navigationOnly
      ? navigationPhase(`${label} source diagnostics`, readSource)
      : readSource()
    ).catch((error) => ({ url: page.url(), error: String(error) }));
    const navigation = { label, source };
    state.navigationByGeneration.set(state.generation, navigation);
    process.stdout.write(`${browserName}: ${label} from ${JSON.stringify(source)}\n`);
    return navigationOnly ? navigationPhase(label, action) : action();
  };
  /**
   * @param {Page} trackedPage
   * @param {Request} request
   */
  const recordRequestFailure = (trackedPage, request) => {
    const failure = request.failure()?.errorText;
    const state = navigationDiagnostics.get(trackedPage);
    const generation = state?.requestGeneration.get(request);
    const navigation = outgoingCancellation(request, state);
    process.stdout.write(
      `SAVE_REQUEST_FAILURE ${JSON.stringify({ url: request.url(), failure, resourceType: request.resourceType(), requestStartAbsoluteRealMs: request.timing().startTime, generation, currentGeneration: state?.generation, ownedOutgoing: Boolean(navigation), navigation })}\n`,
    );
    // Firefox cancels outgoing-document module fetches during reload; destination-page failures remain errors.
    if (navigation) {
      process.stdout.write(
        `${browserName}: ignored outgoing-page request cancellation during ${navigation.label}: ${request.url()} from ${JSON.stringify(navigation.source)}\n`,
      );
      return;
    }
    pageErrors.push(`${request.url()} failed: ${failure}`);
  };
  trackPageNavigation(page);
  /** @param {() => Promise<boolean>} predicate */
  const pollNavigation = (predicate) =>
    expect.poll(() => page.evaluate(predicate), { timeout: STAGE_TIMEOUT_MS }).toBe(true);
  const waitForNavigationIdle = () =>
    pollNavigation(async () => {
      const { writing, queued } = globalThis.skellySaveTest.saveState();
      const locks = await navigator.locks.query();
      const activeSaveLock = [...(locks.held ?? []), ...(locks.pending ?? [])].some(
        (lock) => lock.name === 'skelly-save-storage',
      );
      const idle = !writing && queued === undefined && !activeSaveLock;
      if (idle) {
        globalThis.__saveNavigationTiming?.({
          operation: 'quiescence',
          writing,
          queued: queued !== undefined,
          locks,
        });
      }
      return idle;
    });
  const instrumentNavigationSave = () =>
    page.evaluate(() => {
      const { storage, observeCaptures } = globalThis.skellySaveTest;
      /**
       * @param {string} operation
       * @param {string} event
       * @param {number} startedRealMs
       * @param {unknown} [detail]
       */
      const report = (operation, event, startedRealMs, detail) => {
        globalThis.__saveNavigationTiming?.({
          operation,
          event,
          elapsedRealMs: performance.now() - startedRealMs,
          detail,
        });
      };
      observeCaptures((reason) => report('capture', 'requested', performance.now(), reason));
      /**
       * @template {(...args: never[]) => Promise<unknown>} Method
       * @param {string} method
       * @param {Method} original
       * @returns {Method}
       */
      const timed = (method, original) =>
        /** @type {Method} */ (
          /** @param {Parameters<Method>} args */
          async (...args) => {
            const startedRealMs = performance.now();
            report(`storage.${method}`, 'start', startedRealMs);
            try {
              const result = await original(...args);
              report(`storage.${method}`, 'end', startedRealMs);
              return result;
            } catch (error) {
              report(`storage.${method}`, 'error', startedRealMs, String(error));
              throw error;
            }
          }
        );
      storage.save = timed('save', storage.save.bind(storage));
      storage.load = timed('load', storage.load.bind(storage));
    });
  if (!autosaveOnly && !navigationOnly) {
    await page.goto(testUrl, { timeout: STAGE_TIMEOUT_MS });
    await page.waitForSelector('#ready', { timeout: STAGE_TIMEOUT_MS });
  }

  const runStorageContract = () =>
    withTimeout(
      'overall browser storage contract',
      page.evaluate(async (stageTimeoutMs) => {
        // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this project-root source path.
        const { SaveStorage } = await import('/@stage/@skelly/presentation/internal/presentation/saveStorage.ts');
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        /**
         * @template T
         * @param {string} label
         * @param {Promise<T>} task
         */
        const stage = async (label, task) => {
          /** @type {ReturnType<typeof setTimeout> | undefined} */
          let timer;
          /** @type {Promise<never>} */
          const timeout = new Promise((_, reject) => {
            timer = globalThis.setTimeout(
              () => reject(new Error(`${label} timed out after ${stageTimeoutMs} ms`)),
              stageTimeoutMs,
            );
          });
          try {
            return await Promise.race([task, timeout]);
          } finally {
            globalThis.clearTimeout(timer);
          }
        };
        /** @param {string} label */
        const namespaceFor = async (label) => {
          const digest = await crypto.subtle.digest('SHA-256', encoder.encode(label));
          return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        };
        /**
         * @param {NonNullable<SaveStorageOptions['backend']>} backend
         * @param {SaveStorageOptions} [extra]
         */
        const create = (backend, extra = {}) => new SaveStorage({ backend, requestTimeoutMs: 15_000, ...extra });
        /**
         * @param {SaveStorage} storage
         * @param {string} namespace
         * @param {string} value
         */
        const saveValue = (storage, namespace, value) =>
          storage.save(namespace, async (generation) => encoder.encode(`${generation}:${value}`));
        /** @param {SaveBackend} backend */
        const testRoundTrip = async (backend) => {
          const storage = create(backend);
          const status = await stage(`${backend} capability status`, storage.status());
          if (status.backend !== backend) {
            throw new Error(`Forced ${backend} selected ${status.backend}`);
          }
          const namespace = await namespaceFor(`round-trip:${backend}`);
          await stage(`${backend} first generation write`, saveValue(storage, namespace, 'first'));
          await stage(`${backend} second generation write`, saveValue(storage, namespace, 'second'));
          const loaded = await stage(`${backend} read newest generation`, storage.load(namespace));
          if (loaded?.generation !== 2 || decoder.decode(loaded?.payload ?? new Uint8Array()) !== '2:second') {
            throw new Error(`${backend} did not load its newest complete record`);
          }
          const result = { backend, quotaSupported: status.quota.supported, persistent: status.persistent };
          storage.close();
          return result;
        };
        /** @param {SaveBackend} backend */
        const testTwoTabs = async (backend) => {
          const namespace = await namespaceFor(`two-tabs:${backend}`);
          const left = create(backend);
          const right = create(backend);
          await stage(`${backend} two-tab capability probes`, Promise.all([left.status(), right.status()]));
          const results = await stage(
            `${backend} two-tab concurrent commits`,
            Promise.all([saveValue(left, namespace, 'tab-left'), saveValue(right, namespace, 'tab-right')]),
          );
          const loaded = await stage(`${backend} two-tab final read`, left.load(namespace));
          const generations = results.map(({ generation }) => generation).sort((a, b) => a - b);
          if (generations[0] !== 1 || generations[1] !== 2 || loaded?.generation !== 2) {
            throw new Error(`${backend} two-tab writes were not serialized: ${generations.join(',')}`);
          }
          left.close();
          right.close();
          return { backend, generations };
        };
        const testReadWaitsForOpenWriter = async () => {
          const namespace = await namespaceFor('open-opfs-writer-read');
          const seed = create('opfs');
          const writer = create('opfs');
          const reader = create('opfs');
          await stage(
            'OPFS open-writer capability probes',
            Promise.all([seed.status(), writer.status(), reader.status()]),
          );
          await stage('OPFS seed valid generation', saveValue(seed, namespace, 'old'));
          /** @type {PromiseWithResolvers<void>} */
          const { promise: encodingStarted, resolve: markEncodingStarted } = Promise.withResolvers();
          /** @type {PromiseWithResolvers<void>} */
          const { promise: payloadGate, resolve: releasePayload } = Promise.withResolvers();
          try {
            const write = writer.save(namespace, async (generation) => {
              markEncodingStarted();
              await payloadGate;
              return encoder.encode(`${generation}:new`);
            });
            await stage('OPFS writer holds exclusive lock', encodingStarted);
            const read = reader.load(namespace);
            const readFinishedEarly = await Promise.race([
              read.then(
                () => true,
                () => true,
              ),
              new Promise((resolve) => globalThis.setTimeout(() => resolve(false), 100)),
            ]);
            if (readFinishedEarly) {
              throw new Error('OPFS read did not wait for the open writer');
            }
            releasePayload();
            await stage('OPFS writer commits after gate opens', write);
            const loaded = await stage('OPFS read sees a complete generation', read);
            if (loaded?.generation !== 2 || decoder.decode(loaded.payload) !== '2:new') {
              throw new Error('OPFS reader did not get the valid generation after the writer committed');
            }
            return { backend: 'opfs', generation: loaded.generation };
          } finally {
            releasePayload();
            seed.close();
            writer.close();
            reader.close();
          }
        };
        const testQuotaStatusDeadline = async () => {
          const storage = create('indexeddb');
          const { estimate } = navigator.storage;
          // Simulate a browser metadata request that never settles, without blocking worker I/O.
          navigator.storage.estimate = () => new Promise(() => undefined);
          try {
            const status = await stage('unresponsive quota status reaches its deadline', storage.status());
            if (status.quota.supported) {
              throw new Error('Unresponsive quota status did not degrade to unavailable metadata');
            }
          } finally {
            navigator.storage.estimate = estimate;
            storage.close();
          }
        };
        const testBusyWriterDeadline = async () => {
          const namespace = await namespaceFor('busy-writer-deadline');
          const writer = create('indexeddb');
          const waiting = create('indexeddb', { requestTimeoutMs: 2000 });
          await stage('busy-writer capability probes', Promise.all([writer.status(), waiting.status()]));
          /** @type {PromiseWithResolvers<void>} */
          const { promise: gate, resolve: release } = Promise.withResolvers();
          /** @type {PromiseWithResolvers<void>} */
          const { promise: ready, resolve: acquired } = Promise.withResolvers();
          let encodedWhileBusy = false;
          const write = writer.save(namespace, async (generation) => {
            acquired();
            await gate;
            return encoder.encode(`${generation}:owner`);
          });
          try {
            await stage('writer holds exclusive lock', ready);
            const failure = await stage(
              'queued writer reaches its acquisition deadline',
              waiting
                .save(namespace, () => {
                  encodedWhileBusy = true;
                  return Promise.resolve(encoder.encode('unexpected second writer'));
                })
                .then(
                  () => null,
                  (error) => ({ message: error.message, cause: error.cause?.name }),
                ),
            );
            if (!failure?.message.trim() || failure.cause !== 'AbortError' || encodedWhileBusy) {
              throw new Error(`Queued writer did not fail safely at its deadline: ${JSON.stringify(failure)}`);
            }
            const locks = await navigator.locks.query();
            if (locks.held?.length !== 1 || (locks.pending?.length ?? 0) > 0) {
              throw new Error('Timed-out writer stole the lock or left a queued request behind');
            }
            release();
            await stage('original writer commits after its waiter expires', write);
            await stage('later writer can acquire normally', saveValue(waiting, namespace, 'later'));
            const loaded = await stage('load later committed generation', waiting.load(namespace));
            if (loaded?.generation !== 2 || decoder.decode(loaded.payload) !== '2:later') {
              throw new Error('Acquisition deadline interfered with serialized commits');
            }
            return { backend: 'indexeddb', generation: loaded.generation };
          } finally {
            release();
            await write.catch(() => undefined);
            writer.close();
            waiting.close();
          }
        };
        /**
         * @param {SaveBackend} backend
         * @param {CrashStage} crashAt
         */
        const testCrashStage = async (backend, crashAt) => {
          const namespace = await namespaceFor(`crash:${backend}:${crashAt}`);
          const seedStorage = create(backend);
          await stage(`${backend}/${crashAt} seed probe`, seedStorage.status());
          await stage(`${backend}/${crashAt} seed old generation`, saveValue(seedStorage, namespace, 'old'));
          seedStorage.close();

          const crashedStorage = create(backend, { testCrashAt: crashAt, requestTimeoutMs: 2000 });
          await stage(`${backend}/${crashAt} crash probe`, crashedStorage.status());
          let writeFailed = false;
          try {
            await stage(`${backend}/${crashAt} injected write`, saveValue(crashedStorage, namespace, 'new'));
          } catch {
            writeFailed = true;
          }
          crashedStorage.close();
          if (!writeFailed) {
            throw new Error(`${backend} crash injection at ${crashAt} reported success`);
          }

          const reader = create(backend);
          await stage(`${backend}/${crashAt} recovery probe`, reader.status());
          const loaded = await stage(`${backend}/${crashAt} recovery read`, reader.load(namespace));
          const payload = loaded ? decoder.decode(loaded.payload) : '';
          if (!(loaded && ['1:old', '2:new'].includes(payload))) {
            throw new Error(`${backend} crash at ${crashAt} left no whole generation (${payload})`);
          }
          reader.close();
          return { backend, stage: crashAt, loadedGeneration: loaded.generation, payload };
        };

        const autoStorage = create('auto');
        const autoStatus = await stage('automatic backend feature detection', autoStorage.status());
        if (!['opfs', 'indexeddb'].includes(autoStatus.backend)) {
          throw new Error(`Feature detection selected unsupported backend ${autoStatus.backend}`);
        }
        autoStorage.close();
        await testQuotaStatusDeadline();
        const busyWriterDeadline = await testBusyWriterDeadline();
        /** @type {SaveBackend[]} */
        const backends = autoStatus.backend === 'opfs' ? ['opfs', 'indexeddb'] : ['indexeddb'];
        const backendResults = [];
        const concurrentBackendResults = [];
        const crashResults = [];
        const openWriterReadResults = [];
        for (const backend of backends) {
          backendResults.push(await testRoundTrip(backend));
          concurrentBackendResults.push(await testTwoTabs(backend));
          if (backend === 'opfs') {
            openWriterReadResults.push(await testReadWaitsForOpenWriter());
          }
          /** @type {CrashStage[]} */
          const crashStages =
            backend === 'opfs'
              ? ['before-truncate', 'after-truncate', 'after-partial-write', 'after-write', 'after-flush']
              : ['before-transaction', 'after-read', 'after-put', 'after-commit'];
          for (const crashAt of crashStages) {
            crashResults.push(await testCrashStage(backend, crashAt));
          }
        }
        return {
          autoBackend: autoStatus.backend,
          backendResults,
          concurrentBackendResults,
          crashResults,
          openWriterReadResults,
          busyWriterDeadline,
        };
      }, STAGE_TIMEOUT_MS),
      OVERALL_TIMEOUT_MS,
    );
  const contract =
    autosaveOnly || navigationOnly
      ? {
          autoBackend: requestedAutosaveBackend ?? 'indexeddb',
          backendResults: [],
          concurrentBackendResults: [],
          crashResults: [],
        }
      : await runStorageContract();

  await page.close();
  page = await context.newPage();
  trackPageNavigation(page);
  /** @param {SaveBackend} backend */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: browser contract exercises save entry, recovery, and replacement end to end.
  const testTitleAndAutosave = async (backend) => {
    const appUrl = browserStageUrl(stageId, `http://127.0.0.1:${port}/?save-backend=${backend}&save-test=1#{seed:73}`);
    /** @param {string} step */
    const readGeneration = async (step) => {
      try {
        const generation = await page.evaluate(
          async () => (await globalThis.skellySaveTest.storage.load(globalThis.skellySaveTest.namespace))?.generation,
        );
        if (generation === undefined || !Number.isInteger(generation)) {
          throw new Error('no committed generation was returned');
        }
        return generation;
      } catch (error) {
        throw new Error(`${backend} ${step} storage read failed: ${String(error)}`, { cause: error });
      }
    };
    // Evidence for #446: tells eviction, a wrong namespace and a lost record apart on the next failure.
    /** @param {number | undefined} generationBeforeReload */
    const reloadFailureDump = async (generationBeforeReload) => {
      const dump = await page
        .evaluate(async () => {
          /**
           * @template T
           * @param {() => T | Promise<T>} read
           */
          const attempt = async (read) => {
            try {
              return await read();
            } catch (error) {
              return { error: String(error) };
            }
          };
          const test = globalThis.skellySaveTest;
          return {
            databases: await attempt(() => indexedDB.databases()),
            namespace: test?.namespace ?? null,
            listedNamespaces: await attempt(() => test.storage.listNamespaces()),
            storedGeneration: await attempt(async () => (await test.storage.load(test.namespace))?.generation ?? null),
            estimate: await attempt(() => navigator.storage.estimate()),
            sessionKeys: await attempt(() => Object.keys(sessionStorage).filter((key) => key.startsWith('lifecycle-'))),
            pagehide: await attempt(() => sessionStorage.getItem('lifecycle-pagehide')),
            writerTrigger: await attempt(() => sessionStorage.getItem('lifecycle-writer-trigger')),
          };
        })
        .catch((error) => ({ error: String(error) }));
      return `; generationBeforeReload=${generationBeforeReload}; dump=${JSON.stringify(dump)}`;
    };
    /** @param {number | undefined} previous */
    const waitForGeneration = async (previous, trigger = 'checkpoint') => {
      try {
        const result = await page.waitForFunction(
          ({ minimum }) => {
            const state = globalThis.skellySaveTest?.saveState?.();
            if (!state) {
              return false;
            }
            if (state.failure) {
              return { failure: state.failure };
            }
            return state.savedGeneration > (minimum ?? 0) ? { generation: state.savedGeneration } : false;
          },
          { minimum: previous },
          { timeout: STAGE_TIMEOUT_MS },
        );
        const outcome = await result.jsonValue();
        await result.dispose();
        assert(outcome, 'a settled generation wait carries its outcome');
        if (outcome.failure !== undefined) {
          throw new Error(outcome.failure);
        }
        return outcome.generation;
      } catch (error) {
        const status = await page
          .locator('#save-status')
          .textContent()
          .catch(() => 'unavailable');
        throw new Error(
          `${backend} ${trigger} generation did not advance from ${previous ?? 'none'}; status=${status}; errors=${pageErrors.join('; ')}`,
          { cause: error },
        );
      }
    };
    await navigatePage('autosave initial goto', () => page.goto(appUrl, { timeout: STAGE_TIMEOUT_MS }));
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState !== undefined, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    try {
      await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready === true, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
    } catch (error) {
      const status = await page.locator('#save-status').textContent();
      throw new Error(`${backend} startup stalled with status ${status}; errors: ${pageErrors.join('; ')}`, {
        cause: error,
      });
    }
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    assert.equal(
      await page.evaluate(() => globalThis.skellySaveTest.saveState().discoveredGeneration),
      undefined,
      `${backend} fresh storage must have no saved world`,
    );
    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.skellySaveTest?.controller.isEntered, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.evaluate(() => globalThis.skellySaveTest.triggerPeriodicCheckpoint());
    const periodicGeneration = await waitForGeneration(undefined, 'periodic');
    await page.evaluate(() => globalThis.skellySaveTest.controller.beforeSleep());
    const sleepGeneration = await waitForGeneration(periodicGeneration, 'before-sleep');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const visibilityGeneration = await waitForGeneration(sleepGeneration, 'visibilitychange');
    await page.evaluate(() => globalThis.dispatchEvent(new Event('pagehide')));
    const firstGeneration = await waitForGeneration(visibilityGeneration, 'pagehide');

    await navigatePage('reload after pagehide checkpoint', () =>
      page.reload({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS }),
    );
    try {
      await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready === true, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
    } catch (error) {
      const status = await page.locator('#save-status').textContent();
      throw new Error(
        `${backend} refresh stayed at ${status}; errors: ${pageErrors.join('; ')}${await reloadFailureDump(firstGeneration)}`,
        { cause: error },
      );
    }
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(
      () => {
        const handle = globalThis.skellySaveTest;
        return handle?.saveState().ready && handle.controller.restored !== undefined;
      },
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    const restoreMenu = await page.evaluate(() => {
      const resume = document.querySelector('#continue');
      return {
        status: document.querySelector('#save-status')?.textContent,
        disabled: resume instanceof HTMLButtonElement ? resume.disabled : undefined,
      };
    });
    if (restoreMenu.disabled !== false) {
      throw new Error(`${backend} saved generation was not Continue-compatible: ${restoreMenu.status}`);
    }
    const savedWorldId = await page.evaluate(() => {
      const { restored } = globalThis.skellySaveTest.controller;
      if (!restored) {
        throw new Error('The save controller restored no world');
      }
      return restored.world.id;
    });
    const originalViewport = page.viewportSize();
    assert(originalViewport, `${backend} stage contexts have a fixed viewport`);
    await page.setViewportSize({ width: 1159, height: 414 });
    const choice = await page.evaluate(() => {
      const card = document.querySelector('#title-choice');
      const menuCard = document.querySelector('#overlay .card');
      if (!(card && menuCard)) {
        throw new Error('The title choice or its menu card is not on the page');
      }
      const bounds = card.getBoundingClientRect();
      const controls = ['continue', 'go'].map((id) => {
        const element = document.getElementById(id);
        if (!element) {
          throw new Error(`The title choice lacks #${id}`);
        }
        const rect = element.getBoundingClientRect();
        return (
          !element.hidden &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          rect.left >= 0 &&
          rect.right <= innerWidth
        );
      });
      return {
        controls,
        centred: Math.abs((bounds.left + bounds.right) / 2 - innerWidth / 2) < 1,
        scrollTop: menuCard.scrollTop,
      };
    });
    assert.deepEqual(choice.controls, [true, true], `${backend} title choices must be visible without scrolling`);
    assert.equal(choice.centred, true, `${backend} saved-world choice must be centred`);
    assert.equal(choice.scrollTop, 0, `${backend} title choice must not need menu scrolling`);
    await page.locator('#overlay').click({ position: { x: 1, y: 1 } });
    assert.equal(
      await page.locator('#save-confirmation').isVisible(),
      false,
      `${backend} a title background click must not choose replacement`,
    );
    await page.setViewportSize(originalViewport);
    const beforeContinue = await readGeneration('before Continue');
    assert(Number.isInteger(beforeContinue), `${backend} Continue check needs a committed generation`);
    if (beforeContinue < firstGeneration) {
      throw new Error(`${backend} refreshed save regressed its generation`);
    }
    await page.evaluate(() => {
      globalThis.dispatchEvent(new Event('pagehide'));
      const { writing, queued } = globalThis.skellySaveTest.saveState();
      if (writing || queued !== undefined) {
        throw new Error('title-screen pagehide queued a save');
      }
    });
    if ((await readGeneration('after title-screen pagehide')) !== beforeContinue) {
      throw new Error(`${backend} title-screen pagehide wrote before Continue or New world was selected`);
    }
    await navigatePage('reload after title-pagehide check', () =>
      page.reload({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS }),
    );
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready === true, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    if (autosaveScenario === 'continue') {
      await navigatePage('continue from restored title screen', () =>
        Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS }),
          page.click('#continue', { timeout: STAGE_TIMEOUT_MS }),
        ]),
      );
      try {
        await page.waitForFunction(() => globalThis.skellySaveTest?.controller.isEntered, undefined, {
          timeout: STAGE_TIMEOUT_MS,
        });
      } catch (error) {
        const status = await page.locator('#save-status').textContent();
        throw new Error(`${backend} Continue stalled at ${status}; errors: ${pageErrors.join('; ')}`, { cause: error });
      }
      await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
      const restoredMenu = await page.evaluate(() => {
        const overlay = document.querySelector('#overlay');
        return {
          status: document.querySelector('#save-status')?.textContent,
          pointerLocked: document.pointerLockElement !== null,
          overlayHidden: overlay instanceof HTMLElement ? overlay.hidden : undefined,
        };
      });
      if (restoredMenu.pointerLocked || restoredMenu.overlayHidden) {
        throw new Error(`${backend} Continue did not start paused: ${JSON.stringify(restoredMenu)}`);
      }
      assert.equal(
        await page.evaluate(() => {
          const { restored } = globalThis.skellySaveTest.controller;
          if (!restored) {
            throw new Error('Continue restored no world');
          }
          return restored.world.id;
        }),
        savedWorldId,
        `${backend} Continue must restore the chosen world`,
      );
      return { backend, continued: true, paused: true, generation: beforeContinue };
    }

    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(
      () => {
        const confirmation = document.querySelector('#save-confirmation');
        return confirmation instanceof HTMLElement && !confirmation.hidden;
      },
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    await page.click('#save-replace-cancel', { timeout: STAGE_TIMEOUT_MS });
    const confirmationHidden = await page.evaluate(() => {
      const confirmation = document.querySelector('#save-confirmation');
      return confirmation instanceof HTMLElement ? confirmation.hidden : undefined;
    });
    if (confirmationHidden !== true) {
      throw new Error(`${backend} replacement cancellation did not dismiss confirmation`);
    }
    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.click('#save-replace-confirm', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.skellySaveTest?.controller.isEntered, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    assert.notEqual(
      await page.evaluate(() => {
        const { sessionBound, worldId } = globalThis.skellySaveTest.saveState();
        if (!sessionBound) {
          throw new Error('The replacement world has no snapshot source');
        }
        return worldId;
      }),
      savedWorldId,
      `${backend} replacement must start a different world`,
    );
    if ((await readGeneration('after replacement confirmation')) !== beforeContinue) {
      throw new Error(`${backend} replaced the prior A/B generation before a new snapshot`);
    }
    await page.evaluate(() => {
      const { storage } = globalThis.skellySaveTest;
      const save = storage.save.bind(storage);
      storage.save = () => {
        storage.save = save;
        throw new Error('injected browser test write failure');
      };
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(
      () => (document.querySelector('#save-status')?.textContent ?? '').includes('injected browser test write failure'),
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    if ((await readGeneration('after injected write failure')) !== beforeContinue) {
      throw new Error(`${backend} failed replacement write damaged the previous generation`);
    }
    await page.evaluate(() => {
      globalThis.skellySaveTest.controller.halt();
    });
    await navigatePage('reload after failed replacement write', () =>
      page.reload({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS }),
    );
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready === true, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState !== undefined, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    const failureRecovery = await page.evaluate(() => {
      const resume = document.querySelector('#continue');
      return {
        continueDisabled: resume instanceof HTMLButtonElement ? resume.disabled : undefined,
        status: document.querySelector('#save-status')?.textContent,
      };
    });
    if (
      failureRecovery.continueDisabled !== false ||
      (await readGeneration('after failed-write recovery reload')) !== beforeContinue
    ) {
      throw new Error(`${backend} failed write hid the previous valid Continue generation: ${failureRecovery.status}`);
    }
    await page.evaluate(() => globalThis.skellySaveTest.storage.close());
    return { backend, replacementConfirmed: true, failedWriteRetainedContinue: true };
  };
  const autosaveResults = [];
  /** @type {SaveBackend[]} */
  let appBackends = [];
  if (navigationOnly) {
    const appUrl = new URL(
      browserStageUrl(
        stageId,
        `http://127.0.0.1:${port}/?save-backend=indexeddb&save-test=1#{debug:true,save:true,seed:73,freeze:true}`,
      ),
    );
    await navigatePage('navigation-only initial goto', () =>
      page.goto(appUrl.href, { timeout: STAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' }),
    );
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.evaluate(() => {
      if (typeof navigator.locks?.request !== 'function' || typeof navigator.locks.query !== 'function') {
        throw new Error('Navigation regression requires the Web Locks API');
      }
    });
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    await navigationPhase('new world entry', async () => {
      await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
      await page.waitForFunction(
        () => {
          const marker = document.querySelector('.debug-frozen');
          return marker instanceof HTMLElement && !marker.hidden;
        },
        undefined,
        { timeout: STAGE_TIMEOUT_MS },
      );
    });
    await navigationPhase('checkpoint instrumentation', instrumentNavigationSave);
    await navigationPhase('checkpoint capture', () =>
      page.evaluate(() => globalThis.skellySaveTest.controller.beforeSleep()),
    );
    await navigationPhase('checkpoint commit and quiescence', async () => {
      await pollNavigation(async () => {
        const { storage, namespace, saveState } = globalThis.skellySaveTest;
        const record = await storage.load(namespace);
        if (record) {
          sessionStorage.setItem('lifecycle-generation-before-reload', String(record.generation));
        }
        const { writing, queued } = saveState();
        return !writing && queued === undefined && Boolean(record);
      });
      await waitForNavigationIdle();
    });
    await navigationPhase('reload and save discovery', async () => {
      await navigatePage('navigation-only reload after checkpoint', () =>
        page.reload({ timeout: STAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' }),
      );
      await page.waitForFunction(
        () => {
          const resume = document.querySelector('#continue');
          return (
            globalThis.skellySaveTest?.saveState().ready &&
            globalThis.skellySaveTest.controller.restored !== undefined &&
            resume instanceof HTMLButtonElement &&
            !resume.disabled
          );
        },
        undefined,
        { timeout: STAGE_TIMEOUT_MS },
      );
    });
    await navigationPhase('Continue entry', async () => {
      await page.click('#continue', { timeout: STAGE_TIMEOUT_MS });
      await page.waitForFunction(() => globalThis.skellySaveTest?.controller.isEntered, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
    });
    await navigationPhase('Continue quiescence', waitForNavigationIdle);
    await navigationPhase('restored-world instrumentation', instrumentNavigationSave);
    const beforeNavigation = await navigationPhase('pre-navigation lock query', () =>
      page.evaluate(async () => {
        const { controller, saveState } = globalThis.skellySaveTest;
        const { writing, discoveredGeneration, savedGeneration } = saveState();
        return {
          writing,
          locks: await navigator.locks.query(),
          namespace: controller.namespace,
          generation: discoveredGeneration,
          savedGeneration,
        };
      }),
    );
    process.stdout.write(`${browserName}: pre-navigation save state ${JSON.stringify(beforeNavigation)}\n`);
    assert.equal(beforeNavigation.writing, false);
    const { held: heldBeforeNavigation, pending: pendingBeforeNavigation } = beforeNavigation.locks;
    assert(heldBeforeNavigation && pendingBeforeNavigation, 'the lock snapshot lists held and pending locks');
    assert.equal(
      heldBeforeNavigation.some((lock) => lock.name === 'skelly-save-storage'),
      false,
      'the page enters navigation without already holding a lock that would disqualify bfcache',
    );
    assert.equal(pendingBeforeNavigation.length, 0);
    await page.evaluate(() => {
      const { storage, saveState, observeCaptures } = globalThis.skellySaveTest;
      observeCaptures((reason) => {
        const events = JSON.parse(sessionStorage.getItem('lifecycle-captures') ?? '[]');
        events.push({ reason, pageIsLeaving: saveState().pageIsLeaving, visibilityState: document.visibilityState });
        sessionStorage.setItem('lifecycle-captures', JSON.stringify(events));
      });
      const save = storage.save.bind(storage);
      storage.save = (...args) => {
        const events = JSON.parse(sessionStorage.getItem('lifecycle-writes') ?? '[]');
        events.push({ pageIsLeaving: saveState().pageIsLeaving, visibilityState: document.visibilityState });
        sessionStorage.setItem('lifecycle-writes', JSON.stringify(events));
        return save(...args);
      };
      sessionStorage.removeItem('lifecycle-captures');
      sessionStorage.removeItem('lifecycle-writes');
      sessionStorage.removeItem('lifecycle-held-writer');
      sessionStorage.removeItem('lifecycle-writer-requested');
      sessionStorage.removeItem('lifecycle-writer-trigger');
      sessionStorage.removeItem('lifecycle-generation-before-reload');
      sessionStorage.removeItem('lifecycle-lock-snapshot');
      sessionStorage.removeItem('lifecycle-pagehide');
      sessionStorage.removeItem('lifecycle-pageshow');
    });
    if (browserName === 'chromium') {
      await page.evaluate(() => {
        globalThis.__lifecycleHoldNextSave = true;
      });
    }
    // Only the path differs, so the destination is a new document on the same content and save namespace.
    const freshStartUrl = new URL(appUrl);
    freshStartUrl.pathname += 'index.html';
    await navigationPhase('destination save discovery', async () => {
      await navigatePage('navigation-only goto normal start', () =>
        page.goto(freshStartUrl.href, { timeout: STAGE_TIMEOUT_MS, waitUntil: 'commit' }),
      );
      await page.waitForFunction(() => sessionStorage.getItem('lifecycle-lock-snapshot') !== null, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
    });
    const result = await navigationPhase('destination lock snapshot', () =>
      page.evaluate(async () => {
        const locks = await navigator.locks.query();
        const controller = globalThis.skellySaveTest?.controller;
        const save = globalThis.skellySaveTest?.saveState();
        const resume = document.querySelector('#continue');
        return {
          pagehide: JSON.parse(sessionStorage.getItem('lifecycle-pagehide') ?? 'null'),
          writerRequested: sessionStorage.getItem('lifecycle-writer-requested'),
          writerTrigger: sessionStorage.getItem('lifecycle-writer-trigger'),
          lockSnapshot: JSON.parse(sessionStorage.getItem('lifecycle-lock-snapshot') ?? 'null'),
          heldWriter: sessionStorage.getItem('lifecycle-held-writer'),
          ready: save?.ready ?? null,
          hasSavedWorld: controller ? controller.restored !== undefined : null,
          storageUnavailable: save?.storageUnavailable ?? null,
          continueDisabled: resume instanceof HTMLButtonElement ? resume.disabled : undefined,
          held: (locks.held ?? []).filter((lock) => lock.name === 'skelly-save-storage'),
          pending: (locks.pending ?? []).filter((lock) => lock.name === 'skelly-save-storage'),
          warnings: globalThis.__lifecycleLockWarnings ?? [],
          namespace: controller?.namespace,
          generation: save?.discoveredGeneration,
          savedGeneration: save?.savedGeneration,
          statusText: save?.statusText,
          failure: save?.failure,
          // @ts-expect-error notRestoredReasons is Chromium-only and absent from TypeScript's DOM lib.
          notRestoredReasons: performance.getEntriesByType('navigation')[0]?.notRestoredReasons ?? null,
          saveTimings: JSON.parse(sessionStorage.getItem('save-navigation-timings') ?? '[]'),
        };
      }),
    );
    process.stdout.write(`${browserName}: in-tab loadout navigation ${JSON.stringify(result)}\n`);
    let restored;
    if (browserName === 'chromium' && result.pagehide?.persisted === true) {
      // The destination page's own pageshow also writes the marker, so clear it to make the wait mean Back's.
      await page.evaluate(() => sessionStorage.removeItem('lifecycle-pageshow'));
      await navigationPhase('Back pageshow and quiescence', async () => {
        await navigatePage('navigation-only browser Back', () =>
          page.goBack({ waitUntil: 'commit', timeout: STAGE_TIMEOUT_MS }),
        );
        await page.waitForFunction(() => sessionStorage.getItem('lifecycle-pageshow') !== null, undefined, {
          timeout: STAGE_TIMEOUT_MS,
        });
        const backPageshow = await page.evaluate(() => ({
          persisted: sessionStorage.getItem('lifecycle-pageshow') === 'true',
          // @ts-expect-error notRestoredReasons is Chromium-only and absent from TypeScript's DOM lib.
          notRestoredReasons: performance.getEntriesByType('navigation')[0]?.notRestoredReasons?.toJSON() ?? null,
        }));
        assert.equal(
          backPageshow.persisted,
          true,
          `Chromium evicted the cached page on Back: ${JSON.stringify(backPageshow.notRestoredReasons)}`,
        );
        await waitForNavigationIdle();
      });
      restored = await navigationPhase('Back committed record read', () =>
        page.evaluate(async () => ({
          locks: await navigator.locks.query(),
          pageshowPersisted: sessionStorage.getItem('lifecycle-pageshow') === 'true',
          saveTimings: JSON.parse(sessionStorage.getItem('save-navigation-timings') ?? '[]'),
          // @ts-expect-error notRestoredReasons is Chromium-only and absent from TypeScript's DOM lib.
          notRestoredReasons: performance.getEntriesByType('navigation')[0]?.notRestoredReasons?.toJSON() ?? null,
          controllerEntered: globalThis.skellySaveTest?.controller?.isEntered ?? null,
          pageIsLeaving: globalThis.skellySaveTest?.saveState().pageIsLeaving ?? null,
          visibilityState: document.visibilityState,
          generation: (await globalThis.skellySaveTest.storage.load(globalThis.skellySaveTest.namespace))?.generation,
        })),
      );
      process.stdout.write(`${browserName}: restored after navigation ${JSON.stringify(restored)}\n`);
    }
    if (browserName === 'chromium') {
      assert.equal(result.pagehide?.persisted, true, 'Chromium keeps the outgoing world in bfcache');
      assert.equal(result.writerRequested, null, 'leaving for bfcache must not request a save lock');
      assert.equal(result.writerTrigger, null);
      assert.equal(result.heldWriter, null, 'the cached page has not entered a lock-holding save');
      assert.equal(result.lockSnapshot.writerWaiting, false, 'no exclusive writer holds or blocks the new page');
      assert.equal(result.lockSnapshot.ready, true);
      assert.equal(result.held.length, 0, 'the save storage has no held lock');
      assert.equal(result.pending.length, 0, 'the new page has no shared request waiting on a cached writer');
      assert.equal(result.storageUnavailable, false);
      assert.equal(result.ready, true);
      assert.equal(result.hasSavedWorld, true);
      assert.equal(result.continueDisabled, false);
      assert.equal(result.warnings.length, 0);
      assert.equal(restored?.pageshowPersisted, true, 'Back restores the original world from bfcache');
      assert.equal(restored?.controllerEntered, true, 'Back restores the running world');
      assert(restored, 'Chromium restores the cached page on Back');
      assert.equal(
        restored.locks.held?.some((lock) => lock.name === 'skelly-save-storage'),
        false,
        'restoring a cached page does not leave a save lock held',
      );
      assert.equal(restored.visibilityState, 'visible', 'Back restores the real page to the foreground');
      await navigationPhase('post-Back visibility capture', () =>
        page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        }),
      );
      await navigationPhase('post-Back commit and quiescence', waitForNavigationIdle);
      const postBackSave = await navigationPhase('post-Back committed record read', () =>
        page.evaluate(async () => {
          const { saveState, storage, namespace } = globalThis.skellySaveTest;
          const record = await storage.load(namespace);
          const { pageIsLeaving, statusText } = saveState();
          return {
            pageIsLeaving,
            statusText,
            saveTimings: JSON.parse(sessionStorage.getItem('save-navigation-timings') ?? '[]'),
            captures: JSON.parse(sessionStorage.getItem('lifecycle-captures') ?? '[]'),
            writes: JSON.parse(sessionStorage.getItem('lifecycle-writes') ?? '[]'),
            generation: record?.generation,
          };
        }),
      );
      process.stdout.write(`${browserName}: post-Back capture ${JSON.stringify(postBackSave)}\n`);
      await page.evaluate(() =>
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }),
      );
      assert.equal(restored.pageIsLeaving, false, 'pageshow clears the leaving state');
      assert.equal(postBackSave.pageIsLeaving, false, 'the restored page remains eligible for lifecycle saves');
      assert.equal(postBackSave.captures.length, 1, 'Back produces only the intended lifecycle capture');
      assert.equal(postBackSave.captures[0].visibilityState, 'hidden');
      assert.equal(postBackSave.captures[0].pageIsLeaving, false);
      assert(
        postBackSave.generation !== undefined && restored.generation !== undefined,
        'both sides of Back read a committed record',
      );
      assert.equal(postBackSave.generation > restored.generation, true);
    } else {
      assert.equal(result.ready, true, 'saved world did not load after in-tab navigation');
      assert.equal(result.hasSavedWorld, true);
      assert.equal(result.continueDisabled, false);
    }
    if (browserName !== 'chromium') {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS }),
        page.click('#continue', { timeout: STAGE_TIMEOUT_MS }),
      ]);
      await page.waitForFunction(() => globalThis.skellySaveTest?.controller.isEntered, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
    }
  } else if (busyLockOnly) {
    assert.equal(requestedAutosaveBackend, 'indexeddb', 'isolated busy-lock regression uses IndexedDB');
  } else if (autosaveOnly && requestedAutosaveBackend) {
    assert(
      requestedAutosaveBackend === 'opfs' || requestedAutosaveBackend === 'indexeddb',
      `SAVE_AUTOSAVE_BACKEND names a save backend, not ${requestedAutosaveBackend}`,
    );
    appBackends = [requestedAutosaveBackend];
  } else if (autosaveOnly) {
    appBackends = contract.autoBackend === 'opfs' ? ['opfs'] : ['indexeddb'];
  }
  for (const [index, backend] of appBackends.entries()) {
    if (index > 0) {
      await page.close();
      page = await context.newPage();
      trackPageNavigation(page);
    }
    autosaveResults.push(await testTitleAndAutosave(backend));
  }

  // Independent of quarantined Continue/native gestures: seed a valid checkpoint, then hold a real writer lock.
  if (busyLockOnly) {
    const appUrl = browserStageUrl(
      stageId,
      gameUrl(`http://127.0.0.1:${port}`, {
        startMod: BUSY_LOCK_START,
        harness: { 'save-backend': 'indexeddb', 'save-test': 1 },
        hash: { seed: 73 },
      }),
    );
    await page.goto(appUrl, { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.skellySaveTest?.controller.isEntered, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.evaluate(() => globalThis.skellySaveTest.triggerPeriodicCheckpoint());
    await page.waitForFunction(
      async () => {
        const { storage, namespace } = globalThis.skellySaveTest;
        return Boolean(await storage.load(namespace));
      },
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    const originalSlots = await page.evaluate(async () => {
      const { storage, namespace } = globalThis.skellySaveTest;
      const slots = await storage.readRawSlots(namespace);
      return { a: slots.a ? Array.from(slots.a) : null, b: slots.b ? Array.from(slots.b) : null };
    });
    const holder = await withTimeout('busy-lock holder page creation', context.newPage());
    holder.on('pageerror', (error) => pageErrors.push(error.message));
    // The lock owner needs a same-origin document, not another renderer/world/worker.
    const holderUrl = `http://127.0.0.1:${port}/save-lock-holder.html`;
    await holder.route(holderUrl, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Save writer holder</title>' }),
    );
    await holder.goto(holderUrl, { timeout: STAGE_TIMEOUT_MS });
    await holder.evaluate(async () => {
      /** @type {PromiseWithResolvers<void>} */
      const { promise: ready, resolve: acquired } = Promise.withResolvers();
      globalThis.skellyHeldSaveLock = navigator.locks.request('skelly-save-storage', { mode: 'exclusive' }, () => {
        acquired();
        /** @type {Promise<void>} */
        const held = new Promise((resolve) => {
          globalThis.skellyReleaseSaveLock = resolve;
        });
        return held;
      });
      await ready;
    });
    try {
      // Closing the seed session triggers its lifecycle checkpoint; it cannot steal the held writer lock.
      await navigatePage('busy-lock seed session close', () => page.close());
      page = await withTimeout('busy-lock relaunch page creation', context.newPage());
      trackPageNavigation(page);
      await page.goto(appUrl, { timeout: STAGE_TIMEOUT_MS });
      await page.waitForFunction(
        () => {
          const status = document.querySelector('#startup-screen #save-status');
          return Boolean(
            status?.textContent.trim() &&
              globalThis.skellySaveTest?.controller &&
              !globalThis.skellySaveTest.saveState().ready,
          );
        },
        undefined,
        { timeout: STAGE_TIMEOUT_MS },
      );
      assert.equal(
        await page.locator('#startup-screen #save-status').isVisible(),
        true,
        'save discovery status is visible on the startup screen while the busy lock is checked',
      );
      try {
        await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready, undefined, {
          timeout: STAGE_TIMEOUT_MS,
        });
      } catch (error) {
        throw new Error(`Busy-lock relaunch stalled at ${await page.locator('#save-status').textContent()}`, {
          cause: error,
        });
      }
      await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
      const busy = await page.evaluate(async () => {
        const status = document.querySelector('#save-status');
        const go = document.querySelector('#go');
        const rescan = document.querySelector('#save-rescan');
        const resume = document.querySelector('#continue');
        if (!(status && go && rescan && resume instanceof HTMLButtonElement)) {
          throw new Error('The title screen lacks its save status, New world, Retry or Continue control');
        }
        return {
          status: status.textContent,
          newWorldLabel: go.textContent,
          expectedNewWorldLabel: globalThis.skellySaveTest.controller.titleNewWorldLabel,
          failure: globalThis.skellySaveTest.saveState().failure,
          storageUnavailable: globalThis.skellySaveTest.saveState().storageUnavailable,
          retryVisible: rescan.checkVisibility(),
          continueDisabled: resume.disabled,
          locks: await navigator.locks.query(),
          warnings: globalThis.__lifecycleLockWarnings,
        };
      });
      assert.ok(busy.failure.trim(), 'the owner reports a save discovery failure');
      assert.ok(busy.status.includes(busy.failure), 'startup renders the owner’s failure');
      assert.equal(busy.storageUnavailable, true, 'the timed-out store is unavailable');
      assert.equal(busy.newWorldLabel, busy.expectedNewWorldLabel);
      assert.equal(busy.retryVisible, true);
      assert.equal(busy.continueDisabled, true);
      assert.equal(busy.locks.held?.length, 1);
      assert.equal(busy.locks.held?.[0]?.mode, 'exclusive');
      assert.equal(busy.locks.pending?.length, 0);
      const lockWarning = busy.warnings.find(([message]) => message === 'Skelly save lock request timed out');
      assert.ok(lockWarning, 'lock timeout is reported to the browser console');
      // The second console argument is the logged details; see
      // `packages/presentation/src/presentation/saveStorage.ts`, `warnSaveLockTimeout`.
      const timeout = /** @type {SaveLockTimeoutDetails} */ (lockWarning[1]);
      assert.equal(timeout.requestedMode, 'shared');
      assert.ok(timeout.held.some((lock) => lock.mode === 'exclusive'));
      assert.ok(timeout.pending.some((lock) => lock.mode === 'shared'));
      assert.equal(timeout.holderIsAnotherClient, true);
      await holder.evaluate(async () => {
        globalThis.skellyReleaseSaveLock();
        await globalThis.skellyHeldSaveLock;
      });
      await navigatePage('busy-lock rescan reload', () =>
        Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS }),
          page.click('#save-rescan', { timeout: STAGE_TIMEOUT_MS }),
        ]),
      );
      await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
      await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
      assert.equal(await page.locator('#continue').isEnabled(), true);
      assert.equal(await page.locator('#save-rescan').isVisible(), false);
      const recoveredSlots = await page.evaluate(async () => {
        const { storage, namespace } = globalThis.skellySaveTest;
        const slots = await storage.readRawSlots(namespace);
        return { a: slots.a ? Array.from(slots.a) : null, b: slots.b ? Array.from(slots.b) : null };
      });
      assert.deepEqual(recoveredSlots, originalSlots);
      process.stdout.write(`${browserName}: busy-lock diagnostics passed\n`);
    } finally {
      await holder.evaluate(() => globalThis.skellyReleaseSaveLock());
      await holder.close();
    }
  }

  if (!autosaveOnly && !navigationOnly) {
    const expectedBackends = contract.autoBackend === 'opfs' ? 2 : 1;
    assert.equal(contract.backendResults.length, expectedBackends);
    assert.equal(contract.concurrentBackendResults.length, expectedBackends);
    assert.equal(contract.crashResults.length, contract.autoBackend === 'opfs' ? 9 : 4);
  }
  assert.deepEqual(pageErrors, []);
  if (!busyLockOnly && !navigationOnly) {
    process.stdout.write(
      `${browserName}: auto selected ${contract.autoBackend}; tested ${contract.backendResults.map(({ backend }) => backend).join(', ')}; round-trip, contention, ${contract.crashResults.length} kill stages, and autosave/title ${autosaveScenario} (${autosaveResults.map(({ backend }) => backend).join(', ')}) passed\n`,
    );
  }
} catch (error) {
  process.stderr.write(`${requestTimeline.format()}\n`);
  throw error;
} finally {
  await withTimeout('browser shutdown', browser?.close() ?? Promise.resolve(), 5000).catch((error) => {
    process.stderr.write(`Cleanup warning: ${String(error)}\n`);
  });
  await withTimeout('Firefox server shutdown', firefoxServer?.close() ?? Promise.resolve(), 5000).catch((error) => {
    process.stderr.write(`Cleanup warning: ${String(error)}\n`);
  });
  if (vite) {
    await withTimeout('Vite shutdown', vite.close(), 5000).catch((error) => {
      process.stderr.write(`Cleanup warning: ${String(error)}\n`);
    });
  }
}
