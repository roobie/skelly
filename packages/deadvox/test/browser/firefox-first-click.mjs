// Native first-gesture contract. Quarantined from CI: https://github.com/roobie/skelly/issues/168
// Run locally headed under Xvfb with DEBUG=pw:browser for browser-process diagnostics.
// Later menu/inventory contracts live in firefox-ui.mjs with explicitly synthetic lock setup.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { pressAction } from './input-actions.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const { firefox } = await import('playwright');
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const observation = {
  name: 'native-firefox-time-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    assert(code.includes(marker), 'game-loop observation point exists');
    return code.replace(
      marker,
      `  Object.assign(globalThis, { firefoxNativeSim: sim, firefoxNativeInitialTime: sim.time });\n${marker}`,
    );
  },
};
const vite = await createServer({
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  root: projectRoot,
  logLevel: 'error',
  plugins: [observation],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
let page;
const pageErrors = [];
const consoleErrors = [];
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await firefox.launch({ headless: false });
  page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
    if (message.type() === 'warning') {
      process.stderr.write(`Firefox warning: ${message.text()}\n`);
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('deadvox.hud-options', JSON.stringify({ clock: true }));
    const describe = (element) =>
      element
        ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${typeof element.className === 'string' && element.className ? `.${element.className.trim().replaceAll(' ', '.')}` : ''}`
        : null;
    globalThis.__startGesture = {
      pointerDownTarget: null,
      clickTarget: null,
      acceptedClickActive: false,
      audioResumeCalls: [],
      lockRequests: [],
      lockChanges: [],
      lockErrors: [],
    };
    document.addEventListener(
      'pointerdown',
      (event) => {
        globalThis.__startGesture.pointerDownTarget = describe(event.target);
      },
      true,
    );
    document.addEventListener(
      'click',
      (event) => {
        globalThis.__startGesture.clickTarget ??= describe(event.target);
        globalThis.__startGesture.acceptedClickActive = Boolean(event.target?.closest('#go') && event.isTrusted);
        setTimeout(() => {
          globalThis.__startGesture.acceptedClickActive = false;
        }, 0);
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
      });
      result?.catch((error) => globalThis.__startGesture.lockErrors.push(String(error)));
      return result;
    };
    const NativeAudioContext = globalThis.AudioContext;
    globalThis.AudioContext = class extends NativeAudioContext {
      resume() {
        globalThis.__startGesture.audioResumeCalls.push({
          duringAcceptedClick: globalThis.__startGesture.acceptedClickActive,
          userActivationActive: navigator.userActivation?.isActive,
        });
        return super.resume();
      }
    };
  });
  await page.goto(browserStageUrl('firefox-first-click', `http://127.0.0.1:${address.port}/?debug=1&seed=1&radius=64`));
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
    timeout: 30_000,
  });
  await page.bringToFront();
  await page.evaluate(() => window.focus());
  assert.equal(await page.evaluate(() => Boolean(globalThis.firefoxNativeSim)), false, 'title has no simulation');
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.firefoxNativeSim));
  const before = await page.evaluate(() => globalThis.firefoxNativeInitialTime);
  await page.waitForFunction(
    () => document.pointerLockElement === document.querySelector('#view') && document.querySelector('#overlay').hidden,
    null,
    { timeout: 10_000 },
  );
  await page.waitForFunction((time) => globalThis.firefoxNativeSim.time > time, before, { timeout: 20_000 });
  const gateCode = await page.evaluate(
    `import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.chords('debug.gate')[0].code)`,
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
  const godBefore = await page.evaluate(() => globalThis.firefoxNativeSim.godMode);
  await pressAction(page, 'debug.god-toggle', { includeGate: false });
  assert.equal(
    await page.evaluate(() => globalThis.firefoxNativeSim.godMode),
    godBefore,
    'plain debug key cannot author',
  );
  await pressAction(page, 'debug.god-toggle');
  assert.equal(
    await page.evaluate(() => globalThis.firefoxNativeSim.godMode),
    !godBefore,
    'held F2 authorizes one debug action',
  );
  await pressAction(page, 'debug.god-toggle', { includeGate: false });
  assert.equal(await page.evaluate(() => globalThis.firefoxNativeSim.godMode), !godBefore, 'gate release cannot latch');
  const gateEvents = await page.evaluate(() => globalThis.firefoxNativeGateEvents);
  assert.equal(gateEvents.length, 2);
  assert.ok(gateEvents.every((event) => event.trusted));
  assert.ok(gateEvents.some((event) => event.type === 'keydown' && event.prevented));
  assert.equal(page.context().pages().length, 1, 'debug gate opens no Help page or window');
  const gesture = await page.evaluate(() => globalThis.__startGesture);
  assert.equal(gesture.pointerDownTarget, gesture.clickTarget);
  assert.equal(gesture.pointerDownTarget, 'p#go.go');
  assert.equal(gesture.lockRequests.length, 1, 'one initial gesture makes one native lock request');
  assert.equal(gesture.lockRequests[0].target, 'main#view');
  assert.equal(gesture.lockRequests[0].userActivationActive, true);
  assert.ok(gesture.lockChanges.includes('main#view'));
  assert.ok(gesture.audioResumeCalls.some((call) => call.duringAcceptedClick && call.userActivationActive));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  process.stdout.write(
    'Firefox NATIVE first-gesture lock/audio/progress and F2-gated debug passed; menu/inventory are tested separately.\n',
  );
} catch (error) {
  let timer;
  const state = await Promise.race([
    page
      ?.evaluate(() => ({
        url: location.href,
        focus: document.hasFocus(),
        visibility: document.visibilityState,
        viewport: [innerWidth, innerHeight],
        status: document.querySelector('#save-status')?.textContent,
        errors: document.querySelector('#errors')?.textContent,
        overlayHidden: document.querySelector('#overlay')?.hidden,
        canvas: [...document.querySelectorAll('#view canvas')].map((canvas) => ({
          width: canvas.width,
          height: canvas.height,
          rect: canvas.getBoundingClientRect().toJSON(),
          display: getComputedStyle(canvas).display,
          visibility: getComputedStyle(canvas).visibility,
        })),
        gesture: globalThis.__startGesture,
        simTime: globalThis.firefoxNativeSim?.time,
      }))
      .catch((failure) => ({ evaluationError: String(failure) })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ unresponsive: true }), 5000);
    }),
  ]);
  clearTimeout(timer);
  const windows = spawnSync('xwininfo', ['-root', '-tree'], { encoding: 'utf8', timeout: 5000 });
  const focus = spawnSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { encoding: 'utf8', timeout: 5000 });
  process.stderr.write(
    `NATIVE_FIREFOX_FAILURE ${JSON.stringify({
      error: String(error),
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
