// biome-ignore-all lint/correctness/noNodejsModules: opt-in end-to-end test launches local Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: readiness polling is deliberate
// biome-ignore-all lint/style/noProcessEnv: local test-runner configuration is env-driven
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative CDP contract assertions

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from 'node:util';
import {
  dispatchMenuPointerClickExpression,
  dispatchMenuPointerMoveExpression,
} from '../test/browser/menu-pointer.mjs';
import { browserStageLaunchArgs, browserStageUrl } from '../test/browser/stage-mode.mjs';
import { createBrowserProfile } from './browser-profile.mjs';

const cwd = process.cwd();
const profile = createBrowserProfile();
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
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const stageUrl = browserStageUrl(
  'ui-browser-contract',
  `http://127.0.0.1:${port}/?debug=1&post=0&sunshadow=0&torchshadow=0`,
);
const chrome = spawn(
  process.env.CHROME_BIN ?? 'google-chrome',
  browserStageLaunchArgs('ui-browser-contract', [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    stageUrl,
  ]),
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
const startupAbort = new AbortController();
const children = [
  ['Vite', vite],
  ['Chrome', chrome],
].map(([name, child]) => {
  const state = { name, child, stdout: '', stderr: '', spawnError: undefined };
  for (const stream of ['stdout', 'stderr']) {
    child[stream].on('data', (chunk) => {
      state[stream] = (state[stream] + chunk.toString()).slice(-16_384);
    });
  }
  child.on('error', (error) => {
    state.spawnError = error.message;
    startupAbort.abort(new Error(`${name} failed to start: ${error.message}`));
  });
  child.on('exit', (code, signal) => startupAbort.abort(new Error(`${name} failed to start: ${signal ?? code}`)));
  return state;
});
const checkChildren = () => {
  for (const { name, child, spawnError } of children) {
    if (spawnError || child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${name} failed to start: ${spawnError ?? child.signalCode ?? child.exitCode}`);
    }
  }
};
const discovery = { phase: 'Vite server', lastHttpStatus: undefined, lastError: undefined, targets: [] };
const waitFor = async (test, message, timeout = 30_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await test(until)) {
      return;
    }
    await delay(Math.min(100, Math.max(0, until - Date.now())));
  }
  throw new Error(`Timed out: ${message}; last discovery error: ${discovery.lastError ?? 'none'}`);
};
const fetchBeforeDeadline = async (url, until, json = false) => {
  const remaining = until - Date.now();
  if (remaining <= 0) {
    throw new Error(`Startup deadline expired fetching ${url}`);
  }
  const response = await fetch(url, {
    signal: AbortSignal.any([startupAbort.signal, AbortSignal.timeout(remaining)]),
  });
  discovery.lastHttpStatus = { url, status: response.status };
  if (!response.ok) {
    throw new Error(`Discovery HTTP ${response.status}: ${url}`);
  }
  // The fetch signal also bounds a JSON body that never completes.
  return json ? response.json() : response;
};
const getPage = async (until) => {
  const pages = await fetchBeforeDeadline(`http://127.0.0.1:${cdpPort}/json`, until, true);
  discovery.targets = pages.map(({ id, type, url }) => ({ id, type, url }));
  return pages.find((page) => page.type === 'page' && page.url.includes(`127.0.0.1:${port}`));
};

let ws;
try {
  await waitFor(async (until) => {
    checkChildren();
    try {
      return Boolean(await fetchBeforeDeadline(`http://127.0.0.1:${port}/`, until));
    } catch (error) {
      discovery.lastError = inspect(error, { depth: 3 }).slice(-4096);
      checkChildren();
      return false;
    }
  }, 'Vite server');
  discovery.phase = 'Chrome page';
  let discoveryDeadline;
  await waitFor(async (until) => {
    discoveryDeadline = until;
    checkChildren();
    try {
      return Boolean(await getPage(until));
    } catch (error) {
      discovery.lastError = inspect(error, { depth: 3 }).slice(-4096);
      checkChildren();
      return false;
    }
  }, 'Chrome page');
  const page = await getPage(discoveryDeadline);
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
    let result;
    try {
      result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    } catch (error) {
      throw new Error(`CDP evaluate failed: ${String(error)}; expression=${expression.slice(0, 180)}`, {
        cause: error,
      });
    }
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
  const typeText = async (text) => send('Input.insertText', { text });
  const lastKeyEvent = async (code) =>
    evaluate(`window.__keyEvents.filter((event) => event.code === ${JSON.stringify(code)}).at(-1)`);

  await send('Runtime.enable');
  await waitFor(
    () => evaluate("Boolean(document.querySelector('#debug-ui-root') && document.querySelector('canvas'))"),
    'debug UI mount',
  );
  const keyBindings = await evaluate("import('/src/game/input.ts').then(({ KEY_BINDINGS }) => KEY_BINDINGS)");
  const pressBinding = async (binding) => press(binding.code, binding.label, binding.virtualKeyCode);
  const saveNote = 'Saves are kept in this browser. When two tabs play the same world, the last one to save wins.';
  const assertSaveNote = async (screen) =>
    assert.equal(
      await evaluate(`(() => {
        const note = document.querySelector('#save-note');
        return Boolean(note && !document.querySelector('#overlay').hidden && note.getClientRects().length &&
          note.classList.contains('scale') && note.textContent.trim() === ${JSON.stringify(saveNote)});
      })()`),
      true,
      `${screen} shows the browser-local, last-writer-wins note as visible secondary text`,
    );
  await assertSaveNote('title');
  assert.equal(
    await evaluate(`(() => {
      const controls = document.querySelector('#controls');
      const entries = [...controls.querySelectorAll('dt')];
      const columns = getComputedStyle(controls).gridTemplateColumns.trim().split(/\\s+/);
      return entries.length >= 13 && controls.textContent.includes('F9') &&
        entries.every((key) => key.nextElementSibling?.tagName === 'DD') &&
        columns.length === 1 && document.querySelector('#overlay .card').getBoundingClientRect().width <= 362;
    })()`),
    true,
    'binding-derived controls stack in one column inside the narrower pause card',
  );
  assert.equal(
    await evaluate(
      `document.querySelector('#about a[href*=${JSON.stringify('template=playtest-feedback.md')}]')?.href`,
    ),
    'https://github.com/roobie/skelly/issues/new?template=playtest-feedback.md',
    'feedback link opens the playtest issue template',
  );
  await evaluate(`(() => {
    window.__metricsBlob = undefined;
    URL.createObjectURL = (blob) => { window.__metricsBlob = blob; return 'blob:playtest-metrics'; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function() { if (this.download) window.__metricsFilename = this.download; };
  })()`);
  await evaluate(`(() => {
    window.__f4Prevented = false;
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F4') window.__f4Prevented = event.defaultPrevented;
    });
  })()`);
  await press('F3', 'F3', 114);
  assert.equal(
    await evaluate("document.querySelector('#f3-debug-overlay').hidden"),
    true,
    'F3 no longer toggles the performance overlay',
  );
  await press('F4', 'F4', 115);
  await waitFor(() => evaluate("!document.querySelector('#f3-debug-overlay').hidden"), 'F4 overlay opens');
  assert.match(
    await evaluate("document.querySelector('#f3-debug-overlay').textContent"),
    /snapshot .*p95/i,
    'F4 readout includes snapshot statistics',
  );
  assert.equal(await evaluate('window.__f4Prevented'), true, 'F4 prevents the browser default');
  await press('F4', 'F4', 115);
  await waitFor(() => evaluate("document.querySelector('#f3-debug-overlay').hidden"), 'F4 overlay closes');
  await press('Backquote', '`', 192);
  await evaluate(`(() => {
    document.querySelector('#debug-time').value = '08:00';
    document.querySelector('#set-debug-time')?.click();
    Array.from(document.querySelectorAll('.debug-actions button')).find((button) => button.textContent.includes('Reveal zombies'))?.click();
  })()`);
  await waitFor(
    () => evaluate("document.querySelector('#debug-readout').textContent.includes('Day 2, 08:00')"),
    'backward debug-time request advances to the next day',
  );
  assert.match(
    await evaluate(
      "Array.from(document.querySelectorAll('.debug-actions button')).find((button) => button.textContent.includes('Reveal zombies')).textContent",
    ),
    /ON/,
    'debug panel reveals zombie positions',
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.debug-actions button')).find((button) => button.textContent.includes('Measure snapshot'))?.click()`,
  );
  await waitFor(
    () =>
      evaluate("document.querySelector('#snapshot-measurement-result').textContent.includes('Snapshot: 50 batches ×')"),
    'on-demand batched snapshot measurement',
  );
  const snapshotResult = await evaluate("document.querySelector('#snapshot-measurement-result').textContent");
  assert.match(
    snapshotResult,
    /batch-mean throughput p50 .* ms\/capture, p95 .* ms\/capture; individual tail n=\d+: observed p95 .* ms, max .* ms; known Chromium browser-profile quantum r=.* ms \(observed minimum tick .* ms; duration error <2r\): true p95 </,
  );
  assert.match(snapshotResult, /net state unchanged across measurement/);
  assert.equal(await evaluate("document.querySelector('#copy-snapshot-result').textContent.trim()"), 'Copy');
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('#snapshot-measurement-result')).userSelect"),
    'text',
    'snapshot result line is selectable',
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.debug-actions button')).find((button) => button.textContent.includes('Export metrics'))?.click()`,
  );
  const exportedMetrics = await evaluate('window.__metricsBlob?.text().then((text) => JSON.parse(text))');
  assert.equal(exportedMetrics.schemaVersion, 1, 'metrics download is valid versioned JSON');
  assert.match(
    await evaluate('window.__metricsFilename'),
    /^deadvox-metrics-seed-\d+\.json$/,
    'metrics download has a useful filename',
  );
  await press('Backquote', '`', 192);
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
  const emptyQuickbarReady = () =>
    evaluate(`(() => {
      const slots = [...document.querySelectorAll('#quickbar .qb-empty')];
      return slots.length === 5 && slots.every((slot) => {
        const text = slot.textContent.toLowerCase();
        return text.includes('empty') && !text.includes('inventory');
      });
    })()`);
  await waitFor(emptyQuickbarReady, 'rendered empty quickbar slots');
  assert.equal(await emptyQuickbarReady(), true, 'rendered empty quickbar slots contain no inventory help text');
  let cursor = await evaluate('({ x: innerWidth / 2, y: innerHeight / 2 })');
  const moveCursorTo = async (position) => {
    await evaluate(
      dispatchMenuPointerMoveExpression({
        movementX: position.x - cursor.x,
        movementY: position.y - cursor.y,
      }),
    );
    cursor = position;
    await delay(120);
  };
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
    })(); undefined`);
    await evaluate(dispatchMenuPointerClickExpression());
    await delay(120);
  };

  // Each menu route is exercised with real browser key events; none may recapture/release pointer lock.
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("!document.querySelector('#inventory').hidden"), true, 'Tab opens inventory');
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("document.querySelector('#inventory').hidden"), true, 'Tab closes inventory');
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('#controls dt')].find((node) => node.textContent === 'F9')?.textContent",
    ),
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
  await evaluate("document.querySelector('#audio-volume-world').scrollIntoView({ block: 'center' })");
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
  await assertSaveNote('pause card');
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
  assert.equal(
    await evaluate("!document.querySelector('#spawn').hidden"),
    true,
    'G does not close the menu while the search field is focused',
  );
  await typeText('g');
  assert.equal(await evaluate("document.querySelector('#spawn input').value"), 'g', 'focused search accepts text');
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("document.querySelector('#spawn').hidden"), true, 'Tab closes spawn menu');
  await press('Backquote', '`', 192);
  assert.equal(await evaluate("!document.querySelector('.debug-panel').hidden"), true, 'Backquote opens debug panel');
  const debugScroll = await evaluate(`(() => {
    const panel = document.querySelector('.debug-panel');
    panel.scrollTop = 0;
    const rect = panel.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      height: panel.clientHeight, scroll: panel.scrollHeight };
  })()`);
  assert.ok(debugScroll.scroll > debugScroll.height, 'expanded authored debug panel actually overflows');
  await moveCursorTo(debugScroll);
  await evaluate(`document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', {
    bubbles: true, cancelable: true, deltaY: 3, deltaMode: 1,
  }))`);
  assert.equal(
    await evaluate("document.querySelector('.debug-panel').scrollTop"),
    48,
    'shared cursor route scrolls the debug panel once, normalizing line units',
  );
  assert.equal(await evaluate('window.scrollY'), 0, 'debug wheel does not scroll the page');
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
  await evaluate(
    `document.querySelector('[aria-label="Increase shambler count"]').scrollIntoView({ block: 'center' })`,
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
  await evaluate(
    `document.querySelector('[aria-label="Decrease shambler count"]').scrollIntoView({ block: 'center' })`,
  );
  await clickAt('[aria-label="Decrease shambler count"]');
  assert.equal(await evaluate("document.querySelector('.debug-shambler-count output').textContent"), '1');
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Decrease shambler count"]\').disabled'), true);
  await evaluate(
    `document.querySelector('[aria-label="Increase shambler count"]').scrollIntoView({ block: 'center' })`,
  );
  await clickAt('[aria-label="Increase shambler count"]');
  assert.equal(await evaluate("document.querySelector('.debug-shambler-count output').textContent"), '2');
  await press('KeyV', 'v', 86);
  assert.match(
    await evaluate("document.querySelector('#shambler-spawn-status').textContent"),
    /^Placed \d+ of 2$/,
    'V reports the number placed out of the selected count',
  );
  await press('KeyO', 'o', 79);
  await press('Backquote', '`', 192);
  assert.deepEqual(
    await evaluate('window.__pointerCalls'),
    { request: 0, exit: 0 },
    'menu keys leave pointer lock alone',
  );

  // Exercise keyboard input while pointer lock is held; the game's drawn-cursor menu route is active.
  await press('KeyG', 'g', 71);
  assert.equal(
    await evaluate("document.activeElement === document.querySelector('#spawn input')"),
    true,
    'G focuses search',
  );
  const positionBeforeSearchKey = await evaluate(
    "document.querySelector('#debug-readout').textContent.match(/position ([0-9.-]+, [0-9.-]+, [0-9.-]+)/)?.[1]",
  );
  await press('KeyW', 'w', 87);
  await delay(150);
  assert.equal(
    await evaluate(
      "document.querySelector('#debug-readout').textContent.match(/position ([0-9.-]+, [0-9.-]+, [0-9.-]+)/)?.[1]",
    ),
    positionBeforeSearchKey,
    'typing W in search does not move the player',
  );
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("document.querySelector('#spawn').hidden"), true, 'Tab closes without spawning');

  await press('KeyG', 'g', 71);
  await typeText('a');
  assert.ok(
    (await evaluate("document.querySelectorAll('#spawn .spawn-list button').length")) > 1,
    'typed filter narrows results',
  );
  const firstSpawnName = await evaluate(
    "document.querySelector('#spawn .spawn-list button[aria-current=true] span').textContent",
  );
  await press('ArrowDown', 'ArrowDown', 40);
  const selectedSpawnName = await evaluate(
    "document.querySelector('#spawn .spawn-list button[aria-current=true] span').textContent",
  );
  assert.notEqual(selectedSpawnName, firstSpawnName, 'ArrowDown visibly changes the selected item');
  await press('Enter', 'Enter', 13);
  assert.equal(
    await evaluate("document.querySelector('#spawn').hidden"),
    true,
    'Enter spawns selection and closes menu',
  );
  assert.deepEqual(
    await evaluate('window.__pointerCalls'),
    { request: 0, exit: 0 },
    'keyboard flow leaves pointer lock alone',
  );
  await press('Tab', 'Tab', 9);
  const nearbyAfterEnter = await evaluate(
    "[...document.querySelectorAll('#inventory .inv-pane:nth-child(2) .inv-item-name')].map((item) => item.textContent)",
  );
  assert.ok(nearbyAfterEnter.includes(selectedSpawnName), 'Enter spawned the selected item');
  await press('Tab', 'Tab', 9);

  await press('KeyG', 'g', 71);
  await typeText('crowbar');
  assert.equal(await evaluate("document.querySelectorAll('#spawn .spawn-list button').length"), 1);
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("document.querySelector('#spawn').hidden"), true, 'Tab dismisses the filtered menu');
  await press('Tab', 'Tab', 9);
  assert.deepEqual(
    await evaluate(
      "[...document.querySelectorAll('#inventory .inv-pane:nth-child(2) .inv-item-name')].map((item) => item.textContent)",
    ),
    nearbyAfterEnter,
    'Tab dismissed without spawning',
  );
  await press('Tab', 'Tab', 9);

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
  await press('Tab', 'Tab', 9);
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
} catch (error) {
  process.stderr.write(
    `UI_LAUNCH_FAILURE ${JSON.stringify({
      error: String(error),
      ports: { vite: port, cdp: cdpPort },
      discovery,
      children: children.map(({ name, child, stdout, stderr, spawnError }) => ({
        name,
        executable: child.spawnfile,
        args: child.spawnargs,
        pid: child.pid,
        exitCode: child.exitCode,
        signalCode: child.signalCode,
        spawnError,
        stdout,
        stderr,
      })),
    })}\n`,
  );
  throw error;
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
  vite.kill('SIGTERM');
  if (chrome.exitCode === null && chrome.signalCode === null) {
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(5000)]);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
