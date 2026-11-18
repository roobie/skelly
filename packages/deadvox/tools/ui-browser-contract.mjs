// biome-ignore-all lint/correctness/noNodejsModules: opt-in end-to-end test launches local Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: readiness polling is deliberate
// biome-ignore-all lint/style/noProcessEnv: local test-runner configuration is env-driven
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative CDP contract assertions

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from 'node:util';
import graphicsFile from '../../mods/skelly.graphics/graphics.json' with { type: 'json' };
import baseCursor from '../../mods/skelly.ui/cursor.json' with { type: 'json' };
import baseUi from '../../mods/skelly.ui/ui.json' with { type: 'json' };
import { launchChromium } from '../test/browser/chromium.mjs';
import { gameUrl, inlineStartMod } from '../test/browser/gameUrl.mjs';
import { cdpKey, pressCdpAction } from '../test/browser/input-actions.mjs';
import {
  dispatchMenuPointerClick,
  dispatchMenuPointerMove,
  pressWithDrawnCursor,
} from '../test/browser/menu-pointer.mjs';
import { browserStageArgs, browserStageMode, browserStageUrl } from '../test/browser/stage-mode.mjs';
import { createStageServer, listeningPort } from '../test/browser/stageServer.mjs';

/**
 * @import { Browser, CDPSession, Page } from 'playwright'
 * @import { ViteDevServer } from 'vite'
 * @import { SessionMetricsV1 } from '@skelly/presentation/internal/presentation/playtestTools.ts'
 * @import { PlayTestHandle } from '../test/browser/playTestHandle.ts'
 */
/** @typedef {{ x: number; y: number }} ClientPoint */
/**
 * The fields the contract reads from play's attempt download; see `packages/presentation/src/presentation/play.ts`,
 * `scenarioAttemptFile`.
 * @typedef {object} AttemptDownload
 * @property {number} seed
 * @property {string} worldId
 * @property {string} characterId
 * @property {string} outcome
 * @property {unknown} death
 * @property {unknown} run
 * @property {number} elapsedGameSeconds
 */

const stageHash = { debug: true, post: false, sunshadow: false, torchshadow: false };
const houseStartMod = inlineStartMod('fixture.ui-browser-contract.house', {
  density: null,
  id: 'ui_browser_contract_house_start',
  kit: [
    { condition: 0.7, count: 1, destination: { kind: 'worn' }, id: 'jeans', item: 'jeans' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'sneakers', item: 'sneakers' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'hoodie', item: 'hoodie' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'beans', item: 'canned_beans' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'matches', item: 'matches' },
    { count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 }, id: 'bandages', item: 'bandage' },
  ],
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
  site: 'testHouse',
  skills: {},
  startTimeGameTimeOfDay: '10:00',
  storeys: 1,
  wounds: [],
});

const graphicsArgument = /^--(?:disable-gpu|use-gl|use-angle|enable-unsafe-swiftshader)(?:=|$)/;
const cwd = process.cwd();
// The game's style sheet as a plain file URL, for a probe document that links it.
const styleSheetUrl = `/@fs${resolve(cwd, '../presentation/src/ui/style.css')}`;
const renderMode = browserStageMode('ui-browser-contract');
const launchExtraArgs = ['--disable-extensions', '--password-store=basic', '--window-size=1280,900'];
const launchArgs = browserStageArgs('ui-browser-contract', launchExtraArgs);
const graphicsArgs = launchArgs.filter((arg) => graphicsArgument.test(arg));
/** @type {{ phase: string, lastHttpStatus: { url: string, status: number } | undefined, lastError: string | undefined }} */
const discovery = { phase: 'Vite server', lastHttpStatus: undefined, lastError: undefined };
/** @type {{ state: string, port: number | undefined, error: string | undefined }} */
const viteDiagnostics = { state: 'not-started', port: undefined, error: undefined };
/** @type {string[]} */
const pageErrors = [];
/** @type {ViteDevServer | undefined} */
let vite;
/** @type {Browser | undefined} */
let browser;
/** @type {CDPSession | undefined} */
let stageCdp;
/** @type {Page | undefined} */
let stagePage;
let stageOrigin;
let stageUrl;
let graphics;
/**
 * @param {string} name
 * @param {() => Promise<unknown> | undefined} action
 */
const cleanup = async (name, action) => {
  try {
    await action();
  } catch (error) {
    process.stderr.write(`UI_CLEANUP_WARNING ${name}: ${String(error)}\n`);
  }
};
/**
 * @param {() => unknown} test
 * @param {string} message
 */
const waitFor = async (test, message, timeout = 30_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await test()) {
      return;
    }
    await delay(Math.min(100, Math.max(0, until - Date.now())));
  }
  throw new Error(`Timed out: ${message}; last discovery error: ${discovery.lastError ?? 'none'}`);
};

