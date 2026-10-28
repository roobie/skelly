// biome-ignore-all lint/performance/noAwaitInLoops: browser focus and physical key edges must be observed in order.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone diagnostic, not a unit test stage.
// Temporary probe, removed before merge. Automation cannot prove desktop shortcut immunity.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const { chromium, firefox } = await import('playwright');

const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><title>Alt feasibility probe</title><button id="lock">Lock pointer</button>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const snapshot = (page) =>
  page.evaluate(() => ({
    events: globalThis.altProbe.events,
    locked: Boolean(document.pointerLockElement),
    focused: document.hasFocus(),
    hidden: document.hidden,
    heldRaw: globalThis.altProbe.heldRaw,
    heldClearedOnBlur: globalThis.altProbe.heldClearedOnBlur,
  }));

const install = (page, cancelAlt) =>
  page.evaluate((cancel) => {
    const state = { events: [], heldRaw: false, heldClearedOnBlur: false };
    globalThis.altProbe = state;
    const record = (kind, data = {}) => {
      state.events.push({
        kind,
        ...data,
        locked: Boolean(document.pointerLockElement),
        focused: document.hasFocus(),
        hidden: document.hidden,
      });
    };
    for (const kind of ['keydown', 'keyup']) {
      globalThis.addEventListener(kind, (event) => {
        if (cancel && event.code === 'AltLeft') {
          event.preventDefault();
        }
        if (event.code === 'AltLeft') {
          state.heldRaw = kind === 'keydown';
          state.heldClearedOnBlur = kind === 'keydown';
        }
        record(kind, {
          code: event.code,
          repeat: event.repeat,
          trusted: event.isTrusted,
          cancelable: event.cancelable,
          defaultPrevented: event.defaultPrevented,
          altKey: event.altKey,
        });
      });
    }
    globalThis.addEventListener('blur', () => {
      state.heldClearedOnBlur = false;
      record('blur');
    });
    globalThis.addEventListener('focus', () => record('focus'));
    document.addEventListener('visibilitychange', () => record('visibilitychange'));
    document.addEventListener('pointerlockchange', () => record('pointerlockchange'));
    document.addEventListener('pointerlockerror', () => record('pointerlockerror'));
    document.addEventListener('mousemove', (event) => {
      record('mousemove', { x: event.movementX, y: event.movementY, trusted: event.isTrusted });
    });
    document.querySelector('#lock').addEventListener('click', () => {
      document.body.requestPointerLock();
    });
  }, cancelAlt);

const lock = async (page) => {
  await page.bringToFront();
  await page.click('#lock');
  await page.waitForFunction(() => Boolean(document.pointerLockElement), null, { timeout: 5000 });
};

const trial = async (context, cancelAlt) => {
  const page = await context.newPage();
  try {
    await page.goto(url);
    await install(page, cancelAlt);
    await lock(page);
    await page.keyboard.down('AltLeft');
    await page.mouse.move(300, 200);
    await page.mouse.move(340, 220);
    // This delay observes spontaneous repeat, not simulated game work. Playwright does not promise OS autorepeat.
    await delay(1000);
    const held = await snapshot(page);
    await page.keyboard.down('AltLeft');
    const explicitRepeat = await snapshot(page);
    await page.keyboard.up('AltLeft');
    const released = await snapshot(page);
    await page.keyboard.press('KeyW');
    const afterOrdinaryKey = await snapshot(page);
    return { cancelAlt, held, explicitRepeat, released, afterOrdinaryKey };
  } finally {
    await page.close();
  }
};

const blurTrial = async (context) => {
  const page = await context.newPage();
  const other = await context.newPage();
  try {
    await page.goto(url);
    await other.goto(url);
    await install(page, true);
    await install(other, true);
    await lock(page);
    await page.keyboard.down('AltLeft');
    await other.bringToFront();
    await page.waitForFunction(() => globalThis.altProbe.events.some((event) => event.kind === 'blur'), null, {
      timeout: 5000,
    });
    const blurred = await snapshot(page);
    // Release belongs to the newly focused page; do not fabricate a release on the blurred page.
    await other.keyboard.up('AltLeft');
    const releaseRecipient = await snapshot(other);
    await page.bringToFront();
    await page.keyboard.press('KeyW');
    return { blurred, releaseRecipient, returned: await snapshot(page) };
  } finally {
    await other.close();
    await page.close();
  }
};

let failed = false;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    let browser;
    try {
      browser = await engine.launch({ headless: false, args: name === 'chromium' ? ['--no-sandbox'] : [] });
      const context = await browser.newContext();
      const cancelled = await trial(context, true);
      const uncancelled = await trial(context, false);
      const blur = await blurTrial(context);
      const result = {
        browser: name,
        version: browser.version(),
        method: 'headed Playwright trusted input',
        cancelled,
        uncancelled,
        blur,
      };
      process.stdout.write(`${JSON.stringify(result)}\n`);
      const altEvents = cancelled.released.events.filter((event) => event.code === 'AltLeft');
      assert.ok(
        altEvents.some((event) => event.kind === 'keydown' && !event.repeat),
        'initial Alt arrives',
      );
      assert.ok(
        altEvents.some((event) => event.kind === 'keydown' && event.repeat),
        'explicit repeated down arrives',
      );
      assert.ok(
        altEvents.some((event) => event.kind === 'keyup'),
        'Alt release arrives',
      );
      assert.ok(
        altEvents.every((event) => event.trusted && event.defaultPrevented),
        'both Alt edges are trusted and cancelled',
      );
      assert.ok(cancelled.held.locked && cancelled.released.locked, 'pointer lock survives held Alt and release');
      assert.ok(
        cancelled.afterOrdinaryKey.events.some((event) => event.code === 'KeyW'),
        'page receives ordinary key after release',
      );
      assert.ok(
        cancelled.held.events.some(
          (event) => event.kind === 'mousemove' && event.locked && (event.x !== 0 || event.y !== 0),
        ),
        'locked mouse movement arrives',
      );
      await context.close();
    } catch (error) {
      failed = true;
      process.stdout.write(`${JSON.stringify({ browser: name, error: String(error), stack: error.stack })}\n`);
    } finally {
      await browser?.close();
    }
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
process.exitCode = failed ? 1 : 0;
