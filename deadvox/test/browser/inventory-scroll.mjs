// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
// biome-ignore-all lint/performance/noAwaitInLoops: one page and cursor; declared wheel trials cannot overlap
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { dispatchMenuPointerMove } from './menu-pointer.mjs';
import { browserStageArgs } from './stage-mode.mjs';

const { chromium, firefox } = await import('playwright');
// biome-ignore lint/style/noProcessEnv: the launcher accepts the installed Chromium path
const chromeBin = process.env.CHROME_BIN;

const root = fileURLToPath(new URL('../..', import.meta.url));
const engine = process.argv[2] ?? 'chromium';
assert.ok(['chromium', 'firefox'].includes(engine));
// Owned overflowing containers/items: changing shipped clothes or loadouts cannot turn this into a no-op.
const content = [
  {
    source: 'inventory-scroll-fixture',
    data: {
      items: [
        ...['legs', 'torso', 'back'].map((slot) => ({
          id: `scroll_${slot}`,
          name: `Scroll ${slot}`,
          category: 'clothing',
          weight: 100,
          size: [1, 1],
          wearable: { slot, encumbrance: 0, warmth: 0 },
          container: { pockets: [{ grid: [1, 12], handlingSimSeconds: 0.1 }] },
        })),
        { id: 'scroll_token', name: 'Scroll token', category: 'tool', weight: 1, size: [1, 1] },
        { id: 'rag', name: 'Rag', category: 'material', weight: 1, size: [1, 1] },
      ],
    },
  },
];
const fixture = `
import '/src/ui/style.css';
import { buildRegistry } from '/src/core/content.ts';
import { Inventory } from '/src/core/inventory.ts';
import { BODY_REGIONS, Body } from '/src/core/body.ts';
import { HandlingQueue } from '/src/core/handling.ts';
import { bindReach } from '/src/core/reach.ts';
import { InventoryScreen } from '/src/ui/inventoryScreen.ts';
import { mountMenuPointer } from '/src/ui/menuPointer.ts';
const { registry, issues } = buildRegistry(${JSON.stringify(content)});
if (issues.length) throw Error('Invalid scroll fixture: ' + JSON.stringify(issues));
const inventory = new Inventory(registry);
const body = new Body({
  id: 'scroll-fixture',
  infectionOnsetGameHours: 1,
  antisepticWindowGameHours: 1,
  infectionChance: 0.5,
  knockoutSimSeconds: 1,
  staminaRegenDelaySimSeconds: 5,
  proneEyeHeightMetres: 0.2,
  bluntShockPerDamage: 2,
  treatmentSimSeconds: 1,
  wakeShock: 5,
  bloodLossPerSimSecond: 0.004,
  bloodRecoveryPerSimSecond: 0.002,
  shockRecoveryPerSimSecond: 0.1,
  advancedInfectionHealthLossPerSimSecond: 0.0005,
  aimSwayPerDamage: 0.01,
  swingSlowdownPerDamage: 0.01,
  movementSlowdownPerDamage: 0.005,
  minimumMovementSpeed: 0.5,
});
body.impact(1, 'leftArm', { bleeding: true });
for (const slot of ['legs', 'torso', 'back']) {
  if (!inventory.add(inventory.create('scroll_' + slot), { kind: 'worn' })) throw Error('worn fixture failed');
}
for (let i = 0; i < 12; i++) {
  if (!inventory.add(inventory.create('scroll_token'), { kind: 'pile', pos: [i % 3, 0, Math.floor(i / 3)] })) throw Error('pile fixture failed');
}
const screen = new InventoryScreen(document.querySelector('#inventory'), inventory, new HandlingQueue(inventory), {
  reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 }),
  feet: () => [0, 0, 0], nearby: () => [...inventory.piles.values()], distance: () => 0,
  containers: () => [], entityDistance: () => 0, search: () => undefined, searching: () => false,
  notice: () => {}, describe: () => Array.from({ length: 40 }, (_, i) => 'Detail line ' + i), assign: () => {}, workOptions: () => [], work: () => undefined,
  body: () => body.snapshotState(),
});
const rag = inventory.create('rag');
if (!inventory.add(rag, { kind: 'hand', side: 'right' })) throw Error('treatment item fixture failed');
screen.selected = rag;
screen.open();
screen.onAction('inventory.next');
screen.selected = rag;
screen.update();
const inputState = { locked: false, menuPointer: false };
const input = {
  get locked() { return inputState.locked; },
  get menuPointer() { return inputState.menuPointer; },
  setPointerModeForTest(locked) {
    inputState.locked = locked;
    inputState.menuPointer = locked;
  },
  cursorX: 0,
  cursorY: 0,
  moveMenuCursor(x, y) { this.cursorX += x; this.cursorY += y; },
};
const target = document.querySelector('#view');
const menu = mountMenuPointer({ input, canvas: target, cursor: document.querySelector('#game-cursor') });
let gameplayWheels = 0;
target.addEventListener('wheel', () => gameplayWheels++);
globalThis.scrollFixture = { input, screen, inventory, target, menu, bodyRegions: BODY_REGIONS,
  get gameplayWheels() { return gameplayWheels; },
  resetWheels() { gameplayWheels = 0; },
  redraw() {
    if (!inventory.add(inventory.create('scroll_token'), { kind: 'pile', pos: [0, 0, 0] })) throw Error('redraw fixture failed');
    screen.update();
  },
};
`;
const vite = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'inventory-scroll-fixture',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === '/__scroll.html') {
            response.setHeader('Content-Type', 'text/html');
            response.end(
              '<html><body><div id="view"></div><div id="overlay" hidden></div><div id="inventory" hidden></div><div id="inventory-drag-root"></div><div id="game-cursor-root"><div id="game-cursor"></div></div><script type="module" src="/__scroll.js"></script></body></html>',
            );
          } else {
            next();
          }
        });
      },
      resolveId(id) {
        if (id === '/__scroll.js') {
          return '\0scroll-fixture';
        }
      },
      load(id) {
        if (id === '\0scroll-fixture') {
          return fixture;
        }
      },
    },
  ],
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  browser =
    engine === 'firefox'
      ? await firefox.launch({ headless: false })
      : await chromium.launch({
          executablePath: chromeBin,
          headless: true,
          args: browserStageArgs('inventory-scroll'),
        });
  const page = await browser.newPage({ viewport: { width: 1280, height: 480 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/__scroll.html`);
  await page.waitForFunction(() => Boolean(globalThis.scrollFixture));
  assert.equal(
    await page.locator('[data-body-region]').count(),
    await page.evaluate(() => globalThis.scrollFixture.bodyRegions.length),
  );
  assert.equal(await page.locator('[data-body-region="leftArm"] button').count(), 0);
  const failures = [];
  for (const selector of [
    '#inventory [data-pane="body"]',
    '#inventory [data-pane="you"]',
    '#inventory [data-pane="around"]',
    '#inventory .inv-details',
  ]) {
    const size = await page
      .locator(selector)
      .evaluate((pane) => ({ height: pane.clientHeight, scroll: pane.scrollHeight }));
    assert.ok(size.height > 0 && size.scroll > size.height, `${selector} actually overflows: ${JSON.stringify(size)}`);
    // Unlocked native wheel is the pristine positive control; locked dispatch reproduces the gap.
    for (const locked of [false, true]) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.evaluate(
        (trial) => {
          const { input } = globalThis.scrollFixture;
          globalThis.scrollFixture.resetWheels();
          input.setPointerModeForTest(trial.locked);
          document.querySelector(trial.selector).scrollTop = 0;
          globalThis.scrollFixture.menu.update();
        },
        { selector, locked },
      );
      if (locked) {
        const cursor = await page.evaluate(() => {
          const { input } = globalThis.scrollFixture;
          return { x: input.cursorX, y: input.cursorY };
        });
        await page.evaluate(dispatchMenuPointerMove, {
          canvasSelector: '#view',
          movementX: x - cursor.x,
          movementY: y - cursor.y,
        });
        await page.evaluate(() => globalThis.scrollFixture.menu.update());
        await page.evaluate(() =>
          globalThis.scrollFixture.target.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: 3,
              deltaMode: 1,
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
      } else {
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, 48);
        // Observe two frames, not an arbitrary delay, so native scrolling has been submitted.
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      }
      const observed = await page.locator(selector).evaluate((pane) => ({
        top: pane.scrollTop,
        pageY: window.scrollY,
        gameplayWheels: globalThis.scrollFixture.gameplayWheels,
      }));
      await page.evaluate(() => globalThis.scrollFixture.redraw());
      const afterRedraw = await page.locator(selector).evaluate((pane) => pane.scrollTop);
      const result = { engine, selector, locked, ...size, ...observed, afterRedraw };
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (
        !(observed.top > 0 && observed.pageY === 0 && observed.gameplayWheels === 0 && afterRedraw === observed.top)
      ) {
        failures.push(result);
      }
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, [], 'each pane scrolls without page/input-surface wheel leakage and survives #67 redraw');
  process.stdout.write(
    `${engine}: inventory/vicinity/details wheel and redraw contract passed (free pointer + synthetic locked cursor)\n`,
  );
} finally {
  await browser?.close();
  await vite.close();
}
