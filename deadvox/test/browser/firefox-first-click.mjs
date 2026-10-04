// Native first-gesture contract. Quarantined from CI: https://github.com/roobie/skelly/issues/168
// Run locally headed under Xvfb with DEBUG=pw:browser for browser-process diagnostics.
// Later menu/inventory contracts live in firefox-ui.mjs with explicitly synthetic lock setup.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
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
    return code.replace(marker, `  Object.assign(globalThis, { firefoxNativeSim: sim });\n${marker}`);
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
      pointerDownActive: false,
      audioResumeCalls: [],
      lockRequests: [],
      lockChanges: [],
      lockErrors: [],
    };
    document.addEventListener(
      'pointerdown',
      (event) => {
        globalThis.__startGesture.pointerDownTarget = describe(event.target);
        globalThis.__startGesture.pointerDownActive = true;
      },
      true,
    );
    document.addEventListener(
      'pointerup',
      () => {
        globalThis.__startGesture.pointerDownActive = false;
      },
      true,
    );
    document.addEventListener(
      'click',
      (event) => {
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
      });
      result?.catch((error) => globalThis.__startGesture.lockErrors.push(String(error)));
      return result;
    };
    const NativeAudioContext = globalThis.AudioContext;
    globalThis.AudioContext = class extends NativeAudioContext {
      resume() {
        globalThis.__startGesture.audioResumeCalls.push({
          duringPointerDown: globalThis.__startGesture.pointerDownActive,
        });
        return super.resume();
      }
    };
  });
  await page.goto(browserStageUrl('firefox-first-click', `http://127.0.0.1:${address.port}/?debug=1&seed=1&radius=64`));
  await page.waitForFunction(() => Boolean(globalThis.firefoxNativeSim && document.querySelector('#view')), null, {
    timeout: 30_000,
  });
  await page.bringToFront();
  await page.evaluate(() => window.focus());
  const before = await page.evaluate(() => globalThis.firefoxNativeSim.time);
  await page.locator('#go').click();
  await page.waitForFunction(
    () => document.pointerLockElement === document.querySelector('#view') && document.querySelector('#overlay').hidden,
    null,
    { timeout: 10_000 },
  );
  await page.waitForFunction((time) => globalThis.firefoxNativeSim.time > time, before, { timeout: 20_000 });
  const gesture = await page.evaluate(() => globalThis.__startGesture);
  assert.equal(gesture.pointerDownTarget, gesture.clickTarget);
  assert.equal(gesture.pointerDownTarget, 'p#go.go');
  assert.equal(gesture.lockRequests.length, 1, 'one initial gesture makes one native lock request');
  assert.equal(gesture.lockRequests[0].target, 'div#view');
  assert.equal(gesture.lockRequests[0].userActivationActive, true);
  assert.ok(gesture.lockChanges.includes('div#view'));
  assert.ok(gesture.audioResumeCalls.some((call) => call.duringPointerDown));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  process.stdout.write(
    'Firefox NATIVE first-gesture lock/audio/progress passed; menu/inventory are tested separately.\n',
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
