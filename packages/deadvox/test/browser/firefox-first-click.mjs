// Native first-gesture contract. Quarantined from CI: https://github.com/roobie/skelly/issues/168
// Run locally headed under Xvfb with DEBUG=pw:browser for browser-process diagnostics.
// Later menu/inventory contracts live in firefox-ui.mjs with explicitly synthetic lock setup.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { verifyAltRelease } from './alt-release.mjs';
import { launchChromium } from './chromium.mjs';
import { gameUrl } from './gameUrl.mjs';
import { pressAction } from './input-actions.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';

/**
 * @import { Browser, Page } from 'playwright'
 */

/** @typedef {{ type: 'keydown' | 'keyup'; trusted: boolean; prevented: boolean }} GateEvent */
/**
 * @typedef {{
 *   target: string | null;
 *   userActivationActive: boolean | undefined;
 *   returnsPromise: boolean;
 *   hasFocus: boolean;
 *   visibility: DocumentVisibilityState;
 *   msSincePointerDown: number | null;
 * }} LockRequest
 */
/**
 * @typedef {{
 *   pointerDownAt: number | null;
 *   pointerDownTarget: string | null;
 *   clickTarget: string | null;
 *   startTarget: string | null;
 *   audioResumeCalls: { afterTrustedStartGesture: boolean; userActivationActive: boolean | undefined }[];
 *   lockRequests: LockRequest[];
 *   lockChanges: (string | null)[];
 *   lockErrors: string[];
 * }} StartGesture
 */

