// Run under Xvfb for Firefox: `timeout 300 xvfb-run -a node test/browser/save-storage.mjs firefox`.
// biome-ignore-all lint/correctness/noNodejsModules: opt-in browser contract launches Vite and Playwright
// biome-ignore-all lint/performance/noAwaitInLoops: backend and crash-stage matrix is deliberately sequential
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: environment selects a browser-contract subset
// biome-ignore-all lint/complexity/useSimplifiedLogicExpression: readable browser status checks
import assert from 'node:assert/strict';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createServer, build as viteBuild, preview as vitePreview } from 'vite';
import { launchChromium, loadPlaywright } from './chromium.mjs';
import { observeFailures } from './failure-diagnostics.mjs';
import { browserStageUrl } from './stage-mode.mjs';

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
const { firefox } = await loadPlaywright();
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const viteConfig = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));
let vite;
const startWebServer = async () => {
  if (productionBundleStage) {
    process.stdout.write(`${browserName}: building production bundle for pixel stage ${stageId}\n`);
    await viteBuild({ configFile: viteConfig, root: projectRoot, logLevel: 'error' });
    vite = await vitePreview({
      configFile: viteConfig,
      root: projectRoot,
      logLevel: 'error',
      preview: { host: '127.0.0.1', port: 0 },
    });
    return vite.httpServer.address();
  }
  vite = await createServer({
    configFile: viteConfig,
    root: projectRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  return vite.httpServer.address();
};
const withTimeout = async (label, task, timeoutMs = STAGE_TIMEOUT_MS) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    globalThis.clearTimeout(timer);
  }
};
let browser;
let firefoxServer;
try {
  const address = await withTimeout('Vite startup', startWebServer());
  assert(address && typeof address !== 'string');
  const testUrl =
    autosaveOnly || navigationOnly
      ? `http://127.0.0.1:${address.port}/?save-test=1`
      : `http://127.0.0.1:${address.port}/test/browser/save-storage-contract.html`;
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
      globalThis.__d144LockWarnings = [];
      // biome-ignore lint/suspicious/noConsole: browser test captures the required product diagnostics.
      const originalWarn = console.warn.bind(console);
      console.warn = (...args) => {
        if (String(args[0]).startsWith('Deadvox save')) {
          globalThis.__d144LockWarnings.push(args);
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
      globalThis.__d144LifecycleEvent = 'none';
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          globalThis.__d144LifecycleEvent = 'visibilitychange';
        }
      });
      globalThis.addEventListener('pagehide', () => {
        globalThis.__d144LifecycleEvent = 'pagehide';
      });
      const request = navigator.locks.request.bind(navigator.locks);
      navigator.locks.request = (name, options, callback) => {
        if (
          name === 'deadvox-save-storage' &&
          options?.mode === 'exclusive' &&
          globalThis.__d144HoldNextSave === true
        ) {
          globalThis.__d144HoldNextSave = false;
          sessionStorage.setItem('d144-writer-requested', 'true');
          sessionStorage.setItem('d144-writer-trigger', globalThis.__d144LifecycleEvent);
          return request(name, options, async (lock) => {
            sessionStorage.setItem('d144-held-writer', 'true');
            await new Promise((resolve) => {
              globalThis.__d144ReleaseWriter = resolve;
              if (globalThis.__d144ReleaseOnAcquire) {
                resolve();
              }
            });
            return callback(lock);
          });
        }
        return request(name, options, callback);
      };
      globalThis.addEventListener('pagehide', (event) => {
        sessionStorage.setItem('d144-pagehide', JSON.stringify({ persisted: event.persisted }));
      });
      globalThis.addEventListener('pageshow', (event) => {
        sessionStorage.setItem('d144-pageshow', String(event.persisted));
        if (event.persisted) {
          globalThis.__d144HoldNextSave = false;
          globalThis.__d144ReleaseOnAcquire = true;
          globalThis.__d144ReleaseWriter?.();
        }
      });
      globalThis.addEventListener('DOMContentLoaded', () => {
        if (!new URLSearchParams(location.search).has('loadout')) {
          return;
        }
        let frames = 0;
        const captureError = (error) => {
          sessionStorage.setItem('d144-lock-snapshot', JSON.stringify({ error: String(error) }));
        };
        const captureLocks = async () => {
          const locks = await navigator.locks.query();
          const held = locks.held.filter((lock) => lock.name === 'deadvox-save-storage');
          const pending = locks.pending.filter((lock) => lock.name === 'deadvox-save-storage');
          const ready = globalThis.deadvoxSaveTest?.controller.ready === true;
          const writerWaiting = [...held, ...pending].some((lock) => lock.mode === 'exclusive');
          if (writerWaiting || ready || frames >= 120) {
            sessionStorage.setItem('d144-lock-snapshot', JSON.stringify({ held, pending, ready }));
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
  const pageErrors = [];
  const recordRequestFailure = (request) => {
    pageErrors.push(`${request.url()} failed: ${request.failure()?.errorText}`);
  };
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', recordRequestFailure);
  if (!autosaveOnly && !navigationOnly) {
    await page.goto(testUrl, { timeout: STAGE_TIMEOUT_MS });
    await page.waitForSelector('#ready', { timeout: STAGE_TIMEOUT_MS });
  }

  const runStorageContract = () =>
    withTimeout(
      'overall browser storage contract',
      page.evaluate(async (stageTimeoutMs) => {
        // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this project-root source path.
        const { SaveStorage } = await import('/src/game/saveStorage.ts');
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const stage = async (label, task) => {
          let timer;
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
        const namespaceFor = async (label) => {
          const digest = await crypto.subtle.digest('SHA-256', encoder.encode(label));
          return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        };
        const create = (backend, extra = {}) => new SaveStorage({ backend, requestTimeoutMs: 15_000, ...extra });
        const saveValue = (storage, namespace, value) =>
          storage.save(namespace, async (generation) => encoder.encode(`${generation}:${value}`));
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
          let releasePayload;
          let markEncodingStarted;
          const encodingStarted = new Promise((resolve) => {
            markEncodingStarted = resolve;
          });
          const payloadGate = new Promise((resolve) => {
            releasePayload = resolve;
          });
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
          let release;
          let acquired;
          const gate = new Promise((resolve) => {
            release = resolve;
          });
          const ready = new Promise((resolve) => {
            acquired = resolve;
          });
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
                  () => '',
                  (error) => error.message,
                ),
            );
            if (!failure.includes('World is still open or saving in another page') || encodedWhileBusy) {
              throw new Error(`Queued writer did not fail safely at its deadline: ${failure}`);
            }
            const locks = await navigator.locks.query();
            if (locks.held.length !== 1 || locks.pending.length > 0) {
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
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', recordRequestFailure);
  const probePage = autosaveOnly || navigationOnly ? page : await context.newPage();
  if (!autosaveOnly && !navigationOnly) {
    await probePage.goto(testUrl, { timeout: STAGE_TIMEOUT_MS });
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: browser contract exercises save entry, recovery, and replacement end to end.
  const testTitleAndAutosave = async (backend) => {
    const appUrl = browserStageUrl(
      stageId,
      `http://127.0.0.1:${address.port}/?seed=73&save-backend=${backend}${autosaveOnly ? '&save-test=1' : ''}`,
    );
    if (!autosaveOnly) {
      await probePage.evaluate(async (preferredBackend) => {
        // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this project-root source path.
        const { SaveStorage } = await import('/src/game/saveStorage.ts');
        // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this project-root source path.
        const { currentSaveVersionIdentity } = await import('/src/core/saveFormat.ts');
        const storage = new SaveStorage({ backend: preferredBackend });
        const identity = await currentSaveVersionIdentity();
        globalThis.__d5SaveTest = { storage, namespace: identity.digest };
      }, backend);
    }
    let lastReadFailure = '';
    const readGeneration = async () => {
      try {
        return await probePage.evaluate(
          async () => (await globalThis.__d5SaveTest.storage.load(globalThis.__d5SaveTest.namespace))?.generation,
        );
      } catch (error) {
        lastReadFailure = String(error);
        // OPFS readers can transiently conflict with an in-flight writer handle.
      }
    };
    const waitForGeneration = (previous, trigger = 'checkpoint') =>
      withTimeout(
        `wait for ${backend} generation`,
        (async () => {
          const deadline = Date.now() + STAGE_TIMEOUT_MS;
          while (Date.now() < deadline) {
            const generation = await readGeneration();
            if (generation !== undefined && (previous === undefined || generation > previous)) {
              return generation;
            }
            await delay(100);
          }
          const status = await page.locator('#save-status').textContent();
          throw new Error(
            `${backend} ${trigger} generation did not advance; status=${status}; lastRead=${lastReadFailure}`,
          );
        })(),
      );
    await page.goto(appUrl, { timeout: STAGE_TIMEOUT_MS });
    if (autosaveOnly) {
      await page.waitForFunction(() => globalThis.deadvoxSaveTest !== undefined, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
      await page.evaluate(() => {
        const { storage, namespace } = globalThis.deadvoxSaveTest;
        globalThis.__d5SaveTest = { storage, namespace };
      });
    }
    try {
      await page.waitForFunction(
        () => {
          const status = document.querySelector('#save-status')?.textContent ?? '';
          return status.includes('Title screen ready');
        },
        undefined,
        { timeout: STAGE_TIMEOUT_MS },
      );
    } catch (error) {
      const status = await page.locator('#save-status').textContent();
      throw new Error(`${backend} startup stalled with status ${status}; errors: ${pageErrors.join('; ')}`, {
        cause: error,
      });
    }
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    const initialStatus = await page.locator('#save-status').textContent();
    if (!initialStatus?.includes('No saved world found')) {
      throw new Error(`${backend} title startup reported: ${initialStatus}`);
    }
    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.evaluate(() => globalThis.deadvoxSaveTest.triggerPeriodicCheckpoint());
    const periodicGeneration = await waitForGeneration(undefined, 'periodic');
    await page.evaluate(() => globalThis.deadvoxSaveTest.controller.beforeSleep());
    const sleepGeneration = await waitForGeneration(periodicGeneration, 'before-sleep');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const visibilityGeneration = await waitForGeneration(sleepGeneration, 'visibilitychange');
    await page.evaluate(() => globalThis.dispatchEvent(new Event('pagehide')));
    const firstGeneration = await waitForGeneration(visibilityGeneration, 'pagehide');
    await delay(1000);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS });
    try {
      await page.waitForFunction(
        () => {
          const status = document.querySelector('#save-status')?.textContent ?? '';
          return status.includes('Title screen ready');
        },
        undefined,
        { timeout: STAGE_TIMEOUT_MS },
      );
    } catch (error) {
      const status = await page.locator('#save-status').textContent();
      throw new Error(`${backend} refresh stayed at ${status}; errors: ${pageErrors.join('; ')}`, { cause: error });
    }
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    if (autosaveOnly) {
      await page.evaluate(() => {
        const { storage, namespace } = globalThis.deadvoxSaveTest;
        globalThis.__d5SaveTest = { storage, namespace };
      });
    }
    await delay(500);
    const restoreMenu = await page.evaluate(() => ({
      status: document.querySelector('#save-status')?.textContent,
      disabled: document.querySelector('#continue')?.disabled,
    }));
    if (restoreMenu.disabled !== false) {
      throw new Error(`${backend} saved generation was not Continue-compatible: ${restoreMenu.status}`);
    }
    const beforeContinue = await readGeneration();
    if (beforeContinue < firstGeneration) {
      throw new Error(`${backend} refreshed save regressed its generation`);
    }
    await page.evaluate(() => globalThis.dispatchEvent(new Event('pagehide')));
    await delay(200);
    if ((await readGeneration()) !== beforeContinue) {
      throw new Error(`${backend} title-screen pagehide wrote before Continue or New world was selected`);
    }
    await page.evaluate(() => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: true });
      globalThis.dispatchEvent(event);
    });
    if (autosaveScenario === 'continue') {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS }),
        page.click('#continue', { timeout: STAGE_TIMEOUT_MS }),
      ]);
      try {
        await page.waitForFunction(
          () => (document.querySelector('#save-status')?.textContent ?? '').includes('Saved world continued'),
          undefined,
          { timeout: STAGE_TIMEOUT_MS },
        );
      } catch (error) {
        const status = await page.locator('#save-status').textContent();
        throw new Error(`${backend} Continue stalled at ${status}; errors: ${pageErrors.join('; ')}`, { cause: error });
      }
      await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
      const restoredMenu = await page.evaluate(() => ({
        status: document.querySelector('#save-status')?.textContent,
        pointerLocked: document.pointerLockElement !== null,
        overlayHidden: document.querySelector('#overlay')?.hidden,
      }));
      if (restoredMenu.pointerLocked || restoredMenu.overlayHidden) {
        throw new Error(`${backend} Continue did not start paused: ${JSON.stringify(restoredMenu)}`);
      }
      return { backend, continued: true, paused: true, generation: beforeContinue };
    }

    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => document.querySelector('#save-confirmation')?.hidden === false, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.click('#save-replace-cancel', { timeout: STAGE_TIMEOUT_MS });
    if ((await page.evaluate(() => document.querySelector('#save-confirmation')?.hidden)) !== true) {
      throw new Error(`${backend} replacement cancellation did not dismiss confirmation`);
    }
    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.click('#save-replace-confirm', { timeout: STAGE_TIMEOUT_MS });
    if ((await readGeneration()) !== beforeContinue) {
      throw new Error(`${backend} replaced the prior A/B generation before a new snapshot`);
    }
    await page.evaluate(() => {
      const { storage } = globalThis.deadvoxSaveTest;
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
    if ((await readGeneration()) !== beforeContinue) {
      throw new Error(`${backend} failed replacement write damaged the previous generation`);
    }
    await page.evaluate(() => {
      globalThis.deadvoxSaveTest.controller.entered = false;
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(
      () => (document.querySelector('#save-status')?.textContent ?? '').includes('Title screen ready'),
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.deadvoxSaveTest !== undefined, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.evaluate(() => {
      const { storage, namespace } = globalThis.deadvoxSaveTest;
      globalThis.__d5SaveTest = { storage, namespace };
    });
    const failureRecovery = await page.evaluate(() => ({
      continueDisabled: document.querySelector('#continue')?.disabled,
      status: document.querySelector('#save-status')?.textContent,
    }));
    if (failureRecovery.continueDisabled !== false || (await readGeneration()) !== beforeContinue) {
      throw new Error(`${backend} failed write hid the previous valid Continue generation: ${failureRecovery.status}`);
    }
    await probePage.evaluate(() => globalThis.__d5SaveTest.storage.close());
    return { backend, replacementConfirmed: true, failedWriteRetainedContinue: true };
  };
  const autosaveResults = [];
  let appBackends = [];
  if (navigationOnly) {
    const appUrl = new URL(
      browserStageUrl(stageId, `http://127.0.0.1:${address.port}/?seed=73&debug=1&save-backend=indexeddb&save-test=1`),
    );
    appUrl.searchParams.set('freeze', '1');
    await page.goto(appUrl.href, { timeout: STAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.evaluate(() => {
      if (typeof navigator.locks?.request !== 'function' || typeof navigator.locks.query !== 'function') {
        throw new Error('Navigation regression requires the Web Locks API');
      }
    });
    await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(
      () => {
        const marker = document.querySelector('.debug-frozen');
        return marker !== null && !marker.hidden;
      },
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    await page.evaluate(() => globalThis.deadvoxSaveTest.controller.beforeSleep());
    await page.waitForFunction(
      async () => {
        const { storage, namespace, controller } = globalThis.deadvoxSaveTest;
        return !controller.writing && controller.queued === undefined && Boolean(await storage.load(namespace));
      },
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    await page.waitForFunction(
      async () => {
        const { controller } = globalThis.deadvoxSaveTest;
        const locks = await navigator.locks.query();
        const activeSaveLock = [...locks.held, ...locks.pending].some((lock) => lock.name === 'deadvox-save-storage');
        return !controller.writing && controller.queued === undefined && !activeSaveLock;
      },
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    await page.reload({ timeout: STAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        globalThis.deadvoxSaveTest?.controller.ready &&
        globalThis.deadvoxSaveTest.controller.restored !== undefined &&
        document.querySelector('#continue')?.disabled === false,
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    await page.click('#continue', { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.isEntered, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.waitForFunction(
      async () => {
        const { controller } = globalThis.deadvoxSaveTest;
        const locks = await navigator.locks.query();
        const activeSaveLock = [...locks.held, ...locks.pending].some((lock) => lock.name === 'deadvox-save-storage');
        return !controller.writing && controller.queued === undefined && !activeSaveLock;
      },
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    const beforeNavigation = await page.evaluate(async () => ({
      writing: globalThis.deadvoxSaveTest.controller.writing,
      locks: await navigator.locks.query(),
      namespace: globalThis.deadvoxSaveTest.controller.namespace,
      generation: globalThis.deadvoxSaveTest.controller.currentRecord?.generation,
      savedGeneration: globalThis.deadvoxSaveTest.controller.savedGeneration,
    }));
    process.stdout.write(`${browserName}: pre-navigation save state ${JSON.stringify(beforeNavigation)}\n`);
    assert.equal(beforeNavigation.writing, false);
    assert.equal(
      beforeNavigation.locks.held.some((lock) => lock.name === 'deadvox-save-storage'),
      false,
      'the page enters navigation without already holding a lock that would disqualify bfcache',
    );
    assert.equal(beforeNavigation.locks.pending.length, 0);
    await page.evaluate(() => {
      sessionStorage.removeItem('d144-held-writer');
      sessionStorage.removeItem('d144-writer-requested');
      sessionStorage.removeItem('d144-writer-trigger');
      sessionStorage.removeItem('d144-lock-snapshot');
      sessionStorage.removeItem('d144-pagehide');
      sessionStorage.removeItem('d144-pageshow');
    });
    if (browserName === 'chromium') {
      await page.evaluate(() => {
        globalThis.__d144HoldNextSave = true;
      });
    }
    const pumpUrl = new URL(appUrl);
    pumpUrl.searchParams.set('loadout', 'pump');
    await page.goto(pumpUrl.href, { timeout: STAGE_TIMEOUT_MS, waitUntil: 'commit' });
    await page.waitForFunction(() => sessionStorage.getItem('d144-lock-snapshot') !== null, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    const result = await page.evaluate(async () => {
      const locks = await navigator.locks.query();
      const controller = globalThis.deadvoxSaveTest?.controller;
      return {
        pagehide: JSON.parse(sessionStorage.getItem('d144-pagehide') ?? 'null'),
        writerRequested: sessionStorage.getItem('d144-writer-requested'),
        writerTrigger: sessionStorage.getItem('d144-writer-trigger'),
        lockSnapshot: JSON.parse(sessionStorage.getItem('d144-lock-snapshot') ?? 'null'),
        heldWriter: sessionStorage.getItem('d144-held-writer'),
        ready: controller?.ready ?? null,
        hasSavedWorld: controller ? controller.restored !== undefined : null,
        storageUnavailable: controller?.storageUnavailable ?? null,
        continueDisabled: document.querySelector('#continue')?.disabled,
        held: locks.held.filter((lock) => lock.name === 'deadvox-save-storage'),
        pending: locks.pending.filter((lock) => lock.name === 'deadvox-save-storage'),
        warnings: globalThis.__d144LockWarnings ?? [],
        namespace: controller?.namespace,
        generation: controller?.currentRecord?.generation,
        savedGeneration: controller?.savedGeneration,
        statusText: controller?.statusText,
        failure: controller?.failure,
        notRestoredReasons: performance.getEntriesByType('navigation')[0]?.notRestoredReasons ?? null,
      };
    });
    process.stdout.write(`${browserName}: in-tab loadout navigation ${JSON.stringify(result)}\n`);
    let restored;
    if (browserName === 'chromium' && result.pagehide?.persisted === true) {
      await page.goBack({ waitUntil: 'commit', timeout: STAGE_TIMEOUT_MS });
      await page.waitForFunction(() => sessionStorage.getItem('d144-pageshow') !== null, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
      await page.waitForFunction(
        async () => {
          const locks = await navigator.locks.query();
          const controller = globalThis.deadvoxSaveTest?.controller;
          const activeSaveLock = [...locks.held, ...locks.pending].some((lock) => lock.name === 'deadvox-save-storage');
          return controller && !controller.writing && controller.queued === undefined && !activeSaveLock;
        },
        undefined,
        { timeout: STAGE_TIMEOUT_MS },
      );
      restored = await page.evaluate(async () => ({
        locks: await navigator.locks.query(),
        pageshowPersisted: sessionStorage.getItem('d144-pageshow') === 'true',
        controllerEntered: globalThis.deadvoxSaveTest?.controller?.isEntered ?? null,
      }));
      process.stdout.write(`${browserName}: restored after navigation ${JSON.stringify(restored)}\n`);
    }
    if (browserName === 'chromium') {
      assert.equal(result.pagehide?.persisted, true, 'Chromium keeps the outgoing world in bfcache');
      assert.equal(result.writerRequested, null, 'leaving for bfcache must not request a save lock');
      assert.equal(result.writerTrigger, null);
      assert.equal(result.heldWriter, null, 'the cached page has not entered a lock-holding save');
      assert.deepEqual(result.lockSnapshot.held, [], 'the new page has no held lock');
      assert.deepEqual(result.lockSnapshot.pending, [], 'the new page has no reader queued behind a cached writer');
      assert.equal(result.lockSnapshot.ready, true);
      assert.equal(result.held.length, 0, 'the cached page leaves no exclusive writer lock');
      assert.equal(result.pending.length, 0, 'the new page has no shared request waiting on a cached writer');
      assert.equal(result.storageUnavailable, false);
      assert.equal(result.ready, true);
      assert.equal(result.hasSavedWorld, true);
      assert.equal(result.continueDisabled, false);
      assert.equal(result.warnings.length, 0);
      assert.equal(restored?.pageshowPersisted, true, 'Back restores the original world from bfcache');
      assert.equal(restored?.controllerEntered, true, 'Back restores the running world');
      assert.equal(
        restored?.locks.held.some((lock) => lock.name === 'deadvox-save-storage'),
        false,
        'restoring a cached page does not leave a save lock held',
      );
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
      await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.isEntered, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
    }
  } else if (busyLockOnly) {
    assert.equal(requestedAutosaveBackend, 'indexeddb', 'isolated busy-lock regression uses IndexedDB');
  } else if (autosaveOnly && requestedAutosaveBackend) {
    appBackends = [requestedAutosaveBackend];
  } else if (autosaveOnly) {
    appBackends = contract.autoBackend === 'opfs' ? ['opfs'] : ['indexeddb'];
  }
  for (const [index, backend] of appBackends.entries()) {
    if (index > 0) {
      await page.close();
      page = await context.newPage();
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', recordRequestFailure);
    }
    autosaveResults.push(await testTitleAndAutosave(backend));
  }

  // Independent of quarantined Continue/native gestures: seed a valid checkpoint, then hold a real writer lock.
  if (busyLockOnly) {
    const appUrl = browserStageUrl(
      stageId,
      `http://127.0.0.1:${address.port}/?seed=73&time=18%3A30&save-backend=indexeddb&save-test=1`,
    );
    await page.goto(appUrl, { timeout: STAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, {
      timeout: STAGE_TIMEOUT_MS,
    });
    await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
    await page.evaluate(() => globalThis.deadvoxSaveTest.triggerPeriodicCheckpoint());
    await page.waitForFunction(
      async () => {
        const { storage, namespace } = globalThis.deadvoxSaveTest;
        return Boolean(await storage.load(namespace));
      },
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    const originalSlots = await page.evaluate(async () => {
      const { storage, namespace } = globalThis.deadvoxSaveTest;
      const slots = await storage.readRawSlots(namespace);
      return { a: slots.a ? Array.from(slots.a) : null, b: slots.b ? Array.from(slots.b) : null };
    });
    const holder = await withTimeout('busy-lock holder page creation', context.newPage());
    holder.on('pageerror', (error) => pageErrors.push(error.message));
    // The lock owner needs a same-origin document, not another renderer/world/worker.
    const holderUrl = `http://127.0.0.1:${address.port}/?save-lock-holder=1`;
    await holder.route(holderUrl, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Save writer holder</title>' }),
    );
    await holder.goto(holderUrl, { timeout: STAGE_TIMEOUT_MS });
    await holder.evaluate(async () => {
      let acquired;
      const ready = new Promise((resolve) => {
        acquired = resolve;
      });
      globalThis.deadvoxHeldSaveLock = navigator.locks.request('deadvox-save-storage', { mode: 'exclusive' }, () => {
        acquired();
        return new Promise((resolve) => {
          globalThis.deadvoxReleaseSaveLock = resolve;
        });
      });
      await ready;
    });
    try {
      // Closing the seed session triggers its lifecycle checkpoint; it cannot steal the held writer lock.
      await page.close();
      page = await withTimeout('busy-lock relaunch page creation', context.newPage());
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', recordRequestFailure);
      await page.goto(appUrl, { timeout: STAGE_TIMEOUT_MS });
      try {
        await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, {
          timeout: STAGE_TIMEOUT_MS,
        });
      } catch (error) {
        throw new Error(`Busy-lock relaunch stalled at ${await page.locator('#save-status').textContent()}`, {
          cause: error,
        });
      }
      await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
      const busy = await page.evaluate(async () => ({
        status: document.querySelector('#save-status').textContent,
        newWorldLabel: document.querySelector('#go').textContent,
        retryVisible: document.querySelector('#save-rescan').checkVisibility(),
        continueDisabled: document.querySelector('#continue').disabled,
        locks: await navigator.locks.query(),
        warnings: globalThis.__d144LockWarnings,
      }));
      assert.match(busy.status, /World is still open or saving in another page/);
      assert.match(busy.newWorldLabel, /Play without saving/);
      assert.equal(busy.retryVisible, true);
      assert.equal(busy.continueDisabled, true);
      assert.equal(busy.locks.held.length, 1);
      assert.equal(busy.locks.held[0].mode, 'exclusive');
      assert.equal(busy.locks.pending.length, 0);
      const lockWarning = busy.warnings.find(([message]) => message === 'Deadvox save lock request timed out');
      assert.ok(lockWarning, 'lock timeout is reported to the browser console');
      assert.equal(lockWarning[1].requestedMode, 'shared');
      assert.ok(lockWarning[1].held.some((lock) => lock.mode === 'exclusive'));
      assert.ok(lockWarning[1].pending.some((lock) => lock.mode === 'shared'));
      assert.equal(lockWarning[1].holderIsAnotherClient, true);
      await holder.evaluate(async () => {
        globalThis.deadvoxReleaseSaveLock();
        await globalThis.deadvoxHeldSaveLock;
      });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT_MS }),
        page.click('#save-rescan', { timeout: STAGE_TIMEOUT_MS }),
      ]);
      await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, {
        timeout: STAGE_TIMEOUT_MS,
      });
      await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
      assert.equal(await page.locator('#continue').isEnabled(), true);
      assert.equal(await page.locator('#save-rescan').isVisible(), false);
      const recoveredSlots = await page.evaluate(async () => {
        const { storage, namespace } = globalThis.deadvoxSaveTest;
        const slots = await storage.readRawSlots(namespace);
        return { a: slots.a ? Array.from(slots.a) : null, b: slots.b ? Array.from(slots.b) : null };
      });
      assert.deepEqual(recoveredSlots, originalSlots);
      const hungWriter = await page.evaluate(async () => {
        const Storage = globalThis.deadvoxSaveTest.storage.constructor;
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('d144-hung-worker'));
        const namespace = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        const storage = new Storage({
          backend: 'indexeddb',
          requestTimeoutMs: 5000,
          writeLockHoldTimeoutRealMs: 1000,
          testCrashAt: 'after-commit',
        });
        await storage.status();
        let message = '';
        try {
          await storage.save(namespace, async () => Uint8Array.of(11, 22, 33));
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
        }
        const locks = await navigator.locks.query();
        const reader = new Storage({ backend: 'indexeddb' });
        const record = await reader.load(namespace);
        return {
          message,
          held: locks.held.filter((lock) => lock.name === 'deadvox-save-storage'),
          generation: record?.generation,
          payload: record ? Array.from(record.payload) : null,
          warnings: globalThis.__d144LockWarnings,
        };
      });
      assert.match(hungWriter.message, /lock-hold deadline/);
      assert.deepEqual(hungWriter.held, []);
      assert.equal(hungWriter.generation, 1);
      assert.deepEqual(hungWriter.payload, [11, 22, 33]);
      assert.ok(hungWriter.warnings.some(([message]) => message === 'Deadvox save writer lock hold timed out'));
      process.stdout.write(`${browserName}: busy-lock diagnostics and hung-worker lock release passed\n`);
    } finally {
      await holder.evaluate(() => globalThis.deadvoxReleaseSaveLock());
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
