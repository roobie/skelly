// biome-ignore-all lint/correctness/noNodejsModules: opt-in end-to-end test launches local Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: readiness polling is deliberate
// biome-ignore-all lint/style/noProcessEnv: local test-runner configuration is env-driven
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative CDP contract assertions

import assert from 'node:assert/strict';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from 'node:util';
import { createServer } from 'vite';
import { launchChromium } from '../test/browser/chromium.mjs';
import { cdpKey, pressCdpAction } from '../test/browser/input-actions.mjs';
import {
  dispatchMenuPointerClickExpression,
  dispatchMenuPointerMoveExpression,
} from '../test/browser/menu-pointer.mjs';
import { browserStageArgs, browserStageMode, browserStageUrl } from '../test/browser/stage-mode.mjs';

const graphicsArgument = /^--(?:disable-gpu|use-gl|use-angle|enable-unsafe-swiftshader)(?:=|$)/;
const cwd = process.cwd();
const renderMode = browserStageMode('ui-browser-contract');
const launchExtraArgs = ['--disable-extensions', '--password-store=basic', '--window-size=1280,900'];
const launchArgs = browserStageArgs('ui-browser-contract', launchExtraArgs);
const graphicsArgs = launchArgs.filter((arg) => graphicsArgument.test(arg));
const discovery = { phase: 'Vite server', lastHttpStatus: undefined, lastError: undefined };
const viteDiagnostics = { state: 'not-started', port: undefined, error: undefined };
const pageErrors = [];
let vite;
let browser;
let browserCdp;
let page;
let stageUrl;
let graphics;
const cleanup = async (name, action) => {
  try {
    await action?.();
  } catch (error) {
    process.stderr.write(`UI_CLEANUP_WARNING ${name}: ${String(error)}\n`);
  }
};
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
  vite = await createServer({
    root: cwd,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string', 'Vite listens on a TCP port');
  const { port } = address;
  viteDiagnostics.state = 'listening';
  viteDiagnostics.port = port;
  stageUrl = browserStageUrl(
    'ui-browser-contract',
    `http://127.0.0.1:${port}/?debug=1&post=0&sunshadow=0&torchshadow=0`,
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
  page = await context.newPage();
  await page.addInitScript(() => {
    globalThis.__webglContextRequests = [];
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) {
        globalThis.__webglContextRequests.push(type);
        return null;
      }
      return nativeGetContext.call(this, type, ...args);
    };
  });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      pageErrors.push(message.text());
    }
  });
  browserCdp = await context.newCDPSession(page);
  discovery.phase = 'Page navigation';
  await page.goto(stageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  discovery.phase = 'Page ready';
  const send = (method, params = {}) => browserCdp.send(method, params);
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
    () => evaluate("document.querySelector('#go')?.getAttribute('aria-disabled') === 'false'"),
    'accepted-launch readiness',
  );
  discovery.phase = 'UI assertions';
  const keyBindings = await evaluate(`import('/src/game/inputBindings.ts').then(({ inputBindings, NATIVE_INPUTS }) => ({
    mainMenu: { code: inputBindings.chords('ui.main-menu-toggle')[0].code, label: inputBindings.label('ui.main-menu-toggle') },
    browserMenuBar: NATIVE_INPUTS.find((native) => native.code === 'F10'),
  }))`);
  const pressBinding = async (binding) => {
    const key = cdpKey(binding.code);
    await press(key.code, key.key, key.windowsVirtualKeyCode);
  };
  const action = async (actionId) => {
    await pressCdpAction(evaluate, send, actionId);
    await delay(80);
  };

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
    await evaluate(`(async () => {
      const { controlsCardRows } = await import('/src/game/controls.ts');
      const controls = document.querySelector('#controls');
      const entries = [...controls.querySelectorAll('dt')];
      const rows = controlsCardRows();
      const columns = getComputedStyle(controls).gridTemplateColumns.trim().split(/\\s+/);
      const cardEl = document.querySelector('#overlay .card');
      const card = cardEl.getBoundingClientRect();
      const style = getComputedStyle(cardEl);
      const maxWidth = Number.parseFloat(style.maxWidth) +
        Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
      return rows.length > 0 && entries.length === rows.length &&
        entries.every((key, index) => key.nextElementSibling?.tagName === 'DD' &&
          key.textContent === rows[index].keys && key.nextElementSibling.textContent === rows[index].action) &&
        columns.length === 1 && Number.isFinite(maxWidth) && card.width <= maxWidth &&
        card.left >= 0 && card.right <= innerWidth;
    })()`),
    true,
    'binding-derived controls stack in one column within the card computed maximum width and viewport',
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
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob.type !== 'application/json') return createObjectURL(blob);
      window.__metricsBlob = blob;
      return 'blob:playtest-metrics';
    };
    URL.revokeObjectURL = (url) => { if (url !== 'blob:playtest-metrics') revokeObjectURL(url); };
    HTMLAnchorElement.prototype.click = function() { if (this.download) window.__metricsFilename = this.download; };
  })()`);
  await evaluate(`(() => {
    window.__f4Prevented = false;
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F4') setTimeout(() => { window.__f4Prevented = event.defaultPrevented; }, 0);
    });
  })()`);
  await evaluate(`(() => {
    // The render-free engine uses #view as its input target instead of creating a renderer canvas.
    const inputSurface = document.querySelector('canvas') ?? document.querySelector('#view');
    let locked = false;
    window.__inputSurface = inputSurface;
    window.__pointerCalls = { request: 0, exit: 0 };
    window.__rejectNextPointerLock = false;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => locked ? inputSurface : null,
    });
    inputSurface.requestPointerLock = () => {
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
      if (event.target !== inputSurface) {
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
  await waitFor(() => evaluate("Boolean(document.querySelector('#debug-ui-root'))"), 'post-acceptance debug UI mount');
  graphics = await evaluate(`({
    renderMode: ${JSON.stringify(renderMode)},
    webglContextRequests: window.__webglContextRequests.slice(),
  })`);
  process.stdout.write(
    `UI_BROWSER_GRAPHICS ${JSON.stringify({
      launcher: 'playwright-managed-cdp-pipe',
      browserVersion: browser.version(),
      graphicsArgs,
      graphics,
    })}\n`,
  );
  await pressBinding(keyBindings.mainMenu);
  await evaluate('document.exitPointerLock()');
  await press('F3', 'F3', 114);
  assert.equal(
    await evaluate("document.querySelector('#f3-debug-overlay').hidden"),
    true,
    'F3 no longer toggles the performance overlay',
  );
  await action('debug.performance-toggle');
  await waitFor(
    () => evaluate("!document.querySelector('#f3-debug-overlay').hidden"),
    'gated performance overlay opens',
  );
  assert.match(
    await evaluate("document.querySelector('#f3-debug-overlay').textContent"),
    /snapshot .*p95/i,
    'F4 readout includes snapshot statistics',
  );
  assert.equal(await evaluate('window.__f4Prevented'), true, 'F4 prevents the browser default');
  await action('debug.performance-toggle');
  await waitFor(
    () => evaluate("document.querySelector('#f3-debug-overlay').hidden"),
    'gated performance overlay closes',
  );
  await action('debug.panel-toggle');
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
  await action('debug.panel-toggle');
  await evaluate(`(() => {
    document.querySelector('#go').click();
    window.__pointerCalls.request = 0;
    window.__pointerCalls.exit = 0;
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
    evaluate(`window.__inputSurface.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, {
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
    await evaluate('document.querySelector(\'[data-input-action="ui.main-menu-toggle"]\')?.textContent'),
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
    "window.__inputSurface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 500 }))",
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
  assert.equal(arrowTip.rootBlend, 'difference', 'cursor root uses difference blending');
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
  await action('debug.spawn-menu-toggle');
  assert.equal(await evaluate("!document.querySelector('#spawn').hidden"), true, 'gated spawn action opens menu');
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
  await action('debug.panel-toggle');
  assert.equal(
    await evaluate("!document.querySelector('.debug-panel').hidden"),
    true,
    'gated panel action opens debug panel',
  );
  const debugScroll = await evaluate(`(() => {
    const panel = document.querySelector('.debug-panel');
    panel.scrollTop = 0;
    const rect = panel.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      height: panel.clientHeight, scroll: panel.scrollHeight };
  })()`);
  assert.ok(debugScroll.scroll > debugScroll.height, 'expanded authored debug panel actually overflows');
  await moveCursorTo(debugScroll);
  await evaluate(`window.__inputSurface.dispatchEvent(new WheelEvent('wheel', {
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
    new RegExp(
      `Spawn 1 shamblers \\(${(await evaluate("import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.label('debug.spawn-shamblers'))")).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
    ),
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
    new RegExp(
      `Spawn 2 shamblers \\(${(await evaluate("import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.label('debug.spawn-shamblers'))")).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
    ),
  );
  await action('debug.panel-toggle');
  assert.equal(
    await evaluate("document.querySelector('.debug-panel').hidden"),
    true,
    'gated panel action closes debug panel',
  );
  await action('debug.panel-toggle');
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
  await action('debug.spawn-shamblers');
  assert.match(
    await evaluate("document.querySelector('#shambler-spawn-status').textContent"),
    /^Placed \d+ of 2$/,
    'V reports the number placed out of the selected count',
  );
  await action('debug.freeze-shamblers');
  await action('debug.panel-toggle');
  assert.deepEqual(
    await evaluate('window.__pointerCalls'),
    { request: 0, exit: 0 },
    'menu keys leave pointer lock alone',
  );

  // Exercise keyboard input while pointer lock is held; the game's drawn-cursor menu route is active.
  await action('debug.spawn-menu-toggle');
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

  await action('debug.spawn-menu-toggle');
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
  await action('spawn.confirm');
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
    '[...document.querySelectorAll(\'#inventory [data-pane="around"] .inv-item-name\')].map((item) => item.textContent)',
  );
  assert.ok(nearbyAfterEnter.includes(selectedSpawnName), 'Enter spawned the selected item');
  await press('Tab', 'Tab', 9);

  await action('debug.spawn-menu-toggle');
  await typeText('crowbar');
  assert.equal(await evaluate("document.querySelectorAll('#spawn .spawn-list button').length"), 1);
  await press('Tab', 'Tab', 9);
  assert.equal(await evaluate("document.querySelector('#spawn').hidden"), true, 'Tab dismisses the filtered menu');
  await press('Tab', 'Tab', 9);
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll(\'#inventory [data-pane="around"] .inv-item-name\')].map((item) => item.textContent)',
    ),
    nearbyAfterEnter,
    'Tab dismissed without spawning',
  );
  await press('Tab', 'Tab', 9);

  await action('debug.spawn-menu-toggle');
  // Bags first: once the divider is dragged to narrow Around you (below), their pockets make the nearby
  // pane scroll; the pile at the feet would otherwise fill with whichever small items sort first.
  const spawnNames = await evaluate(`(() => {
    const entries = Array.from(document.querySelectorAll('#spawn .spawn-list button'))
      .map((button, index) => ({
        index,
        name: button.querySelector('span')?.textContent,
        bag: button.querySelector('span:last-child')?.textContent.split(',')[0] === 'bag',
      }))
      .filter(({ name }) => name && name !== 'Can of beans');
    return [...entries.filter(({ bag }) => bag), ...entries.filter(({ bag }) => !bag)].slice(0, 24);
  })()`);
  assert.ok(spawnNames.length >= 20, 'debug spawn menu has enough distinct items for a scroll regression');
  assert.ok(spawnNames[0].bag, 'debug spawn menu offers a bag');
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
    await evaluate("document.querySelector('#inventory .inv-needs') !== null"),
    true,
    'inventory always shows needs in its header',
  );
  assert.equal(
    await evaluate(
      "['health', 'food', 'water'].every((word) => document.querySelector('#inventory .inv-needs').textContent.includes(word))",
    ),
    true,
  );
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
    cursor = await evaluate(`(() => {
      const rect = document.querySelector('#game-cursor').getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
  };
  await dragInventoryDivider(1);
  const inventoryScroll = await evaluate(`(() => {
    const pane = document.querySelector('#inventory [data-pane="around"]');
    pane.scrollTop = Math.min(40, pane.scrollHeight - pane.clientHeight);
    const view = pane.getBoundingClientRect();
    const visible = [...pane.querySelectorAll('.inv-grid-packed .inv-item')].find((node) => {
      const item = node.getBoundingClientRect();
      if (item.bottom <= view.top || item.top >= view.bottom) return false;
      return document.elementFromPoint(item.left + item.width / 2, item.top + item.height / 2)?.closest('.inv-item') === node;
    });
    return {
      top: pane.scrollTop,
      overflow: pane.scrollHeight - pane.clientHeight,
      uid: visible?.dataset.uid,
      target: visible?.closest('.inv-grid')?.dataset.target,
      name: visible?.querySelector('.inv-item-name')?.textContent,
    };
  })()`);
  assert.ok(inventoryScroll.overflow > 1, 'nearby pane has enough items to scroll');
  assert.ok(inventoryScroll.uid, 'a nearby item is visible to select');
  assert.ok(inventoryScroll.target, 'the selected nearby item has a source inventory grid');
  await clickAt(`#inventory [data-uid="${inventoryScroll.uid}"]`);
  assert.equal(
    await evaluate("document.querySelector('#inventory .inv-details h3')?.textContent"),
    inventoryScroll.name,
  );
  let paneTop = await evaluate('document.querySelector(\'#inventory [data-pane="around"]\').scrollTop');
  assert.ok(
    Math.abs(paneTop - inventoryScroll.top) <= 1,
    `scroll survives selecting an item (${inventoryScroll.top} -> ${paneTop})`,
  );

  const moveQueued = () => evaluate("document.querySelector('#inventory .inv-job') !== null");
  assert.equal(await moveQueued(), false, 'inventory starts with no queued move');
  await pressCdpAction(evaluate, send, 'inventory.best-pocket');
  await waitFor(moveQueued, 'selected item queues a move', 1000);
  assert.equal(await moveQueued(), true, 'selected item queues a move');
  paneTop = await evaluate('document.querySelector(\'#inventory [data-pane="around"]\').scrollTop');
  assert.ok(Math.abs(paneTop - inventoryScroll.top) <= 1, 'scroll survives queueing a move');
  const selectedTarget = () =>
    evaluate(
      `document.querySelector('#inventory .inv-item[data-uid="${inventoryScroll.uid}"]')?.closest('.inv-grid')?.dataset.target`,
    );
  await waitFor(
    () => selectedTarget().then((target) => target !== undefined && target !== inventoryScroll.target),
    'selected item moves into inventory',
    15_000,
  );
  const completedTarget = await selectedTarget();
  assert.ok(completedTarget && completedTarget !== inventoryScroll.target, 'completed item leaves its source grid');
  paneTop = await evaluate('document.querySelector(\'#inventory [data-pane="around"]\').scrollTop');
  assert.ok(Math.abs(paneTop - inventoryScroll.top) <= 1, 'scroll survives handling completion');

  await dragInventoryDivider(0.5);
  const transfer = await evaluate(`(() => {
    const item = [...document.querySelectorAll('#inventory .inv-item')].find((node) => node.querySelector('.inv-item-name')?.textContent === 'Can of beans');
    const legs = [...document.querySelectorAll('#inventory .inv-worn')].find((node) => node.querySelector('.inv-slot-label')?.textContent === 'Legs');
    const grid = [...legs.querySelectorAll('.inv-grid')].find((node) => !node.querySelector('[data-uid]'));
    const around = document.querySelector('#inventory [data-pane="around"]');
    if (!(item && legs && grid && around)) throw new Error('container-to-inventory fixture is missing');
    item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const itemRect = item.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const source = { x: itemRect.left + itemRect.width / 2, y: itemRect.top + itemRect.height / 2 };
    const hit = document.elementFromPoint(source.x, source.y)?.closest('.inv-item');
    return {
      source,
      sourceTarget: item.closest('.inv-grid').dataset.target,
      sourceUid: item.dataset.uid,
      paneTop: around.scrollTop,
      hitUid: hit?.dataset.uid,
      hitName: hit?.querySelector('.inv-item-name')?.textContent,
      destination: { x: gridRect.left + 16, y: gridRect.top + 16 },
      target: grid.dataset.target,
    };
  })()`);
  assert.match(transfer.sourceTarget, /^pocket:/, 'source item is in a container pocket');
  assert.equal(transfer.hitUid, transfer.sourceUid, `container item is the topmost hit: ${JSON.stringify(transfer)}`);
  await moveCursorTo({ x: transfer.source.x + 16, y: transfer.source.y + 16 });
  await evaluate(dispatchMenuPointerClickExpression());
  await waitFor(
    async () =>
      (await evaluate("document.querySelector('#inventory .inv-details h3')?.textContent")) === 'Can of beans',
    `drawn-cursor click selects an item in a container: ${JSON.stringify(transfer)}`,
    2000,
  );
  paneTop = await evaluate('document.querySelector(\'#inventory [data-pane="around"]\').scrollTop');
  assert.ok(Math.abs(paneTop - transfer.paneTop) <= 1, 'scroll survives selecting a container item');
  const transferDestination = { x: transfer.destination.x + 16, y: transfer.destination.y + 16 };
  await moveCursorTo({ x: transfer.source.x + 16, y: transfer.source.y + 16 });
  await dispatchPointerAt('pointerdown', 0, 1, { x: transfer.source.x + 16, y: transfer.source.y + 16 });
  await moveCursorTo(transferDestination);
  await dispatchPointerAt('pointermove', -1, 1, transferDestination);
  await dispatchPointerAt('pointerup', -1, 0, transferDestination);
  await delay(100);
  assert.ok(await moveQueued(), 'container transfer remains in the handling queue');
  paneTop = await evaluate('document.querySelector(\'#inventory [data-pane="around"]\').scrollTop');
  assert.ok(Math.abs(paneTop - transfer.paneTop) <= 1, 'scroll survives queueing the container move');
  await press('Tab', 'Tab', 9);
  assert.equal(
    await evaluate("document.querySelector('#inventory').hidden"),
    true,
    'Tab closes inventory while the move runs',
  );
  await press('Tab', 'Tab', 9);
  assert.equal(
    await evaluate("!document.querySelector('#inventory').hidden"),
    true,
    'Tab reopens inventory to verify the drop',
  );
  const transferTarget = () =>
    evaluate(
      "[...document.querySelectorAll('#inventory .inv-item')].find((node) => node.querySelector('.inv-item-name')?.textContent === 'Can of beans')?.closest('.inv-grid')?.dataset.target",
    );
  await waitFor(
    () => transferTarget().then((target) => target === transfer.target),
    'container move completes',
    15_000,
  );
  assert.equal(await transferTarget(), transfer.target, 'dropped item lands in the target inventory pocket');
  paneTop = await evaluate('document.querySelector(\'#inventory [data-pane="around"]\').scrollTop');
  assert.ok(Math.abs(paneTop - transfer.paneTop) <= 1, 'scroll survives handling completion');
  await press('Tab', 'Tab', 9);

  // With a menu open and pointer locked, move the drawn cursor, dispatch a click to its target,
  // and verify both a button handler and input focus receive the forwarded click.
  await action('debug.spawn-menu-toggle');
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

  await evaluate(`window.__inputSurface.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`);
  await delay(100);
  if (!(await evaluate("document.querySelector('#overlay').hidden"))) {
    await clickAt('#go');
  }
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'input-surface or locked-card click resumes after pointer unlock',
  );

  await press('Tab', 'Tab', 9);
  await evaluate('window.__setPointerLocked(false)');
  await delay(100);
  assert.equal(await evaluate("document.querySelector('#inventory').hidden"), true, 'unlock closes an open inventory');
  await evaluate(`window.__inputSurface.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`);
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'input-surface click resumes after inventory unlock',
  );

  await action('debug.panel-toggle');
  await evaluate('window.__setPointerLocked(false)');
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('.debug-panel').hidden"),
    true,
    'unlock closes an open debug panel',
  );
  await evaluate(`window.__inputSurface.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`);
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('#overlay').hidden"),
    true,
    'input-surface click resumes after debug-panel unlock',
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
  assert.deepEqual(
    await evaluate('window.__webglContextRequests'),
    [],
    'UI contract remains independent of WebGL rendering',
  );
  process.stdout.write(
    'UI browser contract passed: container drag/drop, pointer-locked menus, cursor clicks/focus, spawn count, V status, audio volume persistence, unlock, menu/browser keys, inventory stats.\n',
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
      page: { url: page?.url(), errors: pageErrors },
    })}\n`,
  );
  throw error;
} finally {
  await cleanup('CDP session', () => browserCdp?.detach());
  await cleanup('Chromium', () => browser?.close());
  await cleanup('Vite', () => vite?.close());
}
