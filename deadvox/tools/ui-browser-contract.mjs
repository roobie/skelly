// biome-ignore-all lint/correctness/noNodejsModules: opt-in end-to-end test launches local Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: readiness polling is deliberate
// biome-ignore-all lint/style/noProcessEnv: local test-runner configuration is env-driven
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative CDP contract assertions

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = process.cwd();
const profile = await mkdtemp(join(tmpdir(), 'deadvox-ui-contract-'));
const port = Number(process.env.UI_TEST_PORT ?? 5198);
const cdpPort = Number(process.env.UI_TEST_CDP_PORT ?? 9238);
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', `${port}`, '--strictPort'],
  {
    cwd,
    stdio: 'ignore',
  },
);
const chrome = spawn(
  process.env.CHROME_BIN ?? 'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-extensions',
    '--enable-webgl',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
    `http://127.0.0.1:${port}/?debug=1`,
  ],
  { stdio: 'ignore' },
);

const waitFor = async (test, message, timeout = 30_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await test()) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out: ${message}`);
};
const getPage = async () => {
  const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
  return pages.find((page) => page.type === 'page' && page.url.includes(`127.0.0.1:${port}`));
};

let ws;
try {
  await waitFor(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return true;
    } catch {
      return false;
    }
  }, 'Vite server');
  await waitFor(async () => Boolean(await getPage()), 'Chrome page');
  const page = await getPage();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!(message.id && pending.has(message.id))) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      const requestId = id;
      pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }
    return result.result.value;
  };
  const press = async (code, key, virtualKey) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: virtualKey });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: virtualKey });
    await delay(80);
  };

  await send('Runtime.enable');
  await waitFor(
    () => evaluate("Boolean(document.querySelector('#debug-ui-root') && document.querySelector('canvas'))"),
    'debug UI mount',
  );
  await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    let locked = false;
    window.__pointerCalls = { request: 0, exit: 0 };
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked ? canvas : null });
    canvas.requestPointerLock = () => {
      window.__pointerCalls.request++;
      locked = true;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      window.__pointerCalls.exit++;
      locked = false;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    window.__setPointerLocked = (value) => {
      locked = value;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    window.__f10Prevented = false;
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F10') setTimeout(() => { window.__f10Prevented = event.defaultPrevented; }, 0);
    });
    document.querySelector('#go').click();
    window.__pointerCalls.request = 0;
  })()`);
  await delay(150);

  // Each menu route is exercised with real browser key events; none may recapture/release pointer lock.
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("!document.querySelector('#inventory').hidden"), true, 'Tab opens inventory');
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("document.querySelector('#inventory').hidden"), true, 'Tab closes inventory');
  await press('F10', 'F10', 121);
  assert.equal(await evaluate("!document.querySelector('#overlay').hidden"), true, 'F10 opens main menu');
  assert.equal(await evaluate('window.__f10Prevented'), true, 'F10 keydown is default-prevented');
  await press('F10', 'F10', 121);
  assert.equal(await evaluate("document.querySelector('#overlay').hidden"), true, 'F10 closes main menu');
  await press('KeyG', 'g', 71);
  assert.equal(await evaluate("!document.querySelector('#spawn').hidden"), true, 'G opens spawn menu');
  assert.equal(
    await evaluate("document.querySelector('#spawn input').value"),
    '',
    'G is not typed into the focused search field',
  );
  await press('KeyG', 'g', 71);
  assert.equal(await evaluate("document.querySelector('#spawn').hidden"), true, 'G closes spawn menu');
  await press('Backquote', '`', 192);
  assert.equal(await evaluate("!document.querySelector('.debug-panel').hidden"), true, 'Backquote opens debug panel');
  await press('Backquote', '`', 192);
  assert.equal(await evaluate("document.querySelector('.debug-panel').hidden"), true, 'Backquote closes debug panel');
  assert.deepEqual(
    await evaluate('window.__pointerCalls'),
    { request: 0, exit: 0 },
    'menu keys leave pointer lock alone',
  );

  const toggles = await evaluate("[...document.querySelectorAll('#hud-options input')].map((input) => input.checked)");
  assert.equal(
    toggles.every((checked) => !checked),
    true,
    'all HUD settings start off',
  );
  await press('Tab', 'Tab', 9);
  assert.equal(
    await evaluate("!document.querySelector('#inventory-stats').hidden"),
    true,
    'inventory always shows stats',
  );
  assert.equal(
    await evaluate(
      "['health', 'food', 'water'].every((word) => document.querySelector('#inventory-stats').textContent.includes(word))",
    ),
    true,
  );
  await press('Tab', 'Tab', 9);

  // With a menu open and pointer locked, move the drawn cursor, dispatch a click to its target,
  // and verify both a button handler and input focus receive the forwarded click.
  await press('KeyG', 'g', 71);
  await evaluate('window.__setPointerLocked(true)');
  await delay(100);
  let cursor = await evaluate('({ x: innerWidth / 2, y: innerHeight / 2 })');
  const clickAt = async (selector) => {
    const position = await evaluate(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await evaluate(`(() => {
      const event = new MouseEvent('mousemove', { bubbles: true });
      Object.defineProperties(event, { movementX: { value: ${position.x - cursor.x} }, movementY: { value: ${position.y - cursor.y} } });
      document.dispatchEvent(event);
      document.querySelector('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    })()`);
    cursor = position;
    await delay(120);
  };
  await clickAt('#spawn .spawn-list button');
  assert.notEqual(
    await evaluate("document.querySelector('#spawn .spawn-status').textContent"),
    '',
    'cursor click fires spawn handler',
  );
  await evaluate("document.querySelector('#spawn input').blur()");
  await clickAt('#spawn input');
  assert.equal(
    await evaluate("document.activeElement === document.querySelector('#spawn input')"),
    true,
    'cursor click focuses search field',
  );

  await evaluate('window.__setPointerLocked(false)');
  await delay(100);
  assert.equal(
    await evaluate("!document.querySelector('#overlay').hidden"),
    true,
    'unlock pointerlockchange opens main menu',
  );
  assert.deepEqual(
    await evaluate('window.__pointerCalls'),
    { request: 0, exit: 0 },
    'unlock event does not call lock APIs',
  );
  process.stdout.write(
    'UI browser contract passed: G search, menu pointer-lock behavior, cursor clicks/focus, unlock, F10, inventory stats.\n',
  );
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
  vite.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(5000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