const { firefox } = await import('playwright');
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const vite = await createStageServer({
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  root: projectRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
/** @type {Browser | undefined} */
let browser;
/** @type {Page | undefined} */
let page;
/** @type {string[]} */
const pageErrors = [];
/** @type {string[]} */
const consoleErrors = [];
try {
  await vite.listen();
  const port = listeningPort(vite);
  browser =
    process.argv[2] === 'chromium'
      ? await launchChromium('firefox-first-click', { headless: false })
      : await firefox.launch({ headless: false });
  page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
    if (message.type() === 'warning') {
      process.stderr.write(`Browser warning: ${message.text()}\n`);
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('skelly.hud-options', JSON.stringify({ clock: true }));
    // The handle is published before play's first frame, so its simulation time is the time play started at.
    /** @type {typeof globalThis.skellyPlayTest | undefined} */
    let playTest;
    Object.defineProperty(globalThis, 'skellyPlayTest', {
      configurable: true,
      get: () => playTest,
      set: (published) => {
        playTest = published;
        globalThis.firefoxNativeInitialTime = published.session.sim.time;
      },
    });
    /** @param {EventTarget | null} element */
    const describe = (element) =>
      element instanceof Element
        ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${typeof element.className === 'string' && element.className ? `.${element.className.trim().replaceAll(' ', '.')}` : ''}`
        : null;
    let trustedStartGesture = false;
    globalThis.__startGesture = {
      pointerDownAt: null,
      pointerDownTarget: null,
      clickTarget: null,
      startTarget: null,
      audioResumeCalls: [],
      lockRequests: [],
      lockChanges: [],
      lockErrors: [],
    };
    document.addEventListener(
      'pointerdown',
      (event) => {
        trustedStartGesture ||= Boolean(
          event.isTrusted && event.target instanceof Element && event.target.closest('#go'),
        );
        globalThis.__startGesture.startTarget = describe(document.querySelector('#go'));
        globalThis.__startGesture.pointerDownTarget = describe(event.target);
        globalThis.__startGesture.pointerDownAt ??= performance.now();
      },
      true,
    );
    document.addEventListener(
      'click',
      (event) => {
        trustedStartGesture ||= Boolean(
          event.isTrusted && event.target instanceof Element && event.target.closest('#go'),
        );
        globalThis.__startGesture.clickTarget ??= describe(event.target);
      },
      true,
    );
    document.addEventListener('pointerlockchange', () =>
      globalThis.__startGesture.lockChanges.push(describe(document.pointerLockElement)),
    );
    document.addEventListener('pointerlockerror', () => globalThis.__startGesture.lockChanges.push('error'));
    const { requestPointerLock } = Element.prototype;
    Element.prototype.requestPointerLock = function (...args) {
      const result = requestPointerLock.apply(this, args);
      globalThis.__startGesture.lockRequests.push({
        target: describe(this),
        userActivationActive: navigator.userActivation?.isActive,
        returnsPromise: Boolean(result) && typeof result.then === 'function',
        hasFocus: document.hasFocus(),
        visibility: document.visibilityState,
        msSincePointerDown:
          globalThis.__startGesture.pointerDownAt === null
            ? null
            : performance.now() - globalThis.__startGesture.pointerDownAt,
      });
      result?.catch((error) =>
        globalThis.__startGesture.lockErrors.push(`${String(error)} (hasFocus=${document.hasFocus()})`),
      );
      return result;
    };
    const NativeAudioContext = globalThis.AudioContext;
    globalThis.AudioContext = class extends NativeAudioContext {
      /** @override */
      resume() {
        globalThis.__startGesture.audioResumeCalls.push({
          afterTrustedStartGesture: trustedStartGesture,
          userActivationActive: navigator.userActivation?.isActive,
        });
        return super.resume();
      }
    };
  });
  await page.goto(
    browserStageUrl(
      'firefox-first-click',
      gameUrl(`http://127.0.0.1:${port}`, {
        harness: { 'play-test': 1 },
        hash: { debug: true, seed: 1, radius: 64 },
      }),
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
    timeout: 30_000,
  });
  await page.bringToFront();
  await page.evaluate(() => window.focus());
  assert.equal(await page.evaluate(() => Boolean(globalThis.skellyPlayTest)), false, 'title has no simulation');
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.skellyPlayTest));
  const before = await page.evaluate(() => globalThis.firefoxNativeInitialTime);
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('#overlay');
      return (
        document.pointerLockElement === document.querySelector('#view') &&
        overlay instanceof HTMLElement &&
        overlay.hidden
      );
    },
    null,
    { timeout: 10_000 },
  );
  await page.waitForFunction((time) => globalThis.skellyPlayTest.session.sim.time > time, before, { timeout: 20_000 });
  const gesture = await page.evaluate(() => globalThis.__startGesture);
  assert.equal(gesture.pointerDownTarget, gesture.clickTarget);
  assert.ok(gesture.startTarget, 'the start control exists at the gesture');
  assert.equal(gesture.pointerDownTarget, gesture.startTarget);
  assert.equal(gesture.lockRequests.length, 1, 'one initial gesture makes one native lock request');
  assert.equal(gesture.lockRequests[0]?.target, 'main#view');
  assert.equal(gesture.lockRequests[0]?.userActivationActive, true);
  assert.ok(gesture.lockChanges.includes('main#view'));
  // Chromium can start audio already running; the first-gesture resume contract is Firefox's.
  if (process.argv[2] !== 'chromium') {
    assert.ok(gesture.audioResumeCalls.some((call) => call.afterTrustedStartGesture && call.userActivationActive));
  }
  await verifyAltRelease(page);
  process.stdout.write(`Native Alt release browser: ${browser.version()}\n`);
  const gateCode = await page.evaluate(
    `import('/src/product/input.ts').then(({ inputBindings }) => inputBindings.chords('debug.gate')[0].code)`,
  );
  await page.evaluate((code) => {
    globalThis.firefoxNativeGateEvents = [];
    addEventListener('keydown', (event) => {
      if (event.code === code) {
        globalThis.firefoxNativeGateEvents.push({
          type: 'keydown',
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        });
      }
    });
    addEventListener('keyup', (event) => {
      if (event.code === code) {
        globalThis.firefoxNativeGateEvents.push({
          type: 'keyup',
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        });
      }
    });
  }, gateCode);
  const godBefore = await page.evaluate(() => globalThis.skellyPlayTest.session.sim.godMode);
  await pressAction(page, 'debug.god-toggle', { includeGate: false });
  assert.equal(
    await page.evaluate(() => globalThis.skellyPlayTest.session.sim.godMode),
    godBefore,
    'plain debug key cannot author',
  );
  await pressAction(page, 'debug.god-toggle');
  assert.equal(
    await page.evaluate(() => globalThis.skellyPlayTest.session.sim.godMode),
    !godBefore,
    'held F2 authorizes one debug action',
  );
  await pressAction(page, 'debug.god-toggle', { includeGate: false });
  assert.equal(
    await page.evaluate(() => globalThis.skellyPlayTest.session.sim.godMode),
    !godBefore,
    'gate release cannot latch',
  );
  const gateEvents = await page.evaluate(() => globalThis.firefoxNativeGateEvents);
  assert.equal(gateEvents.length, 2);
  assert.ok(gateEvents.every((event) => event.trusted));
  assert.ok(gateEvents.some((event) => event.type === 'keydown' && event.prevented));
  assert.equal(page.context().pages().length, 1, 'debug gate opens no Help page or window');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  process.stdout.write(
    'NATIVE first-gesture lock/progress, Alt release and F2-gated debug passed; menu/inventory are tested separately.\n',
  );
} catch (error) {
  let timer;
  const state = await Promise.race([
    page
      ?.evaluate(() => {
        const overlay = document.querySelector('#overlay');
        return {
          url: location.href,
          focus: document.hasFocus(),
          visibility: document.visibilityState,
          viewport: [innerWidth, innerHeight],
          status: document.querySelector('#save-status')?.textContent,
          errors: document.querySelector('#errors')?.textContent,
          overlayHidden: overlay instanceof HTMLElement ? overlay.hidden : undefined,
          canvas: [...document.querySelectorAll('#view canvas')]
            .filter((canvas) => canvas instanceof HTMLCanvasElement)
            .map((canvas) => ({
              width: canvas.width,
              height: canvas.height,
              rect: canvas.getBoundingClientRect().toJSON(),
              display: getComputedStyle(canvas).display,
              visibility: getComputedStyle(canvas).visibility,
            })),
          gesture: globalThis.__startGesture,
          simTime: globalThis.skellyPlayTest?.session.sim.time,
        };
      })
      .catch((failure) => ({ evaluationError: String(failure) })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ unresponsive: true }), 5000);
    }),
  ]);
  clearTimeout(timer);
  const windows = spawnSync('xwininfo', ['-root', '-tree'], { encoding: 'utf8', timeout: 5000 });
  const focus = spawnSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { encoding: 'utf8', timeout: 5000 });
  process.stderr.write(
    `NATIVE_INPUT_FAILURE ${JSON.stringify({
      error: String(error),
      browserVersion: browser?.version(),
      pageErrors,
      consoleErrors,
      state,
      xWindows: windows.stdout?.slice(-16_384),
      xFocus: focus.stdout,
      displayErrors: [windows.error?.message, focus.error?.message],
    })}\n`,
  );
  throw error;
} finally {
  await browser?.close();
  await vite.close();
}
