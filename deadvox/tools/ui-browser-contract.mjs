// biome-ignore-all lint/correctness/noNodejsModules: opt-in end-to-end test launches local Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: readiness polling is deliberate
// biome-ignore-all lint/style/noProcessEnv: local test-runner configuration is env-driven
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative CDP contract assertions

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = process.cwd();
const profile = await mkdtemp(join(tmpdir(), 'deadvox-ui-contract-'));
const freePort = async () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
const port = Number(process.env.UI_TEST_PORT ?? (await freePort()));
const cdpPort = Number(process.env.UI_TEST_CDP_PORT ?? (await freePort()));
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
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--enable-webgl',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
    // The contract tests UI, not the look: without a GPU the post chain and shadows make each frame several times slower.
    `http://127.0.0.1:${port}/?debug=1&post=0&sunshadow=0&torchshadow=0`,
  ],
  { stdio: 'ignore' },
);
let viteStartupError;
let chromeStartupError;
vite.on('error', (error) => {
  viteStartupError = error;
});
chrome.on('error', (error) => {
  chromeStartupError = error;
});

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
    if (viteStartupError || vite.exitCode !== null) {
      throw new Error(`Vite failed to start: ${viteStartupError?.message ?? vite.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      return response.ok;
    } catch {
      return false;
    }
  }, 'Vite server');
  await waitFor(async () => {
    if (chromeStartupError || chrome.exitCode !== null) {
      throw new Error(`Chrome failed to start: ${chromeStartupError?.message ?? chrome.exitCode}`);
    }
    try {
      return Boolean(await getPage());
    } catch {
      return false;
    }
  }, 'Chrome page');
  const page = await getPage();
  if (!page) {
    throw new Error('Chrome page disappeared after startup');
  }
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
  const lastKeyEvent = async (code) =>
    evaluate(`window.__keyEvents.filter((event) => event.code === ${JSON.stringify(code)}).at(-1)`);

  await send('Runtime.enable');
  await waitFor(
    () => evaluate("Boolean(document.querySelector('#debug-ui-root') && document.querySelector('canvas'))"),
    'debug UI mount',
  );
  const keyBindings = await evaluate("import('/src/game/input.ts').then(({ KEY_BINDINGS }) => KEY_BINDINGS)");
  const pressBinding = async (binding) => press(binding.code, binding.label, binding.virtualKeyCode);
  await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    let locked = false;
    window.__pointerCalls = { request: 0, exit: 0 };
    window.__rejectNextPointerLock = false;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked ? canvas : null });
    canvas.requestPointerLock = () => {
      window.__pointerCalls.request++;
      if (window.__rejectNextPointerLock) {
        window.__rejectNextPointerLock = false;
        setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
        return Promise.reject(new Error('pointer lock refused by contract stub'));
      }
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
    window.__keyEvents = [];
    const hitTest = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x, y) => {
      const target = hitTest(x, y);
      window.__lastHitTest = {
        x,
        y,
        insideGo: Boolean(target?.closest('#go')),
        buttonText: target?.closest('button')?.textContent?.trim() ?? '',
      };
      return target;
    };
    document.addEventListener('click', (event) => {
      if (event.target !== canvas) {
        window.__lastForwardedClick = {
          x: event.clientX,
          y: event.clientY,
          hitTest: window.__lastHitTest,
        };
      }
    }, true);
    window.addEventListener('keydown', (event) => {
      const { code } = event;
      setTimeout(() => window.__keyEvents.push({ code, defaultPrevented: event.defaultPrevented }), 0);
    });
    document.querySelector('#go').click();
    window.__pointerCalls.request = 0;
  })()`);
  await delay(150);
  assert.equal(
    await evaluate(`(() => {
      const slots = [...document.querySelectorAll('#quickbar .qb-empty')];
      return slots.length === 5 && slots.every((slot) => {
        const text = slot.textContent.toLowerCase();
        return text.includes('empty') && !text.includes('inventory');
      });
    })()`),
    true,
    'rendered empty quickbar slots contain no inventory help text',
  );
  let cursor = await evaluate('({ x: innerWidth / 2, y: innerHeight / 2 })');
  const moveCursorTo = async (position) => {
    await evaluate(`(() => {
      const event = new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: -1,
        buttons: 0,
      });
      Object.defineProperties(event, {
        movementX: { value: ${position.x - cursor.x} },
        movementY: { value: ${position.y - cursor.y} },
      });
      document.querySelector('canvas').dispatchEvent(event);
    })()`);
    cursor = position;
    await delay(120);
  };
  const dispatchPointer = async (type, button, buttons) =>
    evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent(${JSON.stringify(type)}, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: ${button},
      buttons: ${buttons},
    }))`);
  const dispatchPointerAt = async (type, button, buttons, position) =>
    evaluate(`document.querySelector('canvas').dispatchEvent(new PointerEvent(${JSON.stringify(type)}, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: ${button}, buttons: ${buttons}, clientX: ${position.x}, clientY: ${position.y},
    }))`);
  const clickAt = async (selector, anchor = 'center') => {
    await evaluate('window.__lastForwardedClick = null');
    const position = await evaluate(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return ${JSON.stringify(anchor)} === 'edge'
        ? { x: rect.left + 1, y: rect.top + 1 }
        : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await moveCursorTo(position);
    await evaluate(`window.__cursorBeforeClick = (() => {
      const cursor = document.querySelector('#game-cursor');
      const rect = cursor.getBoundingClientRect();
      const style = getComputedStyle(cursor);
      return {
        left: rect.left,
        top: rect.top,
        hand: cursor.classList.contains('hand'),
        hitTest: window.__lastHitTest,
        mask: style.maskImage,
        background: style.backgroundColor,
        blend: style.mixBlendMode,
        rootBlend: getComputedStyle(document.querySelector('#game-cursor-root')).mixBlendMode,
      };
    })()`);
    await dispatchPointer('pointerdown', 0, 1);
    await dispatchPointer('pointerup', -1, 0);
    await evaluate(
      `document.querySelector('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))`,
    );
    await delay(120);
  };

  // Each menu route is exercised with real browser key events; none may recapture/release pointer lock.
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("!document.querySelector('#inventory').hidden"), true, 'Tab opens inventory');
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("document.querySelector('#inventory').hidden"), true, 'Tab closes inventory');
  assert.equal(
    await evaluate("document.querySelector('[data-key-binding=mainMenu]').textContent"),
    keyBindings.mainMenu.label,
    'help label comes from the key binding table',
  );
  await pressBinding(keyBindings.mainMenu);
  assert.equal(await evaluate("!document.querySelector('#overlay').hidden"), true, 'menu key opens main menu');
  assert.equal(
    (await lastKeyEvent(keyBindings.mainMenu.code)).defaultPrevented,
    true,
    'menu key is consumed by the game',
  );
  assert.equal(
    await evaluate("Boolean(document.querySelector('#audio-volume-world'))"),
    true,
    'audio controls are in the F9 menu',
  );
  const menuCenter = await evaluate(`(() => {
    const rect = document.querySelector('#overlay .card').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await moveCursorTo(menuCenter);
  await evaluate(
    "document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 500 }))",
  );
  assert.ok(
    await evaluate("document.querySelector('#overlay .card').scrollTop > 0"),
    'wheel scrolls the locked main menu',
  );
  await clickAt('#audio-volume-world');
  const savedWorldVolume = Number(await evaluate("document.querySelector('#audio-volume-world').value"));
  assert.notEqual(savedWorldVolume, 0.8, 'F9 menu click changes the world volume slider');
  assert.equal(
    await evaluate("JSON.parse(localStorage.getItem('deadvox.audio.settings')).world"),
    savedWorldVolume,
    'world volume is persisted to localStorage',
  );
  const restoredVolumes = await evaluate(`import('/src/game/audio.ts').then(({ GameAudio }) => new GameAudio({
    registry: { sounds: new Map(), soundOrigins: new Map() },
    seed: 1,
    blockSize: 1,
    isSolid: () => false,
    report: () => {},
  }).settings)`);
  assert.equal(restoredVolumes.world, savedWorldVolume, 'a fresh audio instance reads the persisted volume');
  await clickAt('#hud-options label:nth-of-type(2)');
  assert.equal(
    await evaluate("document.querySelectorAll('#hud-options input')[1].checked"),
    true,
    'drawn cursor toggles F9 menu controls',
  );
  await delay(300);
  assert.match(
    await evaluate("document.querySelector('#hud').textContent"),
    /paused/,
    'main menu pauses the simulation',
  );
  await pressBinding(keyBindings.mainMenu);
  assert.equal(await evaluate("document.querySelector('#overlay').hidden"), true, 'menu key closes the menu');
  await delay(300);
  assert.doesNotMatch(
    await evaluate("document.querySelector('#hud').textContent"),
    /paused/,
    'closing the menu resumes the simulation',
  );
  await pressBinding(keyBindings.mainMenu);
  assert.equal(await evaluate("!document.querySelector('#overlay').hidden"), true, 'menu key can open the menu again');
  assert.equal(
    Number(await evaluate("document.querySelector('#audio-volume-world').value")),
    savedWorldVolume,
    'audio volume remains selected when the menu reopens',
  );
  await clickAt('#hud-options label:nth-of-type(2)');
  assert.equal(
    await evaluate("document.querySelectorAll('#hud-options input')[1].checked"),
    false,
    'drawn cursor can reset menu controls',
  );
  await clickAt('#go', 'edge');
  const arrowTip = await evaluate(`(() => {
    const click = window.__lastForwardedClick;
    const cursor = window.__cursorBeforeClick;
    return {
      hand: cursor.hand,
      x: cursor.left,
      y: cursor.top,
      mask: cursor.mask,
      background: cursor.background,
      blend: cursor.blend,
      rootBlend: cursor.rootBlend,
      hitGo: click.hitTest.insideGo,
      hitX: click.hitTest.x,
      hitY: click.hitTest.y,
    };
  })()`);
  assert.equal(arrowTip.hand, false, 'main-menu cursor uses the standard arrow');
  assert.match(arrowTip.mask, /cursor\.png/, 'cursor sprite is used as a silhouette mask');
  assert.equal(arrowTip.background, 'rgb(255, 255, 255)', 'cursor mask is filled white');
  assert.equal(arrowTip.blend, 'difference', 'the cursor is difference-blended');
  assert.equal(arrowTip.rootBlend, 'difference', 'the cursor layer blends over the canvas');
  assert.equal(arrowTip.hitGo, true, 'elementFromPoint at the arrow tip targets the known button edge');
  assert.ok(Math.abs(arrowTip.x - cursor.x) < 0.1, 'standard arrow tip is at cursor x');
  assert.ok(Math.abs(arrowTip.y - cursor.y) < 0.1, 'standard arrow tip is at cursor y');
  assert.ok(Math.abs(arrowTip.hitX - cursor.x) < 0.1, 'arrow-tip hit test uses cursor x');
  assert.ok(Math.abs(arrowTip.hitY - cursor.y) < 0.1, 'arrow-tip hit test uses cursor y');
  assert.equal(await evaluate("document.querySelector('#overlay').hidden"), true, 'edge click resumes play');
  const browserKeyEventsBefore = await evaluate('window.__keyEvents.length');
  await pressBinding(keyBindings.browserMenuBar);
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'browser-owned key does nothing in game',
  );
  const browserKeyEvent = await evaluate(
    `window.__keyEvents.slice(${browserKeyEventsBefore}).find((event) => event.code === ${JSON.stringify(keyBindings.browserMenuBar.code)})`,
  );
  assert.ok(browserKeyEvent, 'browser-owned key reaches the page in Chrome');
  assert.equal(browserKeyEvent.defaultPrevented, false, 'game leaves the browser-owned key unprevented');
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
  assert.equal(
    await evaluate("Boolean(document.querySelector('.debug-shambler-count output'))"),
    true,
    'debug panel has a shambler count control',
  );
  assert.equal(await evaluate("document.querySelector('.debug-shambler-count output').textContent"), '1');
  assert.match(
    await evaluate(
      "Array.from(document.querySelectorAll('.debug-actions button')).find((button) => button.textContent.includes('Spawn 1 shamblers')).textContent",
    ),
    /Spawn 1 shamblers \(V\)/,
  );
  await clickAt('[aria-label="Increase shambler count"]');
  assert.equal(await evaluate("document.querySelector('.debug-shambler-count output').textContent"), '2');
  assert.equal(await evaluate("localStorage.getItem('deadvox.shambler-spawn-count')"), '2');
  assert.match(
    await evaluate(
      "Array.from(document.querySelectorAll('.debug-actions button')).find((button) => button.textContent.includes('Spawn 2 shamblers')).textContent",
    ),
    /Spawn 2 shamblers \(V\)/,
  );
  await press('Backquote', '`', 192);
  assert.equal(await evaluate("document.querySelector('.debug-panel').hidden"), true, 'Backquote closes debug panel');
  await press('Backquote', '`', 192);
  assert.equal(
    await evaluate("document.querySelector('.debug-shambler-count output').textContent"),
    '2',
    'spawn count remains selected',
  );
  await clickAt('[aria-label="Decrease shambler count"]');
  assert.equal(await evaluate("document.querySelector('.debug-shambler-count output').textContent"), '1');
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Decrease shambler count"]\').disabled'), true);
  await press('KeyV', 'v', 86);
  assert.match(
    await evaluate("document.querySelector('#shambler-spawn-status').textContent"),
    /^Placed \d+ of 1$/,
    'V reports the number placed out of the selected count',
  );
  await press('KeyO', 'o', 79);
  await press('Backquote', '`', 192);
  assert.deepEqual(
    await evaluate('window.__pointerCalls'),
    { request: 0, exit: 0 },
    'menu keys leave pointer lock alone',
  );

  await press('KeyG', 'g', 71);
  const spawnNames = await evaluate(`Array.from(document.querySelectorAll('#spawn .spawn-list button'))
    .map((button, index) => ({ index, name: button.querySelector('span')?.textContent }))
    .filter(({ name }) => name && name !== 'Can of beans')
    .slice(0, 24)`);
  assert.ok(spawnNames.length >= 20, 'debug spawn menu has enough distinct items for a scroll regression');
  for (const { index } of spawnNames) {
    await evaluate(
      `document.querySelector('#spawn .spawn-list button:nth-child(${index + 1})').scrollIntoView({ block: 'center' })`,
    );
    await clickAt(`#spawn .spawn-list button:nth-child(${index + 1})`);
  }
  await press('KeyG', 'g', 71);
  if (!(await evaluate("document.querySelector('#overlay').hidden"))) {
    await clickAt('#go', 'edge');
  }
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'play is resumed before inventory queue checks',
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
  const inventoryScroll = await evaluate(`(() => {
    const pane = document.querySelectorAll('#inventory .inv-pane')[1];
    pane.scrollTop = Math.min(40, pane.scrollHeight - pane.clientHeight);
    const view = pane.getBoundingClientRect();
    const visible = [...pane.querySelectorAll('.inv-item')].find((node) => {
      const item = node.getBoundingClientRect();
      return node.querySelector('.inv-item-name')?.textContent === 'AA battery' && item.bottom > view.top && item.top < view.bottom;
    });
    return {
      top: pane.scrollTop,
      overflow: pane.scrollHeight - pane.clientHeight,
      uid: visible?.dataset.uid,
      name: visible?.querySelector('.inv-item-name')?.textContent,
    };
  })()`);
  assert.ok(inventoryScroll.overflow > 1, 'nearby pane has enough items to scroll');
  assert.ok(inventoryScroll.uid, 'a nearby item is visible to select');
  await clickAt(`#inventory [data-uid="${inventoryScroll.uid}"]`);
  assert.equal(
    await evaluate("document.querySelector('#inventory .inv-details h3')?.textContent"),
    inventoryScroll.name,
  );
  let paneTop = await evaluate("document.querySelectorAll('#inventory .inv-pane')[1].scrollTop");
  assert.ok(
    Math.abs(paneTop - inventoryScroll.top) <= 1,
    `scroll survives selecting an item (${inventoryScroll.top} -> ${paneTop})`,
  );

  await press('KeyE', 'e', 69);
  assert.notEqual(
    await evaluate("document.querySelector('#inventory .inv-queue').textContent.includes('Nothing queued')"),
    true,
    'selected item queues a move',
  );
  paneTop = await evaluate("document.querySelectorAll('#inventory .inv-pane')[1].scrollTop");
  assert.ok(Math.abs(paneTop - inventoryScroll.top) <= 1, 'scroll survives queueing a move');
  await waitFor(
    () => evaluate("document.querySelector('#inventory .inv-queue').textContent.includes('Nothing queued')"),
    'inventory handling job completes',
    15_000,
  );
  paneTop = await evaluate("document.querySelectorAll('#inventory .inv-pane')[1].scrollTop");
  assert.ok(Math.abs(paneTop - inventoryScroll.top) <= 1, 'scroll survives handling completion');

  const transfer = await evaluate(`(() => {
    const item = [...document.querySelectorAll('#inventory .inv-item')].find((node) => node.querySelector('.inv-item-name')?.textContent === 'Can of beans');
    const legs = [...document.querySelectorAll('#inventory .inv-worn')].find((node) => node.querySelector('.inv-slot-label')?.textContent === 'Legs');
    const grid = [...legs.querySelectorAll('.inv-grid')].find((node) => !node.querySelector('[data-uid]'));
    const itemRect = item.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    return {
      source: { x: itemRect.left + itemRect.width / 2, y: itemRect.top + itemRect.height / 2 },
      sourceTarget: item.closest('.inv-grid').dataset.target,
      destination: { x: gridRect.left + 16, y: gridRect.top + 16 },
      target: grid.dataset.target,
    };
  })()`);
  assert.match(transfer.sourceTarget, /^pocket:/, 'source item is in a container pocket');
  await moveCursorTo(transfer.source);
  await evaluate(`document.elementFromPoint(${transfer.source.x}, ${transfer.source.y}).dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
    clientX: ${transfer.source.x}, clientY: ${transfer.source.y},
  }))`);
  assert.equal(
    await evaluate("document.querySelector('#inventory .inv-details h3')?.textContent"),
    'Can of beans',
    'drawn-cursor pointerdown selects an item in a container',
  );
  await moveCursorTo(transfer.destination);
  await dispatchPointerAt('pointermove', -1, 1, transfer.destination);
  await dispatchPointerAt('pointerup', -1, 0, transfer.destination);
  await delay(100);
  assert.match(
    await evaluate("document.querySelector('#inventory .inv-queue').textContent"),
    /Can of beans/,
    'drag queues a container-to-inventory move',
  );
  await press('Tab', 'Tab', 9);
  assert.equal(
    await evaluate("document.querySelector('#inventory').hidden"),
    true,
    'Tab closes inventory while the move runs',
  );
  await delay(8000);
  await press('Tab', 'Tab', 9);
  assert.equal(
    await evaluate("!document.querySelector('#inventory').hidden"),
    true,
    'Tab reopens inventory to verify the drop',
  );
  await delay(100);
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('#inventory .inv-item')].find((node) => node.querySelector('.inv-item-name')?.textContent === 'Can of beans')?.closest('.inv-grid')?.dataset.target",
    ),
    transfer.target,
    'dropped item lands in the target inventory pocket',
  );
  await press('Tab', 'Tab', 9);

  // With a menu open and pointer locked, move the drawn cursor, dispatch a click to its target,
  // and verify both a button handler and input focus receive the forwarded click.
  await press('KeyG', 'g', 71);
  await evaluate("document.querySelector('#spawn .spawn-list button').scrollIntoView({ block: 'center' })");
  await evaluate('window.__setPointerLocked(true)');
  await waitFor(() => evaluate("!document.querySelector('#game-cursor').hidden"), 'menu cursor visibility');
  cursor = await evaluate(`(() => {
    const node = document.querySelector('#game-cursor');
    const rect = node.getBoundingClientRect();
    return { x: rect.left + (node.classList.contains('hand') ? 4 : 0), y: rect.top };
  })()`);
  await clickAt('#spawn .spawn-list button');
  const hotspot = await evaluate(`(() => {
    const cursor = document.querySelector('#game-cursor').getBoundingClientRect();
    const button = document.querySelector('#spawn .spawn-list button');
    return {
      tipX: cursor.left + 4,
      tipY: cursor.top,
      hitTest: window.__lastHitTest,
      forwarded: window.__lastForwardedClick,
      hitButton: window.__lastHitTest.buttonText === button.textContent.trim(),
    };
  })()`);
  assert.ok(Math.abs(hotspot.tipX - cursor.x) < 0.1, 'pointing-hand fingertip sits at cursor x');
  assert.ok(Math.abs(hotspot.tipY - cursor.y) < 0.1, 'pointing-hand fingertip sits at cursor y');
  assert.ok(Math.abs(hotspot.hitTest.x - cursor.x) < 0.1, 'elementFromPoint receives cursor tip x');
  assert.ok(Math.abs(hotspot.hitTest.y - cursor.y) < 0.1, 'elementFromPoint receives cursor tip y');
  assert.equal(hotspot.hitButton, true, 'elementFromPoint at the tip targets the button');
  assert.ok(Math.abs(hotspot.forwarded.x - cursor.x) < 1, 'forwarded click x uses the cursor tip');
  assert.ok(Math.abs(hotspot.forwarded.y - cursor.y) < 1, 'forwarded click y uses the cursor tip');
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
  assert.equal(await evaluate("document.querySelector('#spawn').hidden"), true, 'unlock closes the spawn menu');
  assert.deepEqual(
    await evaluate('window.__pointerCalls'),
    { request: 0, exit: 0 },
    'unlock event does not call lock APIs',
  );

  await evaluate(
    `document.querySelector('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`,
  );
  await delay(100);
  if (!(await evaluate("document.querySelector('#overlay').hidden"))) {
    await clickAt('#go');
  }
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'canvas or locked-card click resumes after pointer unlock',
  );

  await press('Tab', 'Tab', 9);
  await evaluate('window.__setPointerLocked(false)');
  await delay(100);
  assert.equal(await evaluate("document.querySelector('#inventory').hidden"), true, 'unlock closes an open inventory');
  await evaluate(
    `document.querySelector('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`,
  );
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'canvas click resumes after inventory unlock',
  );

  await press('Backquote', '`', 192);
  await evaluate('window.__setPointerLocked(false)');
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('.debug-panel').hidden"),
    true,
    'unlock closes an open debug panel',
  );
  await evaluate(
    `document.querySelector('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`,
  );
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'canvas click resumes after debug-panel unlock',
  );

  await pressBinding(keyBindings.mainMenu);
  await clickAt('#go');
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'locked cursor click on continue resumes play',
  );

  await evaluate('window.__setPointerLocked(false)');
  await delay(100);
  await evaluate(`(() => {
    window.__rejectNextPointerLock = true;
    document.querySelector('#go').click();
  })()`);
  await delay(100);
  assert.equal(await evaluate("document.querySelector('#overlay').hidden"), false, 'refused lock leaves the menu open');
  await evaluate('window.__setPointerLocked(true)');
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    false,
    'a later unrelated lock does not consume the refused resume intent',
  );
  await evaluate("document.querySelector('#go').click()");
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'a fresh resume click closes the menu',
  );
  process.stdout.write(
    'UI browser contract passed: container drag/drop, pointer-locked menus, cursor clicks/focus, spawn count, V status, audio volume persistence, unlock, menu/browser keys, inventory stats.\n',
  );
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
  vite.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(5000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