try {
  vite = await createStageServer({
    root: cwd,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      {
        name: 'ui-contract-observation',
        enforce: 'pre',
        transform(code, id) {
          const file = /** @type {string} */ (id.split('?')[0]);
          /** @type {[suffix: string, marker: string, observation: string][]} */
          // The debug tools' hooks and spawn status stay inside the debug module: the play-test handle
          // reaches only the runtime it returns.
          const observations = [
            [
              '/src/debug/index.ts',
              '  const runtime: DebugRuntime = {',
              '  globalThis.uiContractDebug = { hooks, get spawnStatus() { return spawnStatus; } };\n',
            ],
          ];
          let observed = code;
          let found = false;
          for (const [suffix, marker, observation] of observations) {
            if (file.endsWith(suffix)) {
              assert.equal(observed.split(marker).length - 1, 1, `UI observer anchor in ${suffix}`);
              observed = observed.replace(marker, observation + marker);
              found = true;
            }
          }
          return found ? observed : null;
        },
      },
    ],
  });
  await vite.listen();
  const port = listeningPort(vite);
  viteDiagnostics.state = 'listening';
  viteDiagnostics.port = port;
  stageOrigin = `http://127.0.0.1:${port}`;
  stageUrl = browserStageUrl(
    'ui-browser-contract',
    gameUrl(stageOrigin, { harness: { 'play-test': 1 }, hash: stageHash }),
  );
  discovery.phase = 'Vite ready';
  const viteResponse = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(30_000) });
  discovery.lastHttpStatus = { url: viteResponse.url, status: viteResponse.status };
  assert(viteResponse.ok, `Vite root responds with HTTP ${viteResponse.status}`);
  await viteResponse.body?.cancel();
  process.stdout.write(
    `UI_BROWSER_LAUNCH ${JSON.stringify({
      launcher: 'playwright-managed-cdp-pipe',
      graphicsArgs,
      windowSize: '1280,900',
      stageUrl,
    })}\n`,
  );
  browser = await launchChromium('ui-browser-contract', {
    headless: true,
    args: launchExtraArgs,
    timeout: 30_000,
  });
  browser.on('disconnected', () => {
    discovery.lastError = 'Chromium disconnected';
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  stagePage = page;
  await page.addInitScript(() => {
    /** @param {string} selector */
    const element = (selector) => {
      const found = document.querySelector(selector);
      if (!(found instanceof HTMLElement)) {
        throw new Error(`No HTML element matches ${selector}`);
      }
      return found;
    };
    globalThis.uiContract = {
      element,
      input: (selector) => {
        const found = element(selector);
        if (!(found instanceof HTMLInputElement)) {
          throw new Error(`${selector} is not an input`);
        }
        return found;
      },
      frames: 0,
      simulationResumes: 0,
      queuedMoves: [],
      debugReadout: undefined,
      webglContextRequests: [],
      inputSurface: undefined,
      pointerCalls: { request: 0, exit: 0 },
      pointerLockErrors: 0,
      rejectNextPointerLock: false,
      setPointerLocked: () => {
        throw new Error('The pointer-lock stub is not installed');
      },
      keyEvents: [],
      lastHitTest: undefined,
      lastForwardedClick: null,
      cursorBeforeClick: undefined,
      f4Prevented: false,
      metricsBlob: undefined,
      metricsFilename: undefined,
      snapshotMeasurement: undefined,
      copiedSnapshot: undefined,
      windowBlurs: 0,
    };
    const observed = globalThis.uiContract;
    // Play publishes its handle before its first frame, so these observers see every step, move and readout.
    Object.defineProperty(globalThis, 'skellyPlayTest', {
      configurable: true,
      /** @param {PlayTestHandle} handle */
      set(handle) {
        Object.defineProperty(globalThis, 'skellyPlayTest', { configurable: true, writable: true, value: handle });
        const { stepper, session, debugTools } = handle;
        const step = stepper.step.bind(stepper);
        stepper.step = (realDt, options) => {
          const result = step(realDt, options);
          if (!session.sim.paused) {
            observed.simulationResumes += 1;
          }
          return result;
        };
        const enqueue = session.queue.enqueue.bind(session.queue);
        session.queue.enqueue = (...args) => {
          const result = enqueue(...args);
          if (result.ok) {
            observed.queuedMoves.push(structuredClone(result.job));
          }
          return result;
        };
        if (debugTools) {
          const update = debugTools.update.bind(debugTools);
          debugTools.update = (readout) => {
            observed.debugReadout = readout;
            update(readout);
          };
        }
      },
    });
    const countFrame = () => {
      observed.frames += 1;
      requestAnimationFrame(countFrame);
    };
    requestAnimationFrame(countFrame);
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    // The wrapper forwards every other context type unchanged, so it keeps the native overloads.
    HTMLCanvasElement.prototype.getContext = /** @type {HTMLCanvasElement['getContext']} */ (
      /**
       * @this {HTMLCanvasElement}
       * @param {string} type
       * @param {...unknown} args
       */
      function (type, ...args) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) {
          observed.webglContextRequests.push(type);
          return null;
        }
        return nativeGetContext.call(this, type, ...args);
      }
    );
  });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      pageErrors.push(message.text());
    }
  });
  const browserCdp = await context.newCDPSession(page);
  stageCdp = browserCdp;
  discovery.phase = 'Page navigation';
  await page.goto(stageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  discovery.phase = 'Page ready';
  /** @type {CDPSession['send']} */
  const send = (method, params) => browserCdp.send(method, params);
  // The shared key driver evaluates its own binding lookup as an expression.
  /** @param {string} expression */
  const evaluateExpression = (expression) => page.evaluate(expression);
  /** @param {string} selector */
  const hidden = (selector) => page.evaluate((target) => uiContract.element(target).hidden, selector);
  /** @param {string} selector */
  const shown = async (selector) => !(await hidden(selector));
  /** @param {string} selector */
  const text = (selector) => page.evaluate((target) => uiContract.element(target).textContent ?? '', selector);
  /** @param {string} selector */
  const checked = (selector) => page.evaluate((target) => uiContract.input(target).checked, selector);
  /** @param {string} selector */
  const inputValue = (selector) => page.evaluate((target) => uiContract.input(target).value, selector);
  /**
   * @param {string} selector
   * @param {string} name
   */
  const attribute = (selector, name) =>
    page.evaluate(
      ([target, key]) => uiContract.element(target).getAttribute(key),
      /** @type {const} */ ([selector, name]),
    );
  /** @param {string} selector */
  const click = (selector) => page.evaluate((target) => uiContract.element(target).click(), selector);
  /**
   * @param {string} selector
   * @param {ScrollBehavior} [behavior]
   */
  const scrollIntoView = (selector, behavior) =>
    page.evaluate(
      ([target, scroll]) =>
        uiContract.element(target).scrollIntoView({ block: 'center', ...(scroll && { behavior: scroll }) }),
      /** @type {const} */ ([selector, behavior]),
    );
  /** @param {string} key */
  const storedHasOwn = (key, field = '') =>
    page.evaluate(
      ([storageKey, name]) =>
        Object.hasOwn(/** @type {object} */ (JSON.parse(localStorage.getItem(storageKey) ?? '{}')), name),
      /** @type {const} */ ([key, field]),
    );
  const frames = () => page.evaluate(() => uiContract.frames);
  const pointerCalls = () => page.evaluate(() => uiContract.pointerCalls);
  /** @param {boolean} locked */
  const setPointerLocked = (locked) => page.evaluate((value) => uiContract.setPointerLocked(value), locked);
  const clickInputSurface = () =>
    page.evaluate(() => {
      if (!uiContract.inputSurface) {
        throw new Error('The pointer-lock stub is not installed');
      }
      uiContract.inputSurface.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  /** @param {number} deltaY */
  const wheelInputSurface = (deltaY, deltaMode = 0) =>
    page.evaluate(
      (delta) => {
        if (!uiContract.inputSurface) {
          throw new Error('The pointer-lock stub is not installed');
        }
        uiContract.inputSurface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...delta }));
      },
      { deltaY, deltaMode },
    );
  /**
   * @param {number} before
   * @param {string} label
   */
  const nextFrame = async (before, label) =>
    waitFor(
      () => page.evaluate((frame) => uiContract.frames > frame, before),
      `${label} reaches the next animation frame`,
    );
  /**
   * @param {string} code
   * @param {string} key
   * @param {number | undefined} virtualKey
   */
  const press = async (code, key, virtualKey) => {
    const before = await frames();
    const keyEvent = { code, key, ...(virtualKey === undefined ? {} : { windowsVirtualKeyCode: virtualKey }) };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyEvent });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyEvent });
    await nextFrame(before, `${code} input`);
  };
  /** @param {string} insert */
  const typeText = async (insert) => send('Input.insertText', { text: insert });
  /**
   * @param {string} code
   * @param {number} [from] the first recorded event to search
   */
  const lastKeyEvent = async (code, from = 0) =>
    page.evaluate(
      ([wanted, first]) => uiContract.keyEvents.slice(first).findLast((event) => event.code === wanted),
      /** @type {const} */ ([code, from]),
    );

  await waitFor(
    () => page.evaluate(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false'),
    'accepted-launch readiness',
  );
  discovery.phase = 'UI assertions';
  const keyBindings = await page.evaluate(async () => {
    const [{ inputBindings }, { NATIVE_INPUTS }] = await Promise.all([
      import('/src/product/input.ts'),
      import('/@stage/@skelly/engine/input'),
    ]);
    const [mainMenu] = inputBindings.chords('ui.main-menu-toggle');
    const browserMenuBar = NATIVE_INPUTS.find((native) => native.code === 'F10');
    if (!(mainMenu && browserMenuBar)) {
      throw new Error('The contract needs a bound main-menu key and the native F10 input');
    }
    return {
      mainMenu: { code: mainMenu.code, label: inputBindings.label('ui.main-menu-toggle') },
      browserMenuBar: { code: browserMenuBar.code },
    };
  });
  /** @param {{ code: string }} binding */
  const pressBinding = async (binding) => {
    const key = cdpKey(binding.code);
    await press(key.code, key.key, key.windowsVirtualKeyCode);
  };
  /** @param {string} actionId */
  const action = async (actionId) => {
    const before = await frames();
    await pressCdpAction(evaluateExpression, send, actionId);
    await nextFrame(before, `${actionId} input`);
  };
  let inputFrame;

  /** @param {string} screen */
  const assertSaveNote = async (screen) =>
    assert.equal(
      await page.evaluate(() => {
        const owner = document.querySelector('#save-note .fact-detail');
        const fact = owner?.querySelector('[role="tooltip"]');
        if (
          !(owner instanceof HTMLElement && fact) ||
          uiContract.element('#overlay').hidden ||
          owner.getClientRects().length === 0 ||
          owner.tabIndex < 0 ||
          !fact.textContent?.trim()
        ) {
          return false;
        }
        owner.focus();
        const focused = fact.getClientRects().length > 0;
        owner.blur();
        return focused;
      }),
      true,
      `${screen} exposes the save-storage fact through keyboard focus on its label`,
    );
  await assertSaveNote('title');
  assert.equal(
    await page.evaluate(async () => {
      const { controlsCardRows } = await import('/@stage/@skelly/presentation/internal/presentation/controls.ts');
      const { inputBindings } = await import('/src/product/input.ts');
      const controls = uiContract.element('#controls');
      const entries = [...controls.querySelectorAll('dt')];
      const rows = controlsCardRows(inputBindings, true);
      // A computed track list separates its tracks by single spaces.
      const columns = getComputedStyle(controls).gridTemplateColumns.trim().split(' ');
      const cardElement = uiContract.element('#overlay .card');
      const card = cardElement.getBoundingClientRect();
      const shell = cardElement.parentElement;
      const shellWidth = shell ? Number.parseFloat(getComputedStyle(shell).width) : Number.NaN;
      return (
        rows.length > 0 &&
        entries.length === rows.length &&
        entries.every(
          (key, index) =>
            key.nextElementSibling?.tagName === 'DD' &&
            key.textContent === rows[index]?.keys &&
            key.nextElementSibling.textContent === rows[index]?.action,
        ) &&
        columns.length === 1 &&
        Number.isFinite(shellWidth) &&
        card.width <= shellWidth &&
        card.left >= 0 &&
        card.right <= innerWidth
      );
    }),
    true,
    'binding-derived controls stack in one column within the scroll shell width and viewport',
  );
  const feedback = await page.evaluate(async () => {
    const [{ getBuildRevision }, { PLAYTEST_FEEDBACK_FIELD_IDS }] = await Promise.all([
      import('/@stage/@skelly/engine/packs'),
      import('/@stage/@skelly/presentation/ui'),
    ]);
    const link = uiContract.element('#playtest-feedback');
    if (!(link instanceof HTMLAnchorElement)) {
      throw new Error('#playtest-feedback is not a link');
    }
    const url = new URL(link.href);
    return {
      template: url.searchParams.get('template'),
      seed: url.searchParams.get(PLAYTEST_FEEDBACK_FIELD_IDS.seed),
      browser: url.searchParams.get(PLAYTEST_FEEDBACK_FIELD_IDS.browser),
      build: url.searchParams.get(PLAYTEST_FEEDBACK_FIELD_IDS.build),
      revision: getBuildRevision(),
    };
  });
  assert.equal(feedback.template, 'playtest-feedback.yml', 'feedback link names the playtest issue form');
  assert.equal(feedback.browser, await page.evaluate(() => navigator.userAgent), 'feedback link includes the browser');
  assert.equal(feedback.build, feedback.revision, 'feedback link includes the build');
  const captureMetricsDownload = () =>
    page.evaluate(() => {
      uiContract.metricsBlob = undefined;
      const createObjectURL = URL.createObjectURL.bind(URL);
      const revokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (!(blob instanceof Blob) || blob.type !== 'application/json') {
          return createObjectURL(blob);
        }
        uiContract.metricsBlob = blob;
        return 'blob:playtest-metrics';
      };
      URL.revokeObjectURL = (url) => {
        if (url !== 'blob:playtest-metrics') {
          revokeObjectURL(url);
        }
      };
      HTMLAnchorElement.prototype.click = /** @this {HTMLAnchorElement} */ function () {
        if (this.download) {
          uiContract.metricsFilename = this.download;
        }
      };
    });
  const downloadedMetrics = () =>
    page.evaluate(async () => {
      const blob = uiContract.metricsBlob;
      if (!blob) {
        throw new Error('No metrics download was captured');
      }
      return /** @type {unknown} */ (JSON.parse(await blob.text()));
    });
  await captureMetricsDownload();
  await page.evaluate(() => {
    addEventListener('keydown', (event) => {
      if (event.code === 'F4') {
        setTimeout(() => {
          uiContract.f4Prevented = event.defaultPrevented;
        }, 0);
      }
    });
  });
  await page.evaluate(() => {
    // The render-free engine uses #view as its input target instead of creating a renderer canvas.
    const inputSurface = document.querySelector('canvas') ?? uiContract.element('#view');
    let locked = false;
    uiContract.inputSurface = inputSurface;
    document.addEventListener('pointerlockerror', () => {
      uiContract.pointerLockErrors += 1;
    });
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => (locked ? inputSurface : null),
    });
    inputSurface.requestPointerLock = () => {
      uiContract.pointerCalls.request += 1;
      if (uiContract.rejectNextPointerLock) {
        uiContract.rejectNextPointerLock = false;
        setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
        return Promise.reject(new Error('pointer lock refused by contract stub'));
      }
      locked = true;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      uiContract.pointerCalls.exit += 1;
      locked = false;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    uiContract.setPointerLocked = (value) => {
      locked = value;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const hitTest = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x, y) => {
      const target = hitTest(x, y);
      uiContract.lastHitTest = {
        x,
        y,
        insideGo: Boolean(target?.closest('#go')),
        insideSaveNote: Boolean(target?.closest('#save-note')),
        buttonText: target?.closest('button')?.textContent?.trim() ?? '',
      };
      return target;
    };
    document.addEventListener(
      'click',
      (event) => {
        if (event.target !== inputSurface) {
          uiContract.lastForwardedClick = { x: event.clientX, y: event.clientY, hitTest: uiContract.lastHitTest };
        }
      },
      true,
    );
    addEventListener('keydown', (event) => {
      const { code } = event;
      setTimeout(() => uiContract.keyEvents.push({ code, defaultPrevented: event.defaultPrevented }), 0);
    });
    uiContract.element('#go').click();
    uiContract.pointerCalls.request = 0;
  });
  await waitFor(
    () =>
      page.evaluate(
        () =>
          Boolean(document.querySelector('#debug-ui-root')) &&
          uiContract.element('#world-loading').dataset.state === 'ready' &&
          uiContract.element('#world-loading').hidden,
      ),
    'post-acceptance world readiness',
  );
  // The tokens go to a document of the probe's own (an iframe with the game's style sheet), so the live game's root
  // and HUD stay untouched. Spacing and scale are measured apart, so neither passes on the other's change.
  const uiTokens = await page.evaluate(
    async ({ ui, cursorFile, styleSheet }) => {
      const { buildRegistry } = await import('/@stage/@skelly/engine/content');
      const { applyUiTokens } = await import('/@stage/@skelly/presentation/ui');
      const { productAssets } = await import('/src/product/assets.ts');
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position: fixed; left: 0; top: 0; width: 640px; height: 360px; visibility: hidden';
      frame.srcdoc = `<!doctype html><link rel="stylesheet" href="${styleSheet}"><button class="inv-option">Probe</button>`;
      const loaded = new Promise((done) => frame.addEventListener('load', done, { once: true }));
      document.body.append(frame);
      await loaded;
      const probeDocument = frame.contentDocument;
      const probeWindow = frame.contentWindow;
      const probe = probeDocument?.querySelector('.inv-option');
      if (!(probeDocument && probeWindow && probe)) {
        throw new Error('The UI probe frame did not load its button');
      }
      const core = ui.ui.find((row) => row.id === 'core');
      /** @param {{ spacing: number; hudScale: number }} tuning */
      const measure = (tuning) => {
        const sound = {
          id: 'player_nope',
          description: 'fixture refusal',
          variants: ['assets/audio/nope.ogg'],
          gain: 0.5,
          pitchJitter: [1, 1],
          gainJitter: [1, 1],
          minIntervalSimSeconds: 0.75,
          category: 'body',
          noise: { enabled: false, radiusMetres: 1 },
        };
        const { registry, issues } = buildRegistry([
          { source: 'ui-probe-sounds.json', data: { sounds: [sound] } },
          { source: '../../../mods/skelly.ui/cursor.json', data: cursorFile },
          { source: 'ui-probe.json', data: { ui: [{ ...core, refusalSound: sound.id, ...tuning }] } },
        ]);
        if (issues.length > 0) {
          throw new Error(`Invalid UI probe fixture: ${JSON.stringify(issues)}`);
        }
        applyUiTokens(registry, probeDocument.documentElement, {
          report: (message) => {
            throw new Error(message);
          },
          files: productAssets.cursors,
        });
        const style = probeWindow.getComputedStyle(probe);
        return { padding: Number.parseFloat(style.paddingLeft), fontSize: Number.parseFloat(style.fontSize) };
      };
      const base = measure({ spacing: 1, hudScale: 1 });
      const spaced = measure({ spacing: 2, hudScale: 1 });
      const scaled = measure({ spacing: 1, hudScale: 1.25 });
      frame.remove();
      return { base, spaced, scaled };
    },
    { ui: baseUi, cursorFile: baseCursor, styleSheet: styleSheetUrl },
  );
  /**
   * @param {number} actual
   * @param {number} expected
   */
  const near = (actual, expected) => Math.abs(actual - expected) < 0.01;
  assert.ok(
    uiTokens.base.padding > 0 && uiTokens.base.fontSize > 0,
    `the probe takes the game's style sheet: ${JSON.stringify(uiTokens)}`,
  );
  assert.ok(
    near(uiTokens.spaced.padding, 2 * uiTokens.base.padding) && near(uiTokens.spaced.fontSize, uiTokens.base.fontSize),
    `spacing scales padding and leaves text size alone: ${JSON.stringify(uiTokens)}`,
  );
  assert.ok(
    near(uiTokens.scaled.fontSize, 1.25 * uiTokens.base.fontSize) &&
      near(uiTokens.scaled.padding, 1.25 * uiTokens.base.padding),
    `HUD scale scales text and spacing together: ${JSON.stringify(uiTokens)}`,
  );
  graphics = await page.evaluate(
    (mode) => ({ renderMode: mode, webglContextRequests: uiContract.webglContextRequests.slice() }),
    renderMode,
  );
  process.stdout.write(
    `UI_BROWSER_GRAPHICS ${JSON.stringify({
      launcher: 'playwright-managed-cdp-pipe',
      browserVersion: browser.version(),
      graphicsArgs,
      graphics,
    })}\n`,
  );
  await pressBinding(keyBindings.mainMenu);
  await page.evaluate(() => document.exitPointerLock());
  await press('F3', 'F3', 114);
  assert.equal(await hidden('#f3-debug-overlay'), true, 'F3 no longer toggles the performance overlay');
  await action('debug.performance-toggle');
  await waitFor(() => shown('#f3-debug-overlay'), 'gated performance overlay opens');
  assert.equal(
    await page.evaluate(() => {
      const overlay = uiContract.element('#f3-debug-overlay').textContent ?? '';
      const stats = uiContract.debugReadout;
      return (
        stats !== undefined &&
        [stats.snapshotLastMs, stats.snapshotP95Ms].every((value) => overlay.includes(value.toFixed(3))) &&
        overlay.includes(String(stats.snapshotCount))
      );
    }),
    true,
    'performance overlay renders the owner snapshot statistics',
  );
  const f4Prevented = () => page.evaluate(() => uiContract.f4Prevented);
  await waitFor(f4Prevented, 'F4 prevention');
  assert.equal(await f4Prevented(), true, 'F4 prevents the browser default');
  await action('debug.performance-toggle');
  await waitFor(() => hidden('#f3-debug-overlay'), 'gated performance overlay closes');
  await action('debug.panel-toggle');
  const requestedCalendar = await page.evaluate(async () => {
    const { nextTimeOfDay, parseTimeOfDay } = await import('/@stage/@skelly/engine/sim');
    const morning = parseTimeOfDay('08:00');
    if (morning === undefined) {
      throw new Error('08:00 is not a time of day');
    }
    const expected = nextTimeOfDay(skellyPlayTest.session.sim.calendar, morning);
    uiContract.input('#debug-time').value = '08:00';
    uiContract.element('#set-debug-time').click();
    uiContract.element('#reveal-actors').click();
    return expected;
  });
  await waitFor(
    () => page.evaluate((calendar) => skellyPlayTest.session.sim.calendar >= calendar, requestedCalendar),
    'debug-time request reaches its next calendar occurrence',
  );
  await waitFor(
    () =>
      page.evaluate(async () => {
        const { formatClock } = await import('/@stage/@skelly/engine/sim');
        return (uiContract.element('#debug-readout').textContent ?? '').includes(
          formatClock(skellyPlayTest.session.sim.calendar),
        );
      }),
    'debug readout follows the owner clock',
  );
  assert.equal(await attribute('#reveal-actors', 'aria-pressed'), 'true');
  const snapshotBefore = await text('#snapshot-measurement-result');
  await page.evaluate(() => {
    const { hooks } = uiContractDebug;
    const measure = hooks.measureSnapshot.bind(hooks);
    hooks.measureSnapshot = () => {
      const measurement = measure();
      uiContract.snapshotMeasurement = measurement;
      return measurement;
    };
    uiContract.element('#measure-snapshot').click();
  });
  await waitFor(
    () =>
      page.evaluate(
        () =>
          uiContract.snapshotMeasurement !== undefined &&
          !uiContract.element('#copy-snapshot-result').matches(':disabled'),
      ),
    'on-demand snapshot measurement enables copying',
  );
  const measurement = await page.evaluate(() => uiContract.snapshotMeasurement);
  assert.ok(measurement, 'the measurement reaches the panel');
  assert.ok(measurement.batchCount > 0 && measurement.batchSize > 0 && measurement.individualCaptureCount > 0);
  assert.equal(measurement.batchMeanDurationsMs.length, measurement.batchCount);
  assert.ok(
    [
      measurement.batchMeanP50Ms,
      measurement.batchMeanP95Ms,
      measurement.individualCaptureP95Ms,
      measurement.individualCaptureMaxMs,
    ].every(Number.isFinite),
  );
  assert.equal(measurement.netStateUnchanged, true, 'measurement preserves the live state');
  assert.equal(measurement.timerQuantumCrossCheckPassed, true, 'native timer fits its known browser profile');
  const snapshotResult = await text('#snapshot-measurement-result');
  assert.notEqual(snapshotResult, snapshotBefore, 'measurement updates the live result line');
  for (const value of [
    measurement.batchMeanP50Ms,
    measurement.batchMeanP95Ms,
    measurement.individualCaptureP95Ms,
    measurement.individualCaptureMaxMs,
  ]) {
    assert.ok(snapshotResult.includes(value.toFixed(3)), 'result renders measured statistics');
  }
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        /** @param {string} copied */
        writeText: (copied) => {
          uiContract.copiedSnapshot = copied;
          return Promise.resolve();
        },
      },
    });
    uiContract.element('#copy-snapshot-result').click();
  });
  assert.equal(
    await page.evaluate(() => uiContract.copiedSnapshot),
    snapshotResult,
    'copy button routes the displayed result',
  );
  assert.equal(
    await page.evaluate(() => getComputedStyle(uiContract.element('#snapshot-measurement-result')).userSelect),
    'text',
    'snapshot result line is selectable',
  );
  await click('#export-metrics');
  const exportedMetrics = /** @type {AttemptDownload} */ (await downloadedMetrics());
  const liveAttempt = await page.evaluate(() => {
    const { session } = skellyPlayTest;
    return { seed: session.sim.seed, run: session.scenarioRun };
  });
  assert.ok(liveAttempt.run, 'default entry starts a scenario attempt');
  assert.equal(feedback.seed, String(liveAttempt.seed), 'feedback link includes the game seed');
  assert.deepEqual(exportedMetrics.run, liveAttempt.run, 'download includes the live scenario progress');
  assert.equal(exportedMetrics.seed, liveAttempt.seed, 'download identifies the live world seed');
  assert.equal(exportedMetrics.outcome, 'running', 'download identifies an unfinished attempt');
  assert.equal(exportedMetrics.death, null);
  assert.ok(Number.isFinite(exportedMetrics.elapsedGameSeconds) && exportedMetrics.elapsedGameSeconds >= 0);
  assert.ok(exportedMetrics.worldId.length > 0 && exportedMetrics.characterId.length > 0);
  const metricsFilename = () => page.evaluate(() => uiContract.metricsFilename);
  assert.equal(
    await metricsFilename(),
    `skelly-attempt-${exportedMetrics.characterId}.json`,
    'attempt download is named for its character',
  );
  await action('debug.panel-toggle');
  await page.evaluate(() => {
    uiContract.element('#go').click();
    uiContract.pointerCalls.request = 0;
    uiContract.pointerCalls.exit = 0;
  });
  const emptyQuickbarReady = () =>
    page.evaluate(async () => {
      const { quickbarViewModel } = await import('/@stage/@skelly/presentation/internal/ui/hud.ts');
      const { inputBindings } = await import('/src/product/input.ts');
      const { quickbar, inventory } = skellyPlayTest.session;
      const expected = quickbarViewModel(quickbar, inventory, inputBindings).slots;
      const slots = [...document.querySelectorAll('#quickbar .qb-slot')];
      return (
        expected.length > 0 &&
        expected.every((slot) => !slot.filled) &&
        slots.length === expected.length &&
        slots.every(
          (slot, index) =>
            slot.classList.contains('qb-empty') &&
            slot.querySelector('.qb-key')?.textContent === expected[index]?.key &&
            slot.querySelector('.qb-name')?.textContent === expected[index]?.name &&
            slot.querySelector('.qb-where')?.textContent === expected[index]?.where,
        )
      );
    });
  await waitFor(emptyQuickbarReady, 'rendered empty quickbar slots');
  assert.equal(await emptyQuickbarReady(), true, 'rendered empty quickbar slots match their owner view model');
  /** @type {ClientPoint} */
  let cursor = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  /** @param {string} selector */
  const centreOf = (selector) =>
    page.evaluate((target) => {
      const rect = uiContract.element(target).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, selector);
  /** The drawn cursor's tip, which a pointing hand shows 4 px right of its box. */
  const drawnCursorTip = () =>
    page.evaluate(() => {
      const node = uiContract.element('#game-cursor');
      const rect = node.getBoundingClientRect();
      return { x: rect.left + (node.classList.contains('hand') ? 4 : 0), y: rect.top };
    });
  /** @param {ClientPoint} position */
  const moveCursorTo = async (position) => {
    await page.evaluate(dispatchMenuPointerMove, {
      movementX: position.x - cursor.x,
      movementY: position.y - cursor.y,
    });
    cursor = position;
    await nextFrame(await frames(), 'cursor move');
  };
  /**
   * @param {string} type
   * @param {number} button
   * @param {number} buttons
   * @param {ClientPoint} position
   */
  const dispatchPointerAt = async (type, button, buttons, position) =>
    page.evaluate(
      ({ type: eventType, button: pressed, buttons: held, position: { x, y } }) => {
        if (!uiContract.inputSurface) {
          throw new Error('The pointer-lock stub is not installed');
        }
        uiContract.inputSurface.dispatchEvent(
          new PointerEvent(eventType, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: pressed,
            buttons: held,
            clientX: x,
            clientY: y,
          }),
        );
      },
      { type, button, buttons, position },
    );
  /**
   * @param {string} selector
   * @param {'center' | 'edge'} [anchor]
   */
  const clickAt = async (selector, anchor = 'center') => {
    await page.evaluate(() => {
      uiContract.lastForwardedClick = null;
    });
    const position = await page.evaluate(
      ([target, at]) => {
        const rect = uiContract.element(target).getBoundingClientRect();
        return at === 'edge'
          ? { x: rect.left + 1, y: rect.top + 1 }
          : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      },
      /** @type {const} */ ([selector, anchor]),
    );
    await moveCursorTo(position);
    assert.equal(
      await page.evaluate(
        ({ target, at }) => document.elementFromPoint(at.x, at.y)?.closest(target) === uiContract.element(target),
        { target: selector, at: position },
      ),
      true,
      `drawn cursor reaches ${selector}`,
    );
    await page.evaluate(() => {
      const drawn = uiContract.element('#game-cursor');
      const rect = drawn.getBoundingClientRect();
      const style = getComputedStyle(drawn);
      uiContract.cursorBeforeClick = {
        left: rect.left,
        top: rect.top,
        hand: drawn.classList.contains('hand'),
        hitTest: uiContract.lastHitTest,
        mask: style.maskImage,
        background: style.backgroundColor,
        blend: style.mixBlendMode,
        rootBlend: getComputedStyle(uiContract.element('#game-cursor-root')).mixBlendMode,
      };
    });
    const before = await frames();
    await page.evaluate(dispatchMenuPointerClick, {});
    await nextFrame(before, `${selector} click`);
  };
  /** The drawn cursor and hit test the last `clickAt` recorded, and the click it forwarded. */
  const lastCursorClick = async () => {
    const { cursorBeforeClick, lastForwardedClick } = await page.evaluate(() => ({
      cursorBeforeClick: uiContract.cursorBeforeClick,
      lastForwardedClick: uiContract.lastForwardedClick,
    }));
    assert.ok(cursorBeforeClick && lastForwardedClick?.hitTest, 'the drawn-cursor click was forwarded and hit-tested');
    return { before: cursorBeforeClick, hitTest: lastForwardedClick.hitTest };
  };

  // Each menu route is exercised with real browser key events; none may recapture/release pointer lock.
  await press('Tab', 'Tab', 9);
  assert.equal(await shown('#inventory'), true, 'Tab opens inventory');
  await press('Tab', 'Tab', 9);
  assert.equal(await hidden('#inventory'), true, 'Tab closes inventory');
  assert.equal(
    await page.evaluate(() => document.querySelector('[data-input-action="ui.main-menu-toggle"]')?.textContent),
    keyBindings.mainMenu.label,
    'help label comes from the key binding table',
  );
  await pressBinding(keyBindings.mainMenu);
  assert.equal(await shown('#overlay'), true, 'menu key opens main menu');
  assert.equal(
    (await lastKeyEvent(keyBindings.mainMenu.code))?.defaultPrevented,
    true,
    'menu key is consumed by the game',
  );
  assert.equal(
    await page.evaluate(() => Boolean(document.querySelector('#audio-volume-world'))),
    true,
    'audio controls are in the F9 menu',
  );
  await moveCursorTo(await centreOf('#overlay .card'));
  await wheelInputSurface(500);
  assert.ok(
    await page.evaluate(() => uiContract.element('#overlay .card').scrollTop > 0),
    'wheel scrolls the locked main menu',
  );
  await scrollIntoView('#audio-volume-world');
  const initialWorldVolume = Number(await inputValue('#audio-volume-world'));
  await clickAt('#audio-volume-world');
  const savedWorldVolume = Number(await inputValue('#audio-volume-world'));
  assert.notEqual(savedWorldVolume, initialWorldVolume, 'menu click changes the world volume slider');
  assert.equal(
    await page.evaluate(
      () => /** @type {{ world: number }} */ (JSON.parse(localStorage.getItem('skelly.audio.settings') ?? '{}')).world,
    ),
    savedWorldVolume,
    'world volume is persisted to localStorage',
  );
  const restoredVolumes = await page.evaluate(async () => {
    const [{ GameAudio }, { buildBundledContent }, { claimed }] = await Promise.all([
      import('/@stage/@skelly/presentation/audio'),
      import('/src/product/content.ts'),
      import('/@stage/@skelly/engine/inventory'),
    ]);
    // Without sounds the fresh instance loads no files; it only reads the persisted volumes.
    const { registry } = buildBundledContent();
    const tuning = claimed(registry.senses, 'player');
    if (!tuning) {
      throw new Error('The bundled content has no player sense tuning');
    }
    return new GameAudio({
      registry: { ...registry, sounds: new Map(), soundOrigins: new Map() },
      tuning,
      blockSize: 1,
      isSolid: () => false,
      report: () => undefined,
      files: { packs: [], urls: {} },
    }).settings;
  });
  assert.equal(restoredVolumes.world, savedWorldVolume, 'a fresh audio instance reads the persisted volume');
  // A choice setting is operated by the drawn cursor like the rest of the menu, and says it applies on reload.
  const smoothingRow = '[data-graphics-key="msaaSamples"]';
  const smoothingField = '#graphics-msaaSamples';
  await scrollIntoView(smoothingField);
  await moveCursorTo(await centreOf(`${smoothingRow} .fact-detail`));
  assert.equal(
    await page.evaluate((row) => {
      const owner = uiContract.element(`${row} .fact-detail`);
      const fact = owner.querySelector('[role="tooltip"]');
      return (
        owner.classList.contains('game-cursor-hover') &&
        fact !== null &&
        fact.getClientRects().length > 0 &&
        fact.textContent?.trim() !== ''
      );
    }, smoothingRow),
    true,
    'the drawn cursor over the choice shows when it takes effect',
  );
  /** @param {string} selector */
  const comboChoices = (selector) =>
    page.evaluate((target) => {
      const field = uiContract.input(target);
      const list = document.getElementById(field.getAttribute('aria-controls') ?? '');
      if (!list) {
        throw new Error(`${target} controls no choice list`);
      }
      const options = [...list.querySelectorAll('[role="option"]')];
      return {
        expanded: field.getAttribute('aria-expanded'),
        focused: document.activeElement === field,
        unchosen: options.find((option) => !option.classList.contains('combo-box-chosen'))?.id,
        other: options
          .filter((option) => option.textContent !== field.value)
          .map((option) => ({ id: option.id, label: option.textContent ?? '' }))[0],
      };
    }, selector);
  await clickAt(smoothingField);
  const smoothingChoices = await comboChoices(smoothingField);
  assert.equal(smoothingChoices.expanded, 'true', 'a drawn-cursor click opens the edge smoothing choices');
  assert.ok(smoothingChoices.unchosen, 'the edge smoothing choices offer another value');
  await clickAt(`#${smoothingChoices.unchosen}`);
  assert.equal(
    await storedHasOwn('skelly.graphics-settings', 'msaaSamples'),
    true,
    'choosing with the drawn cursor persists the edge smoothing for the next load',
  );
  await clickAt(`${smoothingRow} button`);
  assert.equal(
    await storedHasOwn('skelly.graphics-settings', 'msaaSamples'),
    false,
    'clearing the edge smoothing returns it to the content default',
  );
  await scrollIntoView('#graphics-fastCamo');
  const initialCamo = await checked('#graphics-fastCamo');
  await clickAt('#graphics-fastCamo');
  assert.equal(await checked('#graphics-fastCamo'), !initialCamo, 'locked menu click changes the graphics preference');
  const [graphicsTuning] = graphicsFile.graphics;
  assert.ok(graphicsTuning, 'the shared graphics mod has a tuning row');
  const restoredGraphics = await page.evaluate(async (tuning) => {
    const { readGraphicsSettings } = await import(
      '/@stage/@skelly/presentation/internal/presentation/graphicsSettings.ts'
    );
    return readGraphicsSettings(tuning);
  }, graphicsTuning);
  assert.equal(restoredGraphics.fastCamo, !initialCamo, 'fresh graphics settings read the persisted machine choice');
  await clickAt('[data-graphics-key="fastCamo"] button');
  assert.equal(await checked('#graphics-fastCamo'), initialCamo, 'clearing the preference restores the mod default');
  assert.equal(
    await storedHasOwn('skelly.graphics-settings', 'fastCamo'),
    false,
    'clear removes the explicit setting rather than persisting the resolved default',
  );
  const hudToggles = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#hud-options input')].map(
        (input) => input instanceof HTMLInputElement && input.checked,
      ),
    );
  const initialHudToggles = await hudToggles();
  assert.ok(initialHudToggles.every(Boolean), 'HUD options start enabled');
  const statsLabel = '#hud-options [data-hud-option="stats"]';
  const clockLabel = '#hud-options [data-hud-option="clock"]';
  await scrollIntoView(statsLabel);
  const statsOption = `${statsLabel} input`;
  const clockOption = `${clockLabel} input`;
  const statsOptionInitiallyChecked = await checked(statsOption);
  const clockOptionInitiallyChecked = await checked(clockOption);
  if (!clockOptionInitiallyChecked) {
    await clickAt(clockLabel);
  }
  assert.equal(await checked(clockOption), true, 'clock is enabled for the pause readout');
  await clickAt(statsLabel);
  assert.equal(
    await checked(statsOption),
    !statsOptionInitiallyChecked,
    'drawn cursor toggles F9 menu controls from either default state',
  );
  const paused = () => page.evaluate(() => skellyPlayTest.session.sim.paused);
  assert.equal(await paused(), true, 'main menu pauses the simulation');
  const simulationResumesBefore = await page.evaluate(() => uiContract.simulationResumes);
  await pressBinding(keyBindings.mainMenu);
  assert.equal(await hidden('#overlay'), true, 'menu key closes the menu');
  const simulationResumed = () =>
    page.evaluate((before) => uiContract.simulationResumes > before, simulationResumesBefore);
  await waitFor(simulationResumed, 'closing the menu resumes the simulation');
  assert.equal(await paused(), false, 'closing the menu resumes the simulation');
  await pressBinding(keyBindings.mainMenu);
  assert.equal(await shown('#overlay'), true, 'menu key can open the menu again');
  await assertSaveNote('pause card');
  assert.equal(
    Number(await inputValue('#audio-volume-world')),
    savedWorldVolume,
    'audio volume remains selected when the menu reopens',
  );
  const clockOptionBeforeReset = await checked(clockOption);
  await scrollIntoView(clockLabel);
  await clickAt(clockLabel);
  assert.equal(await checked(clockOption), !clockOptionBeforeReset, 'drawn cursor toggles the clock option');
  if ((await checked(clockOption)) !== clockOptionInitiallyChecked) {
    await clickAt(clockLabel);
  }
  if ((await checked(statsOption)) !== statsOptionInitiallyChecked) {
    await clickAt(statsLabel);
  }
  assert.deepEqual(await hudToggles(), initialHudToggles, 'menu interactions restore the initial HUD settings');
  const unscrolledResume = await page.evaluate(() => {
    const rect = uiContract.element('#go').getBoundingClientRect();
    return {
      scrollTop: uiContract.element('#overlay .card').scrollTop,
      top: rect.top,
      hitGo: Boolean(document.elementFromPoint(rect.left + 1, rect.top + 1)?.closest('#go')),
    };
  });
  process.stdout.write(`Resume before scrolling: ${JSON.stringify(unscrolledResume)}\n`);
  await scrollIntoView('#save-note', 'instant');
  await clickAt('#save-note');
  const arrowTip = await lastCursorClick();
  assert.equal(arrowTip.before.hand, false, 'main-menu cursor uses the standard arrow');
  assert.match(arrowTip.before.mask, /url\(/, 'cursor sprite has a mask image');
  assert.equal(arrowTip.before.background, 'rgb(255, 255, 255)', 'cursor mask is filled white');
  assert.equal(arrowTip.before.blend, 'difference', 'the cursor is difference-blended');
  assert.equal(arrowTip.before.rootBlend, 'difference', 'cursor root uses difference blending');
  assert.equal(
    arrowTip.hitTest.insideSaveNote,
    true,
    'elementFromPoint at the arrow tip targets non-button save status',
  );
  assert.ok(Math.abs(arrowTip.before.left - cursor.x) < 0.1, 'standard arrow tip is at cursor x');
  assert.ok(Math.abs(arrowTip.before.top - cursor.y) < 0.1, 'standard arrow tip is at cursor y');
  assert.ok(Math.abs(arrowTip.hitTest.x - cursor.x) < 0.1, 'arrow-tip hit test uses cursor x');
  assert.ok(Math.abs(arrowTip.hitTest.y - cursor.y) < 0.1, 'arrow-tip hit test uses cursor y');
  await scrollIntoView('#go', 'instant');
  await clickAt('#go', 'edge');
  const resumeTip = await lastCursorClick();
  assert.equal(resumeTip.before.hand, true, 'native resume button uses the pointing hand');
  assert.equal(
    resumeTip.hitTest.insideGo,
    true,
    'elementFromPoint at the fingertip targets the visible resume button edge',
  );
  assert.ok(Math.abs(resumeTip.before.left + 4 - cursor.x) < 0.1, 'resume fingertip is at cursor x');
  assert.ok(Math.abs(resumeTip.before.top - cursor.y) < 0.1, 'resume fingertip is at cursor y');
  assert.ok(Math.abs(resumeTip.hitTest.x - cursor.x) < 0.1, 'resume hit test uses fingertip x');
  assert.ok(Math.abs(resumeTip.hitTest.y - cursor.y) < 0.1, 'resume hit test uses fingertip y');
  assert.equal(await hidden('#overlay'), true, 'edge click resumes play');
  const browserKeyEventsBefore = await page.evaluate(() => uiContract.keyEvents.length);
  await pressBinding(keyBindings.browserMenuBar);
  assert.equal(await hidden('#overlay'), true, 'browser-owned key does nothing in game');
  const recordedBrowserKey = () => lastKeyEvent(keyBindings.browserMenuBar.code, browserKeyEventsBefore);
  // A frame can precede the timer task that records defaultPrevented after event dispatch.
  await waitFor(async () => Boolean(await recordedBrowserKey()), 'browser-owned key is recorded');
  const browserKeyEvent = await recordedBrowserKey();
  assert.ok(browserKeyEvent, 'browser-owned key reaches the page in Chrome');
  assert.equal(browserKeyEvent.defaultPrevented, false, 'game leaves the browser-owned key unprevented');
  await action('debug.spawn-menu-toggle');
  assert.equal(await shown('#spawn'), true, 'gated spawn action opens menu');
  assert.equal(await inputValue('#spawn input'), '', 'G is not typed into the focused search field');
  await press('KeyG', 'g', 71);
  assert.equal(await shown('#spawn'), true, 'G does not close the menu while the search field is focused');
  await typeText('g');
  assert.equal(await inputValue('#spawn input'), 'g', 'focused search accepts text');
  await press('Tab', 'Tab', 9);
  assert.equal(await hidden('#spawn'), true, 'Tab closes spawn menu');
  await action('debug.panel-toggle');
  assert.equal(await shown('.debug-panel'), true, 'gated panel action opens debug panel');
  const debugScroll = await page.evaluate(() => {
    const panel = uiContract.element('.debug-panel');
    panel.scrollTop = 0;
    const rect = panel.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      height: panel.clientHeight,
      scroll: panel.scrollHeight,
    };
  });
  assert.ok(debugScroll.scroll > debugScroll.height, 'expanded authored debug panel actually overflows');
  await moveCursorTo(debugScroll);
  await wheelInputSurface(3, 1);
  assert.equal(
    await page.evaluate(() => uiContract.element('.debug-panel').scrollTop),
    48,
    'shared cursor route scrolls the debug panel once, normalizing line units',
  );
  assert.equal(await page.evaluate(() => scrollY), 0, 'debug wheel does not scroll the page');
  const shamblerCount = '.debug-actor-count output';
  assert.equal(
    await page.evaluate((selector) => Boolean(document.querySelector(selector)), shamblerCount),
    true,
    'debug panel has a shambler count control',
  );
  assert.equal(await text(shamblerCount), '1');
  const spawnActionLabel = async () =>
    page.evaluate(async (count) => {
      const { inputBindings } = await import('/src/product/input.ts');
      const label = uiContract.element('[data-debug-action="debug.spawn-actors"]').textContent ?? '';
      return (
        label.includes(inputBindings.label('debug.spawn-actors')) &&
        label.includes(uiContract.element(count).textContent ?? '')
      );
    }, shamblerCount);
  assert.equal(await spawnActionLabel(), true, 'spawn label includes the selected count and effective binding');
  const increaseShamblers = '[aria-label="Increase shambler count"]';
  const decreaseShamblers = '[aria-label="Decrease shambler count"]';
  await scrollIntoView(increaseShamblers);
  await clickAt(increaseShamblers);
  assert.equal(await text(shamblerCount), '2');
  assert.equal(await page.evaluate(() => localStorage.getItem('skelly.shambler-spawn-count')), '2');
  assert.equal(await spawnActionLabel(), true, 'spawn label follows the changed count and effective binding');
  await action('debug.panel-toggle');
  assert.equal(await hidden('.debug-panel'), true, 'gated panel action closes debug panel');
  await action('debug.panel-toggle');
  assert.equal(await text(shamblerCount), '2', 'spawn count remains selected');
  await scrollIntoView(decreaseShamblers);
  await clickAt(decreaseShamblers);
  assert.equal(await text(shamblerCount), '1');
  assert.equal(
    await page.evaluate((selector) => uiContract.element(selector).matches(':disabled'), decreaseShamblers),
    true,
  );
  await scrollIntoView(increaseShamblers);
  await clickAt(increaseShamblers);
  assert.equal(await text(shamblerCount), '2');
  await action('debug.spawn-actors');
  const spawnStatus = await page.evaluate(() => uiContractDebug.spawnStatus);
  assert.notEqual(spawnStatus, '', 'spawn action produces a status');
  assert.equal(await text('#shambler-spawn-status'), spawnStatus, 'spawn status renders the owner result');
  await action('debug.freeze-actors');
  await action('debug.panel-toggle');
  assert.deepEqual(await pointerCalls(), { request: 0, exit: 0 }, 'menu keys leave pointer lock alone');

  // Exercise keyboard input while pointer lock is held; the game's drawn-cursor menu route is active.
  await action('debug.spawn-menu-toggle');
  const searchFocused = () => page.evaluate(() => document.activeElement === document.querySelector('#spawn input'));
  assert.equal(await searchFocused(), true, 'G focuses search');
  const eye = () => page.evaluate(() => [...skellyPlayTest.eye()]);
  const positionBeforeSearchKey = await eye();
  await press('KeyW', 'w', 87);
  await nextFrame(await frames(), 'search-key negative check');
  assert.deepEqual(await eye(), positionBeforeSearchKey, 'typing W in search does not move the player');
  await press('Tab', 'Tab', 9);
  assert.equal(await hidden('#spawn'), true, 'Tab closes without spawning');

  await action('debug.spawn-menu-toggle');
  const spawnFilter = await page.evaluate(() => {
    const { registry } = skellyPlayTest.session.inventory;
    const entries = [...registry.items.values()].filter((entry) => !entry.workInProgress);
    const words = [...new Set(entries.flatMap((entry) => entry.name.toLowerCase().split(' ').filter(Boolean)))];
    for (const word of words) {
      const matches = entries.filter((entry) =>
        `${entry.name} ${entry.id} ${entry.category}`.toLowerCase().includes(word),
      ).length;
      if (matches > 1 && matches < entries.length) {
        return { word, matches };
      }
    }
    throw new Error('spawn catalogue has no nontrivial filter');
  });
  await typeText(spawnFilter.word);
  const spawnListLength = () => page.evaluate(() => document.querySelectorAll('#spawn .spawn-list button').length);
  assert.equal(
    await spawnListLength(),
    spawnFilter.matches,
    'typed filter narrows results to the matching owner entries',
  );
  const selectedSpawn = '#spawn .spawn-list button[aria-current=true] span';
  const firstSpawnName = await text(selectedSpawn);
  await press('ArrowDown', 'ArrowDown', 40);
  const selectedSpawnName = await text(selectedSpawn);
  assert.notEqual(selectedSpawnName, firstSpawnName, 'ArrowDown visibly changes the selected item');
  await action('spawn.confirm');
  assert.equal(await hidden('#spawn'), true, 'Enter spawns selection and closes menu');
  assert.deepEqual(await pointerCalls(), { request: 0, exit: 0 }, 'keyboard flow leaves pointer lock alone');
  await press('Tab', 'Tab', 9);
  const nearbyNames = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#inventory [data-pane="around"] .inv-item')].map((item) =>
        item instanceof HTMLElement ? item.title.split(',')[0] : undefined,
      ),
    );
  const nearbyAfterEnter = await nearbyNames();
  assert.ok(nearbyAfterEnter.includes(selectedSpawnName), 'Enter spawned the selected item');
  await press('Tab', 'Tab', 9);

  await action('debug.spawn-menu-toggle');
  const uniqueSpawnFilter = await page.evaluate(() => uiContract.element('#spawn [data-spawn-item]').dataset.spawnItem);
  assert.ok(uniqueSpawnFilter, 'the spawn menu offers an item ID');
  await typeText(uniqueSpawnFilter);
  assert.ok((await spawnListLength()) > 0, 'an offered item ID remains searchable');
  await press('Tab', 'Tab', 9);
  assert.equal(await hidden('#spawn'), true, 'Tab dismisses the filtered menu');
  await press('Tab', 'Tab', 9);
  assert.deepEqual(await nearbyNames(), nearbyAfterEnter, 'Tab dismissed without spawning');
  await press('Tab', 'Tab', 9);

  await action('debug.spawn-menu-toggle');
  // Bags first: once the divider is dragged to narrow Around you (below), their pockets make the nearby
  // pane scroll; the pile at the feet would otherwise fill with whichever small items sort first.
  const spawnNames = await page.evaluate(() => {
    const { items } = skellyPlayTest.session.inventory.registry;
    const entries = [...document.querySelectorAll('#spawn .spawn-list button')]
      .map((button, index) => ({
        index,
        name: button.querySelector('span')?.textContent,
        bag: Boolean(button instanceof HTMLElement && items.get(button.dataset.spawnItem ?? '')?.container),
      }))
      .filter(({ name }) => name);
    return [...entries.filter(({ bag }) => bag), ...entries.filter(({ bag }) => !bag)].slice(0, 24);
  });
  assert.ok(spawnNames[0]?.bag, 'debug spawn menu offers a bag for the scroll workload');
  for (const { index } of spawnNames) {
    const button = `#spawn .spawn-list button:nth-child(${index + 1})`;
    await scrollIntoView(button);
    await clickAt(button);
  }
  await press('Tab', 'Tab', 9);
  if (!(await hidden('#overlay'))) {
    await clickAt('#go', 'edge');
  }
  assert.equal(await hidden('#overlay'), true, 'play is resumed before inventory queue checks');
  assert.deepEqual(await hudToggles(), initialHudToggles, 'HUD settings retain their initial state through gameplay');
  // The three-column Items view uses the full body height; keep a short-screen scroll target.
  await page.setViewportSize({ width: 1280, height: 480 });
  await press('Tab', 'Tab', 9);
  assert.equal(
    await page.evaluate(() => document.querySelector('#inventory .inv-needs') !== null),
    true,
    'inventory always shows needs in its header',
  );
  assert.equal(
    await page.evaluate(() => {
      const expected = skellyPlayTest.screenHooks.needs();
      return expected.length > 0 && uiContract.element('#inventory .inv-needs').textContent === expected;
    }),
    true,
  );
  /** @param {number} fraction */
  const dragInventoryDivider = async (fraction) => {
    const itemsBody = await page.locator('#inventory .inv-body[data-tab-panel="items"]').boundingBox();
    const splitter = await page.locator('#inventory [data-inventory-splitter]').boundingBox();
    assert.ok(itemsBody && splitter, 'Items divider is available to resize Around you');
    await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + splitter.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      itemsBody.x + itemsBody.width * fraction - (fraction === 1 ? 1 : 0),
      splitter.y + splitter.height / 2,
    );
    await page.mouse.up();
    cursor = await centreOf('#game-cursor');
  };
  await dragInventoryDivider(1);
  const inventoryScroll = await page.evaluate(() => {
    const pane = uiContract.element('#inventory [data-pane="around"]');
    pane.scrollTop = Math.min(40, pane.scrollHeight - pane.clientHeight);
    const view = pane.getBoundingClientRect();
    const visible = [...pane.querySelectorAll('.inv-grid-packed .inv-item')]
      .filter((node) => node instanceof HTMLElement)
      .find((node) => {
        const item = node.getBoundingClientRect();
        if (item.bottom <= view.top || item.top >= view.bottom) {
          return false;
        }
        return (
          document.elementFromPoint(item.left + item.width / 2, item.top + item.height / 2)?.closest('.inv-item') ===
          node
        );
      });
    const grid = visible?.closest('.inv-grid');
    return {
      top: pane.scrollTop,
      overflow: pane.scrollHeight - pane.clientHeight,
      uid: visible?.dataset.uid,
      target: grid instanceof HTMLElement ? grid.dataset.target : undefined,
      name: visible?.title.split(',')[0],
    };
  });
  assert.ok(inventoryScroll.overflow > 1, 'nearby pane has enough items to scroll');
  assert.ok(inventoryScroll.uid, 'a nearby item is visible to select');
  assert.ok(inventoryScroll.target, 'the selected nearby item has a source inventory grid');
  await clickAt(`#inventory [data-uid="${inventoryScroll.uid}"]`);
  const detailsTitle = () => page.evaluate(() => document.querySelector('#inventory .inv-details h3')?.textContent);
  assert.equal(await detailsTitle(), inventoryScroll.name);
  const aroundScrollTop = () => page.evaluate(() => uiContract.element('#inventory [data-pane="around"]').scrollTop);
  let paneTop = await aroundScrollTop();
  assert.ok(
    Math.abs(paneTop - inventoryScroll.top) <= 1,
    `scroll survives selecting an item (${inventoryScroll.top} -> ${paneTop})`,
  );

  const moveQueued = () => page.evaluate(() => document.querySelector('#inventory .inv-job') !== null);
  assert.equal(await moveQueued(), false, 'inventory starts with no queued move');
  await pressCdpAction(evaluateExpression, send, 'inventory.best-pocket');
  await waitFor(moveQueued, 'selected item queues a move', 1000);
  assert.equal(await moveQueued(), true, 'selected item queues a move');
  paneTop = await aroundScrollTop();
  assert.ok(Math.abs(paneTop - inventoryScroll.top) <= 1, 'scroll survives queueing a move');
  /** @param {string} uid */
  const gridTargetOf = (uid) =>
    page.evaluate((itemUid) => {
      const grid = document.querySelector(`#inventory .inv-item[data-uid="${itemUid}"]`)?.closest('.inv-grid');
      return grid instanceof HTMLElement ? grid.dataset.target : undefined;
    }, uid);
  const selectedUid = inventoryScroll.uid;
  await waitFor(
    () => gridTargetOf(selectedUid).then((target) => target !== undefined && target !== inventoryScroll.target),
    'selected item moves into inventory',
    15_000,
  );
  const completedTarget = await gridTargetOf(selectedUid);
  assert.ok(completedTarget && completedTarget !== inventoryScroll.target, 'completed item leaves its source grid');
  paneTop = await aroundScrollTop();
  assert.ok(Math.abs(paneTop - inventoryScroll.top) <= 1, 'scroll survives handling completion');

  await dragInventoryDivider(0.5);
  await page.setViewportSize({ width: 1280, height: 900 });
  const transfer = await page.evaluate(() => {
    const { inventory } = skellyPlayTest.session;
    const items = new Map([...inventory.items()].map(({ item }) => [String(item.uid), item]));
    /** @param {Element} node */
    const gridTarget = (node) => {
      const grid = node.closest('.inv-grid');
      return grid instanceof HTMLElement ? grid.dataset.target : undefined;
    };
    const sources = [...document.querySelectorAll('#inventory .inv-item')]
      .filter((node) => node instanceof HTMLElement)
      .filter((node) => gridTarget(node)?.startsWith('pocket:'));
    const destinations = [...document.querySelectorAll('#inventory .inv-worn .inv-grid')]
      .filter((node) => node instanceof HTMLElement)
      .filter((node) => !node.querySelector('[data-uid]'));
    /** @typedef {NonNullable<ReturnType<typeof items.get>>} Item */
    /**
     * @param {Item} moving
     * @param {boolean} rotated
     * @param {HTMLElement} destination
     */
    const admits = (moving, rotated, destination) => {
      const [, ownerUid, pocket] = (destination.dataset.target ?? '').split(':');
      const owner = items.get(ownerUid ?? '');
      return Boolean(
        owner &&
          inventory.plan(moving, { kind: 'pocket', owner, pocket: Number(pocket), at: { x: 0, y: 0, rotated } }).ok,
      );
    };
    /**
     * Whether a cursor would reach both ends of the drag once each is scrolled into view.
     * @param {HTMLElement} item
     * @param {HTMLElement} pocket
     */
    const reachable = (item, pocket) => {
      item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      pocket.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const itemBox = item.getBoundingClientRect();
      const pocketBox = pocket.getBoundingClientRect();
      const itemHit = document
        .elementFromPoint(itemBox.left + itemBox.width / 2, itemBox.top + itemBox.height / 2)
        ?.closest('.inv-item');
      const pocketHit = document.elementFromPoint(pocketBox.left + 16, pocketBox.top + 16)?.closest('.inv-grid');
      return itemHit === item && pocketHit === pocket;
    };
    const findTransfer = () => {
      for (const source of sources) {
        const moving = items.get(source.dataset.uid ?? '');
        const from = moving && inventory.locate(moving);
        if (!(moving && from && 'placed' in from)) {
          continue;
        }
        const rotated = from.placed.rotated ?? false;
        const grid = destinations.find(
          (destination) => admits(moving, rotated, destination) && reachable(source, destination),
        );
        if (grid) {
          return { source, moving, grid };
        }
      }
      return null;
    };
    const found = findTransfer();
    const around = document.querySelector('#inventory [data-pane="around"]');
    if (!(found && around)) {
      throw new Error('no admitted container-to-inventory transfer is available');
    }
    const itemRect = found.source.getBoundingClientRect();
    const gridRect = found.grid.getBoundingClientRect();
    const source = { x: itemRect.left + itemRect.width / 2, y: itemRect.top + itemRect.height / 2 };
    const hit = document.elementFromPoint(source.x, source.y)?.closest('.inv-item');
    return {
      source,
      sourceTarget: gridTarget(found.source),
      sourceUid: found.source.dataset.uid ?? '',
      name: inventory.name(found.moving),
      paneTop: around.scrollTop,
      hitUid: hit instanceof HTMLElement ? hit.dataset.uid : undefined,
      hitName: hit?.querySelector('.inv-item-name')?.textContent,
      destination: { x: gridRect.left + 16, y: gridRect.top + 16 },
      target: found.grid.dataset.target,
    };
  });
  assert.match(transfer.sourceTarget ?? '', /^pocket:/, 'source item is in a container pocket');
  const dragGhost = () =>
    page.evaluate(() => {
      const ghost = document.querySelector('#inventory-drag-root .inv-ghost');
      if (!ghost) {
        return null;
      }
      const rect = ghost.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });
  assert.equal(transfer.hitUid, transfer.sourceUid, `container item is the topmost hit: ${JSON.stringify(transfer)}`);
  const drawnSource = { x: transfer.source.x + 16, y: transfer.source.y + 16 };
  await moveCursorTo(drawnSource);
  await page.evaluate(dispatchMenuPointerClick, {});
  await waitFor(
    async () => (await detailsTitle()) === transfer.name,
    `drawn-cursor click selects an item in a container: ${JSON.stringify(transfer)}`,
    2000,
  );
  paneTop = await aroundScrollTop();
  assert.ok(Math.abs(paneTop - transfer.paneTop) <= 1, 'scroll survives selecting a container item');
  const transferDestination = { x: transfer.destination.x + 16, y: transfer.destination.y + 16 };
  const beginDrag = async () => {
    await moveCursorTo(drawnSource);
    await dispatchPointerAt('pointerdown', 0, 1, drawnSource);
  };

  await beginDrag();
  await moveCursorTo(transferDestination);
  await dispatchPointerAt('pointermove', -1, 1, transferDestination);
  const ghostAtDestination = await dragGhost();
  assert(ghostAtDestination, 'drag displays the item ghost');
  const ghostHit = await page.evaluate(() => {
    const ghost = document.querySelector('#inventory-drag-root .inv-ghost');
    if (!(ghost instanceof HTMLElement)) {
      return false;
    }
    const previous = ghost.style.pointerEvents;
    ghost.style.pointerEvents = 'auto';
    const rect = ghost.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    ghost.style.pointerEvents = previous;
    return hit === ghost || ghost.contains(hit);
  });
  assert.equal(ghostHit, true, 'drag ghost is topmost at its centre');
  const movedPointer = { x: transferDestination.x + 4, y: transferDestination.y + 6 };
  await moveCursorTo(movedPointer);
  await dispatchPointerAt('pointermove', -1, 1, movedPointer);
  const ghostAfterMove = await dragGhost();
  assert.ok(ghostAfterMove, 'drag ghost remains while the pointer moves');
  assert.ok(
    Math.abs(ghostAfterMove.left - ghostAtDestination.left - 4) < 0.5,
    'drag ghost follows horizontal movement',
  );
  assert.ok(
    Math.abs(ghostAfterMove.top - ghostAtDestination.top - 6) < 0.5,
    `drag ghost follows vertical movement: ${JSON.stringify({ transfer, ghostAtDestination, ghostAfterMove, movedPointer })}`,
  );
  const outside = { x: 4, y: 4 };
  await moveCursorTo(outside);
  await dispatchPointerAt('pointermove', -1, 1, outside);
  await dispatchPointerAt('pointerup', -1, 0, outside);
  assert.equal(await dragGhost(), null, 'release outside removes the drag ghost');
  assert.equal(await moveQueued(), false, 'release outside cancels the move');

  await beginDrag();
  await moveCursorTo(transferDestination);
  await dispatchPointerAt('pointermove', -1, 1, transferDestination);
  assert(await dragGhost(), 'drag displays the item ghost before drop');
  const queuedMovesBeforeDrop = await page.evaluate(() => uiContract.queuedMoves.length);
  await dispatchPointerAt('pointerup', -1, 0, transferDestination);
  // Dispatch waits for a player tick; a frame need not run that tick, and later frames can finish the job.
  const transferQueued = () =>
    page.evaluate(
      ([from, itemUid]) => uiContract.queuedMoves.slice(from).some((job) => job.itemUid === itemUid),
      [queuedMovesBeforeDrop, Number(transfer.sourceUid)],
    );
  await waitFor(transferQueued, 'container transfer enters the handling queue');
  assert.equal(await dragGhost(), null, 'drop removes the drag ghost');
  assert.equal(await transferQueued(), true, 'container transfer enters the handling queue');
  paneTop = await aroundScrollTop();
  assert.ok(Math.abs(paneTop - transfer.paneTop) <= 1, 'scroll survives queueing the container move');
  await press('Tab', 'Tab', 9);
  assert.equal(await hidden('#inventory'), true, 'Tab closes inventory after queueing the move');
  await press('Tab', 'Tab', 9);
  assert.equal(await shown('#inventory'), true, 'Tab reopens inventory to verify the drop');
  await waitFor(
    () => gridTargetOf(transfer.sourceUid).then((target) => target === transfer.target),
    'container move completes',
    15_000,
  );
  assert.equal(
    await gridTargetOf(transfer.sourceUid),
    transfer.target,
    'dropped item lands in the target inventory pocket',
  );
  paneTop = await aroundScrollTop();
  assert.ok(Math.abs(paneTop - transfer.paneTop) <= 1, 'scroll survives handling completion');
  await press('Tab', 'Tab', 9);

  // In-game choices use the game's own combo box: a native picker takes focus from the page, and play
  // pauses on blur. Choose a weathering profile in the debug panel with the drawn cursor while play runs.
  await action('debug.panel-toggle');
  await setPointerLocked(true);
  await waitFor(() => shown('#game-cursor'), 'menu cursor over the debug panel');
  cursor = await drawnCursorTip();
  const weatheringHeader = '.debug-group[data-group="weathering"] .debug-group-header';
  if ((await attribute(weatheringHeader, 'aria-expanded')) !== 'true') {
    await clickAt(weatheringHeader);
  }
  const pointerExitsBeforeChoice = await page.evaluate(() => {
    uiContract.windowBlurs = 0;
    addEventListener('blur', () => {
      uiContract.windowBlurs += 1;
    });
    uiContract.element('#weathering-profile').scrollIntoView({ block: 'center' });
    return uiContract.pointerCalls.exit;
  });
  await pressWithDrawnCursor(page, '#weathering-profile');
  const openedProfiles = await comboChoices('#weathering-profile');
  assert.deepEqual(
    { expanded: openedProfiles.expanded, focused: openedProfiles.focused },
    { expanded: 'true', focused: true },
    'a drawn-cursor click opens the weathering combo box with focus kept in the page',
  );
  assert.ok(openedProfiles.other, 'the weathering combo box offers another profile to choose');
  await pressWithDrawnCursor(page, `#${openedProfiles.other.id}`);
  await delay(300);
  assert.deepEqual(
    await page.evaluate(() => ({
      shown: uiContract.input('#weathering-profile').value,
      expanded: uiContract.element('#weathering-profile').getAttribute('aria-expanded'),
      overlayHidden: uiContract.element('#overlay').hidden,
      locked: document.pointerLockElement === uiContract.inputSurface,
      windowBlurs: uiContract.windowBlurs,
      pointerExits: uiContract.pointerCalls.exit,
    })),
    {
      shown: openedProfiles.other.label,
      expanded: 'false',
      overlayHidden: true,
      locked: true,
      windowBlurs: 0,
      pointerExits: pointerExitsBeforeChoice,
    },
    'choosing with the drawn cursor applies the profile without a blur, an unlock or the pause card',
  );
  assert.equal(await paused(), false, 'play keeps running through the combo box choice');
  await action('debug.panel-toggle');

  // With a menu open and pointer locked, move the drawn cursor, dispatch a click to its target,
  // and verify both a button handler and input focus receive the forwarded click.
  await action('debug.spawn-menu-toggle');
  await scrollIntoView('#spawn .spawn-list button');
  await setPointerLocked(true);
  await waitFor(() => shown('#game-cursor'), 'menu cursor visibility');
  cursor = await drawnCursorTip();
  await clickAt('#spawn .spawn-list button');
  const hotspot = await page.evaluate(() => {
    const drawn = uiContract.element('#game-cursor').getBoundingClientRect();
    const button = uiContract.element('#spawn .spawn-list button');
    return {
      tipX: drawn.left + 4,
      tipY: drawn.top,
      hitTest: uiContract.lastHitTest,
      forwarded: uiContract.lastForwardedClick,
      hitButton: uiContract.lastHitTest?.buttonText === button.textContent?.trim(),
    };
  });
  assert.ok(hotspot.hitTest && hotspot.forwarded, 'the cursor click was hit-tested and forwarded');
  assert.ok(Math.abs(hotspot.tipX - cursor.x) < 0.1, 'pointing-hand fingertip sits at cursor x');
  assert.ok(Math.abs(hotspot.tipY - cursor.y) < 0.1, 'pointing-hand fingertip sits at cursor y');
  assert.ok(Math.abs(hotspot.hitTest.x - cursor.x) < 0.1, 'elementFromPoint receives cursor tip x');
  assert.ok(Math.abs(hotspot.hitTest.y - cursor.y) < 0.1, 'elementFromPoint receives cursor tip y');
  assert.equal(hotspot.hitButton, true, 'elementFromPoint at the tip targets the button');
  assert.ok(Math.abs(hotspot.forwarded.x - cursor.x) < 1, 'forwarded click x uses the cursor tip');
  assert.ok(Math.abs(hotspot.forwarded.y - cursor.y) < 1, 'forwarded click y uses the cursor tip');
  assert.notEqual(await text('#spawn .spawn-status'), '', 'cursor click fires spawn handler');
  await page.evaluate(() => uiContract.element('#spawn input').blur());
  await clickAt('#spawn input');
  assert.equal(await searchFocused(), true, 'cursor click focuses search field');

  inputFrame = await frames();
  await setPointerLocked(false);
  await nextFrame(inputFrame, 'pointer unlock');
  assert.equal(await shown('#overlay'), true, 'unlock pointerlockchange opens main menu');
  assert.equal(await hidden('#spawn'), true, 'unlock closes the spawn menu');
  assert.deepEqual(await pointerCalls(), { request: 0, exit: 0 }, 'unlock event does not call lock APIs');

  inputFrame = await frames();
  await clickInputSurface();
  await nextFrame(inputFrame, 'input-surface resume click');
  if (!(await hidden('#overlay'))) {
    await clickAt('#go');
  }
  assert.equal(await hidden('#overlay'), true, 'input-surface or locked-card click resumes after pointer unlock');

  await press('Tab', 'Tab', 9);
  inputFrame = await frames();
  await setPointerLocked(false);
  await nextFrame(inputFrame, 'inventory pointer unlock');
  assert.equal(await hidden('#inventory'), true, 'unlock closes an open inventory');
  inputFrame = await frames();
  await clickInputSurface();
  await nextFrame(inputFrame, 'inventory input-surface resume click');
  assert.equal(await hidden('#overlay'), true, 'input-surface click resumes after inventory unlock');

  await action('debug.panel-toggle');
  inputFrame = await frames();
  await setPointerLocked(false);
  await nextFrame(inputFrame, 'debug-panel pointer unlock');
  assert.equal(await hidden('.debug-panel'), true, 'unlock closes an open debug panel');
  inputFrame = await frames();
  await clickInputSurface();
  await nextFrame(inputFrame, 'debug-panel input-surface resume click');
  assert.equal(await hidden('#overlay'), true, 'input-surface click resumes after debug-panel unlock');

  await pressBinding(keyBindings.mainMenu);
  await clickAt('#go');
  assert.equal(await hidden('#overlay'), true, 'locked cursor click on continue resumes play');

  inputFrame = await frames();
  await setPointerLocked(false);
  await nextFrame(inputFrame, 'refused-lock setup unlock');
  const pointerErrorsBefore = await page.evaluate(() => uiContract.pointerLockErrors);
  inputFrame = await frames();
  await page.evaluate(() => {
    uiContract.rejectNextPointerLock = true;
    uiContract.element('#go').click();
  });
  await waitFor(
    () => page.evaluate((before) => uiContract.pointerLockErrors > before, pointerErrorsBefore),
    'refused pointer-lock error',
  );
  await nextFrame(inputFrame, 'refused pointer-lock input');
  assert.equal(await hidden('#overlay'), false, 'refused lock leaves the menu open');
  inputFrame = await frames();
  await setPointerLocked(true);
  await nextFrame(inputFrame, 'unrelated pointer lock');
  assert.equal(await hidden('#overlay'), false, 'a later unrelated lock does not consume the refused resume intent');
  await click('#go');
  assert.equal(await hidden('#overlay'), true, 'a fresh resume click closes the menu');
  assert.deepEqual(
    await page.evaluate(() => uiContract.webglContextRequests),
    [],
    'UI contract remains independent of WebGL rendering',
  );
  const independentUrl = browserStageUrl(
    'ui-browser-contract',
    gameUrl(stageOrigin, { startMod: houseStartMod, harness: { 'play-test': 1 }, hash: stageHash }),
  );
  await page.goto(independentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitFor(
    () => page.evaluate(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false'),
    'independent-world launch readiness',
  );
  await captureMetricsDownload();
  await click('#go');
  // The init script defines the handle's property before play publishes it, so wait for a value.
  await waitFor(() => page.evaluate(() => Boolean(globalThis.skellyPlayTest)), 'independent-world session');
  assert.equal(await page.evaluate(() => skellyPlayTest.session.scenarioRun), null);
  await click('#export-metrics');
  const sandboxMetrics = /** @type {SessionMetricsV1} */ (await downloadedMetrics());
  assert.equal(sandboxMetrics.schemaVersion, 1, 'independent-world metrics download is valid versioned JSON');
  assert.equal(sandboxMetrics.seed, await page.evaluate(() => skellyPlayTest.session.sim.seed));
  assert.equal(
    await metricsFilename(),
    `skelly-metrics-seed-${sandboxMetrics.seed}.json`,
    'independent-world metrics download identifies its seed',
  );
  process.stdout.write(
    'UI browser contract passed: container drag/drop, pointer-locked menus, cursor clicks/focus, combo box choice without blur, spawn count, V status, audio volume persistence, unlock, menu/browser keys, inventory stats.\n',
  );
} catch (error) {
  if (viteDiagnostics.state !== 'listening') {
    viteDiagnostics.error = inspect(error, { depth: 3 });
  }
  process.stderr.write(
    `UI_LAUNCH_FAILURE ${JSON.stringify({
      error: inspect(error, { depth: 5 }),
      launcher: 'playwright-managed-cdp-pipe',
      browserVersion: browser?.version(),
      graphicsArgs,
      graphics,
      stageUrl,
      discovery,
      vite: viteDiagnostics,
      browser: {
        connected: browser?.isConnected(),
        version: browser?.version(),
        requestedArgs: launchArgs,
      },
      page: { url: stagePage?.url(), errors: pageErrors },
    })}\n`,
  );
  throw error;
} finally {
  await cleanup('CDP session', () => stageCdp?.detach());
  await cleanup('Chromium', () => browser?.close());
  await cleanup('Vite', () => vite?.close());
}
