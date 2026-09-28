// Requires `npx playwright install firefox`; run headed under Xvfb or a desktop display.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: This standalone Node E2E script uses Node assertions, not a unit-test framework.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { firefox } = await import('playwright');
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const vite = await createServer({
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  root: projectRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/?seed=1&radius=64`;
  browser = await firefox.launch({ headless: false });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    // The merged menu defaults every HUD line off; enable its clock without an extra pointer gesture.
    localStorage.setItem('deadvox.hud-options', JSON.stringify({ clock: true }));
    const describe = (element) =>
      element
        ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().replaceAll(' ', '.')}` : ''}`
        : null;
    globalThis.__startGesture = {
      pointerDownTarget: null,
      clickTarget: null,
      pointerDownActive: false,
      audioResumeCalls: [],
      lockRequests: [],
      lockChanges: [],
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
        if (!globalThis.__startGesture.clickTarget) {
          globalThis.__startGesture.clickTarget = describe(event.target);
        }
      },
      true,
    );
    document.addEventListener('pointerlockchange', () => {
      globalThis.__startGesture.lockChanges.push(describe(document.pointerLockElement));
    });
    document.addEventListener('pointerlockerror', () => globalThis.__startGesture.lockChanges.push('error'));
    const { requestPointerLock } = Element.prototype;
    Element.prototype.requestPointerLock = function (...args) {
      const result = requestPointerLock.apply(this, args);
      globalThis.__startGesture.lockRequests.push({
        target: describe(this),
        returnsPromise: Boolean(result) && typeof result.then === 'function',
      });
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
  await page.goto(url);
  await page.evaluate(() => {
    globalThis.addEventListener('keydown', (event) => {
      if (event.code === 'F10') {
        globalThis.__startGesture.f10DefaultPrevented = event.defaultPrevented;
      }
    });
  });
  await page.locator('#go').click();
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('#view canvas');
      return canvas && document.pointerLockElement === canvas && document.querySelector('#overlay').hidden;
    },
    undefined,
    { timeout: 10_000 },
  );
  try {
    await page.waitForFunction(
      () => {
        const clock = document.querySelector('#hud')?.textContent ?? '';
        return clock.includes('Day 1, 19:31') && !clock.includes('paused');
      },
      undefined,
      { timeout: 20_000 },
    );
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      hud: document.querySelector('#hud')?.textContent,
      errors: document.querySelector('#errors')?.textContent,
      gesture: globalThis.__startGesture,
      pointerLock: globalThis.document.pointerLockElement?.tagName,
    }));
    throw new Error(
      `${String(error)}; pageErrors=${JSON.stringify(pageErrors)}; diagnostics=${JSON.stringify(diagnostics)}`,
      { cause: error },
    );
  }
  const result = await page.evaluate(() => ({
    overlayHidden: document.querySelector('#overlay').hidden,
    locked: document.pointerLockElement === document.querySelector('#view canvas'),
    clock: document.querySelector('#hud').textContent.split('\n')[0],
    gesture: globalThis.__startGesture,
  }));
  assert.equal(result.overlayHidden, true);
  assert.equal(result.locked, true);
  assert.equal(result.gesture.pointerDownTarget, result.gesture.clickTarget);
  assert.equal(result.gesture.pointerDownTarget, 'p#go.go');
  assert.ok(result.gesture.lockRequests.some((request) => request.target === 'canvas'));
  assert.ok(result.gesture.lockChanges.includes('canvas'));
  assert.ok(result.gesture.audioResumeCalls.some((call) => call.duringPointerDown));
  await page.keyboard.press('F10');
  assert.equal(await page.locator('#overlay').evaluate((panel) => panel.hidden), true);
  assert.equal(await page.evaluate(() => globalThis.__startGesture.f10DefaultPrevented), false);
  await page.keyboard.press('F9');
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('#view canvas');
      return !document.querySelector('#overlay').hidden && document.pointerLockElement === canvas;
    },
    undefined,
    { timeout: 5000 },
  );
  assert.ok(await page.locator('#audio-volume-master').count());
  await page.keyboard.press('F9');
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('#view canvas');
      return document.querySelector('#overlay').hidden && document.pointerLockElement === canvas;
    },
    undefined,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () => {
      const clock = document.querySelector('#hud')?.textContent ?? '';
      return clock.includes('Day 1, 19:32') && !clock.includes('paused');
    },
    undefined,
    { timeout: 20_000 },
  );
  assert.deepEqual(pageErrors, []);
} finally {
  await browser?.close();
  await vite.close();
}
