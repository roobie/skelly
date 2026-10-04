// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
// biome-ignore-all lint/performance/noAwaitInLoops: one page and cursor; declared wheel trials cannot overlap
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium, firefox } = await import('playwright');
// biome-ignore lint/style/noProcessEnv: the launcher accepts the installed Chromium path
const chromeBin = process.env.CHROME_BIN;

const root = fileURLToPath(new URL('../..', import.meta.url));
const engine = process.argv[2] ?? 'chromium';
assert.ok(['chromium', 'firefox'].includes(engine));
const content = readdirSync(resolve(root, 'src/content/base'))
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((source) => ({
    source,
    data: JSON.parse(readFileSync(resolve(root, 'src/content/base', source), 'utf8')),
  }));
const fixture = `
import '/src/ui/style.css';
import { buildRegistry } from '/src/core/content.ts';
import { Inventory } from '/src/core/inventory.ts';
import { HandlingQueue } from '/src/core/handling.ts';
import { bindReach } from '/src/core/reach.ts';
import { startingLoadout } from '/src/game/loadout.ts';
import { InventoryScreen } from '/src/ui/inventoryScreen.ts';
import { mountMenuPointer } from '/src/ui/menuPointer.ts';
const { registry } = buildRegistry(${JSON.stringify(content)});
const inventory = new Inventory(registry);
startingLoadout(inventory);
const bag = inventory.create('hiking_backpack');
if (!inventory.add(bag, { kind: 'worn' })) throw Error('backpack fixture failed');
for (let i = 0; i < 12; i++) {
  inventory.add(inventory.create('canned_beans'), { kind: 'pile', pos: [i % 3, 0, Math.floor(i / 3)] });
}
const screen = new InventoryScreen(document.querySelector('#inventory'), inventory, new HandlingQueue(inventory), {
  reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 }),
  feet: () => [0, 0, 0], nearby: () => [...inventory.piles.values()], distance: () => 0,
  containers: () => [], entityDistance: () => 0, search: () => undefined, searching: () => false,
  notice: () => {}, use: () => undefined, describe: () => Array.from({ length: 40 }, (_, i) => 'Detail line ' + i), assign: () => {}, workOptions: () => [], work: () => undefined,
});
screen.open();
screen.onKey(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
screen.update();
const input = { locked: false, menuPointer: false, cursorX: 0, cursorY: 0,
  moveMenuCursor(x, y) { this.cursorX += x; this.cursorY += y; } };
const canvas = document.querySelector('canvas');
const menu = mountMenuPointer({ input, canvas, cursor: document.querySelector('#game-cursor') });
let gameplayWheels = 0;
canvas.addEventListener('wheel', () => gameplayWheels++);
globalThis.scrollFixture = { input, screen, inventory, canvas, menu,
  get gameplayWheels() { return gameplayWheels; },
  resetWheels() { gameplayWheels = 0; },
  redraw() { inventory.version++; screen.update(); },
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
              '<html><body><canvas></canvas><div id="overlay" hidden></div><div id="inventory" hidden></div><div id="inventory-drag-root"></div><div id="game-cursor"></div><script type="module" src="/__scroll.js"></script></body></html>',
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
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
  const page = await browser.newPage({ viewport: { width: 1280, height: 480 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/__scroll.html`);
  await page.waitForFunction(() => Boolean(globalThis.scrollFixture));
  const failures = [];
  for (const selector of [
    '#inventory .inv-pane:nth-child(1)',
    '#inventory .inv-pane:nth-child(2)',
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
          const { input, menu } = globalThis.scrollFixture;
          globalThis.scrollFixture.resetWheels();
          input.locked = trial.locked;
          input.menuPointer = trial.locked;
          input.cursorX = trial.x;
          input.cursorY = trial.y;
          document.querySelector(trial.selector).scrollTop = 0;
          menu.update();
        },
        { selector, x, y, locked },
      );
      if (locked) {
        await page.evaluate(() =>
          globalThis.scrollFixture.canvas.dispatchEvent(
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
  assert.deepEqual(failures, [], 'each pane scrolls without page/canvas wheel leakage and survives #67 redraw');
  process.stdout.write(
    `${engine}: inventory/vicinity/details wheel and redraw contract passed (free pointer + synthetic locked cursor)\n`,
  );
} finally {
  await browser?.close();
  await vite.close();
}
