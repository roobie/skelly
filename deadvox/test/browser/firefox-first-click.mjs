// Requires `npx playwright install firefox`; run headed under Xvfb or a desktop display.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: This standalone Node E2E script uses Node assertions, not a unit-test framework.
import assert from 'node:assert/strict';
import process from 'node:process';
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
  const url = `http://127.0.0.1:${address.port}/?debug=1&seed=1&radius=64`;
  browser = await firefox.launch({ headless: false });
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
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
  await page.goto(url);
  await page.waitForFunction(
    () => {
      const status = document.querySelector('#save-status')?.textContent ?? '';
      return status.includes('Title screen ready');
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.bringToFront();
  await page.evaluate(() => {
    window.focus();
    globalThis.addEventListener('keydown', (event) => {
      if (event.code === 'F10') {
        globalThis.__startGesture.f10DefaultPrevented = event.defaultPrevented;
      }
    });
  });
  await page.locator('#go').click();
  try {
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('#view canvas');
        return canvas && document.pointerLockElement === canvas && document.querySelector('#overlay').hidden;
      },
      undefined,
      { timeout: 10_000 },
    );
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      errors: document.querySelector('#errors')?.textContent,
      overlayHidden: document.querySelector('#overlay')?.hidden,
      canvas: Boolean(document.querySelector('#view canvas')),
      pointerLock: document.pointerLockElement?.tagName,
      gesture: globalThis.__startGesture,
    }));
    throw new Error(
      `${String(error)}; pageErrors=${JSON.stringify(pageErrors)}; diagnostics=${JSON.stringify(diagnostics)}`,
      {
        cause: error,
      },
    );
  }
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
  let cursor = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  const moveCursorTo = async (position) => {
    const movement = { x: position.x - cursor.x, y: position.y - cursor.y };
    await page.evaluate(({ x, y }) => {
      const canvas = document.querySelector('canvas');
      const event = new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: -1,
        buttons: 0,
        clientX: innerWidth / 2,
        clientY: innerHeight / 2,
      });
      Object.defineProperties(event, { movementX: { value: x }, movementY: { value: y } });
      canvas.dispatchEvent(event);
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: innerWidth / 2,
          clientY: innerHeight / 2,
          movementX: x,
          movementY: y,
        }),
      );
    }, movement);
    cursor = position;
    await page.waitForTimeout(100);
  };
  const clickGameElement = async (selector) => {
    const rect = await page.locator(selector).boundingBox();
    assert(rect);
    await moveCursorTo({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    await page.evaluate(() =>
      document.querySelector('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
    );
  };

  await page.keyboard.press('g');
  await page.locator('#spawn input').fill('bandage');
  await clickGameElement('#spawn .spawn-list button');
  assert.match(
    (await page.locator('#spawn .spawn-status').textContent()) ?? '',
    /is at your feet/,
    'debug spawn creates a pickup pile',
  );
  await page.locator('#spawn input').evaluate((input) => input.blur());
  await page.keyboard.press('g');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => !document.querySelector('#inventory')?.hidden);

  const dispatchPointer = async (eventType, pointerButton, pressedButtons) => {
    await page.evaluate(
      ({ type, button, buttons }) =>
        document.querySelector('canvas').dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button,
            buttons,
            clientX: innerWidth / 2,
            clientY: innerHeight / 2,
          }),
        ),
      { type: eventType, button: pointerButton, buttons: pressedButtons },
    );
  };
  const drag = async (source, target) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    assert(sourceBox && targetBox);
    await moveCursorTo({ x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 });
    await dispatchPointer('pointerdown', 0, 1);
    await moveCursorTo({ x: targetBox.x + 16, y: targetBox.y + 16 });
    await dispatchPointer('pointerup', -1, 0);
  };

  const floorItem = page.locator('#inventory .inv-grid[data-target^="pile:"] .inv-item').filter({ hasText: 'Bandage' });
  assert.equal(await floorItem.count(), 1, 'spawned bandage is in the floor pile');
  await drag(floorItem, page.locator('#inventory .inv-grid[data-target="pocket:1:0"]'));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(2500);
  await page.keyboard.press('Tab');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#inventory .inv-item')].some(
        (item) =>
          item.querySelector('.inv-item-name')?.textContent === 'Bandage' &&
          item.closest('.inv-grid')?.dataset.target === 'pocket:1:0',
      ),
    undefined,
    { timeout: 5000 },
  );

  const beans = page.locator('#inventory .inv-item').filter({ hasText: 'Can of beans' }).first();
  await drag(beans, page.locator('#inventory .inv-grid[data-target="pocket:1:1"]'));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(2500);
  await page.keyboard.press('Tab');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#inventory .inv-item')].some(
        (item) =>
          item.querySelector('.inv-item-name')?.textContent === 'Can of beans' &&
          item.closest('.inv-grid')?.dataset.target === 'pocket:1:1',
      ),
    undefined,
    { timeout: 5000 },
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  process.stdout.write(
    'Firefox browser contract passed: floor pickup, pocket-to-pocket drag/drop, pointer-lock startup.\n',
  );
} finally {
  await browser?.close();
  await vite.close();
}
