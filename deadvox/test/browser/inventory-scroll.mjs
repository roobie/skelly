// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
// biome-ignore-all lint/performance/noAwaitInLoops: one page and cursor; declared wheel trials cannot overlap
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium, loadPlaywright } from './chromium.mjs';
import { pressAction } from './input-actions.mjs';
import { dispatchMenuPointerMove } from './menu-pointer.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const { firefox } = await loadPlaywright();

const root = fileURLToPath(new URL('../..', import.meta.url));
const engine = process.argv[2] ?? 'chromium';
assert.ok(['chromium', 'firefox'].includes(engine));
// Owned overflowing containers/items: changing shipped clothes or loadouts cannot turn this into a no-op.
const content = [
  {
    source: 'inventory-scroll-fixture',
    data: {
      inventory: [{ id: 'player', containerMaxWidthCells: 5 }],
      furniture: [
        {
          id: 'scroll_rack',
          name: 'Scroll rack',
          size: [1, 1, 1],
          color: '#494b4e',
          container: { pockets: [{ name: 'Rack', grid: [5, 6], handlingSimSeconds: 0.1 }] },
        },
        {
          id: 'scroll_small_container',
          name: '_',
          size: [1, 1, 1],
          color: '#494b4e',
          container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 0.1 }] },
        },
      ],
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
        {
          id: 'scroll_bag',
          name: 'Scroll bag',
          category: 'clothing',
          weight: 1,
          size: [1, 1],
          container: {
            pockets: [
              { name: 'Main', grid: [2, 2], handlingSimSeconds: 0.1 },
              { name: 'Lid', grid: [1, 2], handlingSimSeconds: 0.1 },
            ],
          },
        },
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
const populatePiles = () => {
  for (let i = 0; i < 12; i++) {
    if (!inventory.add(inventory.create('scroll_token'), { kind: 'pile', pos: [i % 3, 0, Math.floor(i / 3)] })) throw Error('pile fixture failed');
  }
  if (!inventory.add(inventory.create('scroll_bag'), { kind: 'pile', pos: [0, 0, 0] })) throw Error('floor container fixture failed');
  screen.update();
};
let needsText = 'health 100% · stamina 100%';
const screen = new InventoryScreen(document.querySelector('#inventory'), inventory, new HandlingQueue(inventory), {
  reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 }),
  feet: () => [0, 0, 0], nearby: () => [...inventory.piles.values()], distance: () => 0,
  containers: () => [...inventory.entities.all], entityDistance: () => 0, dispatch: () => undefined, searching: () => false,
  notice: () => {}, describe: () => Array.from({ length: 40 }, (_, i) => 'Detail line ' + i), workOptions: () => [],
  body: () => body.snapshotState(), character: () => ({ skills: {}, practice: {} }), needs: () => needsText,
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
  containerMaxWidthCells: registry.inventory.get('player')?.containerMaxWidthCells,
  populatePiles,
  addCapRack() {
    const width = registry.inventory.get('player')?.containerMaxWidthCells;
    if (width === undefined) throw Error('content width cap is missing');
    const rack = inventory.entities.add({ type: 'scroll_rack', pos: [0, 0, 0], size: [1, 1, 1], facing: 'n' });
    if (!rack) throw Error('cap-width rack fixture failed');
    rack.searched = true;
    if (!inventory.add(inventory.create('scroll_token'), { kind: 'furniture', entity: rack, pocket: 0, at: { x: width - 1, y: 0, rotated: false } })) {
      throw Error('last-column item fixture failed');
    }
    const small = inventory.entities.add({ type: 'scroll_small_container', pos: [1, 0, 0], size: [1, 1, 1], facing: 'n' });
    if (!small) throw Error('small container fixture failed');
    small.searched = true;
    screen.update();
  },
  get gameplayWheels() { return gameplayWheels; },
  resetWheels() { gameplayWheels = 0; },
  redraw() {
    if (!inventory.add(inventory.create('scroll_token'), { kind: 'pile', pos: [0, 0, 0] })) throw Error('redraw fixture failed');
    screen.update();
  },
  redrawAfterNeedsChange() {
    needsText = needsText === 'health 100% · stamina 100%' ? 'health 100% · stamina 99%' : 'health 100% · stamina 100%';
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
    {
      name: 'foregrip-fit-game-observer',
      enforce: 'pre',
      transform(code, id) {
        if (!id.split('?')[0].endsWith('/src/game/play.ts')) {
          return;
        }
        const marker = '  const onForwardPress = (e: MouseEvent) => {';
        assert.ok(code.includes(marker), 'game instrumentation marker still exists');
        return code.replace(
          marker,
          `  globalThis.foregripFitTest = { session, screen, input, dispatches: [] };\n  const originalScreenDispatch = screen.hooks.dispatch.bind(screen.hooks);\n  screen.hooks.dispatch = (payload) => { globalThis.foregripFitTest.dispatches.push(payload); return originalScreenDispatch(payload); };\n${marker}`,
        );
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
      : await launchChromium('inventory-scroll', {
          headless: true,
          // Exercise the double-scrollbar width budget with desktop-style scrollbars.
          ignoreDefaultArgs: ['--hide-scrollbars'],
        });
  const page = await browser.newPage({ viewport: { width: 1280, height: 480 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/__scroll.html`);
  try {
    await page.waitForFunction(() => Boolean(globalThis.scrollFixture));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}${errors.length > 0 ? `; page errors: ${errors.join('; ')}` : ''}`, { cause: error });
  }
  assert.equal(
    await page.locator('#inventory [data-body-region]').count(),
    await page.evaluate(() => globalThis.scrollFixture.bodyRegions.length),
  );
  assert.equal(await page.locator('[data-body-region="leftArm"] button').count(), 0);
  await page.locator('#inventory .inv-tab[data-tab="items"]').click();
  await page.setViewportSize({ width: 800, height: 400 });
  await page.locator('#inventory [data-pane="you"] .inv-item').first().click();
  const selectedDetailLayout = await page.evaluate(() => {
    const body = document.querySelector('#inventory .inv-body[data-tab-panel="items"]');
    const you = body?.querySelector('[data-pane="you"]');
    const details = body?.querySelector('[data-pane="details"]');
    const around = body?.querySelector('[data-pane="around"]');
    const selected = body?.querySelector('.inv-item.selected');
    if (!(you && details && around && selected)) {
      throw new Error('Selected item details or one of the inventory columns is missing');
    }
    const youBox = you.getBoundingClientRect();
    const detailsBox = details.getBoundingClientRect();
    const aroundBox = around.getBoundingClientRect();
    return {
      between: youBox.right <= detailsBox.left && detailsBox.right <= aroundBox.left,
      detailsUid: details.getAttribute('data-selected-uid'),
      selectedUid: selected.getAttribute('data-uid'),
    };
  });
  assert.equal(
    selectedDetailLayout.between,
    true,
    `details sit between the two item locations: ${JSON.stringify(selectedDetailLayout)}`,
  );
  assert.equal(selectedDetailLayout.detailsUid, selectedDetailLayout.selectedUid, 'details show the selected item');
  const splitAtOpen = await page.evaluate(() => {
    const body = document.querySelector('#inventory .inv-body[data-tab-panel="items"]');
    const splitter = body?.querySelector('[data-inventory-splitter]');
    const you = body?.querySelector('[data-pane="you"]');
    const details = body?.querySelector('[data-pane="details"]');
    const around = body?.querySelector('[data-pane="around"]');
    if (!(body && splitter && you && details && around)) {
      throw new Error('Items pane divider or columns are missing');
    }
    const dividerBox = splitter.getBoundingClientRect();
    const youBox = you.getBoundingClientRect();
    const detailsBox = details.getBoundingClientRect();
    const tracks = getComputedStyle(body).gridTemplateColumns.trim().split(' ').map(Number.parseFloat);
    return {
      ratio: Number(splitter.getAttribute('aria-valuenow')),
      dividerBetweenColumns: youBox.right <= dividerBox.left && dividerBox.right <= detailsBox.left,
      aroundWidth: around.getBoundingClientRect().width,
      aroundColumnWidth: tracks[3],
    };
  });
  assert.equal(splitAtOpen.ratio, 50, `side panes start balanced: ${JSON.stringify(splitAtOpen)}`);
  assert.equal(
    splitAtOpen.dividerBetweenColumns,
    true,
    `divider stays between columns: ${JSON.stringify(splitAtOpen)}`,
  );
  assert.ok(
    Math.abs(splitAtOpen.aroundWidth - splitAtOpen.aroundColumnWidth) <= 1,
    `Around you fills its column: ${JSON.stringify(splitAtOpen)}`,
  );
  const dragSplitter = async (fraction) => {
    const geometry = await page.evaluate(() => {
      const body = document.querySelector('#inventory .inv-body[data-tab-panel="items"]');
      const splitter = body?.querySelector('[data-inventory-splitter]');
      if (!(body && splitter)) {
        throw new Error('Items pane divider is missing');
      }
      const details = body.querySelector('[data-pane="details"]');
      if (!details) {
        throw new Error('Items details pane is missing');
      }
      const dividerBox = splitter.getBoundingClientRect();
      const availableWidth = body.clientWidth - splitter.offsetWidth - details.offsetWidth;
      return {
        divider: dividerBox.toJSON(),
        ratio: Number(splitter.getAttribute('aria-valuenow')) / 100,
        availableWidth,
      };
    });
    const y = geometry.divider.y + geometry.divider.height / 2;
    const startX = geometry.divider.x + geometry.divider.width / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + (fraction - geometry.ratio) * geometry.availableWidth, y);
    await page.mouse.up();
  };
  await dragSplitter(0);
  const splitAtLeftClamp = await page.evaluate(() => {
    const body = document.querySelector('#inventory .inv-body[data-tab-panel="items"]');
    const splitter = document.querySelector('#inventory [data-inventory-splitter]');
    const details = body?.querySelector('[data-pane="details"]');
    return {
      ratio: Number(splitter?.getAttribute('aria-valuenow')),
      availableWidth: body && splitter && details ? body.clientWidth - splitter.offsetWidth - details.offsetWidth : 0,
    };
  });
  assert.ok(
    Math.abs(splitAtLeftClamp.ratio - Math.round((220 / splitAtLeftClamp.availableWidth) * 100)) <= 1,
    `left drag reaches the JavaScript clamp within percentage rounding: ${JSON.stringify(splitAtLeftClamp)}`,
  );
  await dragSplitter(1);
  const splitAtRightClamp = await page.evaluate(() => {
    const body = document.querySelector('#inventory .inv-body[data-tab-panel="items"]');
    const splitter = document.querySelector('#inventory [data-inventory-splitter]');
    const details = body?.querySelector('[data-pane="details"]');
    return {
      ratio: Number(splitter?.getAttribute('aria-valuenow')),
      availableWidth: body && splitter && details ? body.clientWidth - splitter.offsetWidth - details.offsetWidth : 0,
    };
  });
  assert.ok(
    Math.abs(splitAtRightClamp.ratio - Math.round((1 - 220 / splitAtRightClamp.availableWidth) * 100)) <= 1,
    `right drag reaches the JavaScript clamp within percentage rounding: ${JSON.stringify(splitAtRightClamp)}`,
  );
  await dragSplitter(0.5);
  const middleRatio = Number(await page.locator('#inventory [data-inventory-splitter]').getAttribute('aria-valuenow'));
  assert.ok(
    Math.abs(middleRatio - 50) <= 1,
    `integer clientX rounding can shift the divider by one percentage point: ${middleRatio}`,
  );
  const emptyAround = await page.evaluate(() => {
    const around = document.querySelector('#inventory [data-pane="around"]');
    const you = document.querySelector('#inventory [data-pane="you"]');
    const grid = around?.querySelector('.inv-grid');
    if (!around) {
      throw new Error('empty vicinity pane is missing');
    }
    if (!you) {
      throw new Error('player pane is missing');
    }
    if (!grid) {
      throw new Error('empty-feet drop target is missing');
    }
    const aroundBox = around.getBoundingClientRect();
    const youBox = you.getBoundingClientRect();
    const targetBox = grid.getBoundingClientRect();
    const cell = Number.parseFloat(getComputedStyle(grid).backgroundSize.split(' ')[0]);
    const hit = document.elementFromPoint(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    return {
      around: { width: aroundBox.width, height: aroundBox.height, right: aroundBox.right, bottom: aroundBox.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      you: { width: youBox.width, height: youBox.height },
      target: { width: targetBox.width, height: targetBox.height },
      cell,
      cap: globalThis.scrollFixture.containerMaxWidthCells,
      targetIsHit: hit?.closest('.inv-grid') === grid,
    };
  });
  assert.ok(
    emptyAround.around.right <= emptyAround.viewport.width && emptyAround.around.bottom <= emptyAround.viewport.height,
    `vicinity stays inside its viewport: ${JSON.stringify(emptyAround)}`,
  );
  assert.ok(
    emptyAround.target.width < emptyAround.around.width,
    `empty vicinity content shrink-wraps inside its pane: ${JSON.stringify(emptyAround)}`,
  );
  assert.ok(
    emptyAround.target.height < emptyAround.around.height,
    `empty-feet target stays compact in the full-height Around pane: ${JSON.stringify(emptyAround)}`,
  );
  assert.ok(
    emptyAround.target.width >= 2 * emptyAround.cell && emptyAround.target.height >= 2 * emptyAround.cell,
    `feet target remains a usable two-cell hit area: ${JSON.stringify(emptyAround)}`,
  );
  assert.ok(emptyAround.targetIsHit, 'the visible empty-feet target receives a centre pointer hit');
  await page.evaluate(() => globalThis.scrollFixture.addCapRack());
  const capWideRack = await page.evaluate(() => {
    const around = document.querySelector('#inventory [data-pane="around"]');
    const rack = document.querySelector('#inventory .inv-pile[data-entity-uid]');
    const scroll = rack?.querySelector('.inv-grid-scroll');
    const grid = scroll?.querySelector('.inv-grid');
    const item = grid?.querySelector('.inv-item');
    if (!(around && scroll && grid && item)) {
      throw new Error('cap-width rack fixture is missing');
    }
    const pane = around.getBoundingClientRect();
    const cell = Number.parseFloat(getComputedStyle(grid).backgroundSize.split(' ')[0]);
    item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const itemBox = item.getBoundingClientRect();
    const hit = document.elementFromPoint(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
    return {
      pane: { left: pane.left, right: pane.right, top: pane.top, bottom: pane.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sectionWidth: rack.getBoundingClientRect().width,
      gridWidth: grid.getBoundingClientRect().width,
      clientWidth: scroll.clientWidth,
      scrollWidth: scroll.scrollWidth,
      scrollLeft: scroll.scrollLeft,
      itemLeft: Number.parseFloat(item.style.left),
      itemRect: { x: itemBox.x, y: itemBox.y, width: itemBox.width, height: itemBox.height },
      cell,
      cap: globalThis.scrollFixture.containerMaxWidthCells,
      itemHit: hit?.closest('.inv-item') === item,
    };
  });
  assert.ok(
    capWideRack.pane.left >= 0 &&
      capWideRack.pane.right <= capWideRack.viewport.width &&
      capWideRack.pane.top >= 0 &&
      capWideRack.pane.bottom <= capWideRack.viewport.height,
    `cap-wide vicinity stays inside its viewport: ${JSON.stringify(capWideRack)}`,
  );
  assert.ok(
    capWideRack.gridWidth <= capWideRack.cap * capWideRack.cell + 1,
    `cap-wide rack grid stays within the content cap: ${JSON.stringify(capWideRack)}`,
  );
  assert.ok(
    capWideRack.scrollWidth <= capWideRack.clientWidth,
    `cap-wide rack needs no horizontal scrolling: ${JSON.stringify(capWideRack)}`,
  );
  assert.equal(
    Math.floor(capWideRack.itemLeft / capWideRack.cell),
    capWideRack.cap - 1,
    'fixture item occupies the rack’s last column',
  );
  assert.equal(capWideRack.scrollLeft, 0, 'revealing the item does not scroll its grid sideways');
  assert.ok(capWideRack.itemHit, `last-column item is pointer-accessible: ${JSON.stringify(capWideRack.itemRect)}`);
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.evaluate(() => globalThis.scrollFixture.populatePiles());
  const capContainerLayout = async () =>
    page.evaluate(() => {
      const rack = document.querySelector('#inventory .inv-pile[data-entity-uid]');
      const section = rack?.closest('[data-around-section="container"]');
      const scroll = rack?.querySelector('.inv-grid-scroll');
      const grid = scroll?.querySelector('.inv-grid');
      const around = document.querySelector('#inventory [data-pane="around"]');
      if (!(rack && section && scroll && grid && around)) {
        throw new Error('cap-width container layout is missing');
      }
      const sectionTop = section.getBoundingClientRect().top;
      const rowSections = [...around.querySelectorAll('[data-around-section]')].filter(
        (candidate) => Math.abs(candidate.getBoundingClientRect().top - sectionTop) < 1,
      ).length;
      const cell = Number.parseFloat(getComputedStyle(grid).backgroundSize.split(' ')[0]);
      return {
        rowSections,
        aroundWidth: around.getBoundingClientRect().width,
        sections: [...around.querySelectorAll('[data-around-section]')].map((candidate) => {
          const box = candidate.getBoundingClientRect();
          return {
            label: candidate.querySelector('.inv-pile-label')?.textContent,
            x: box.x,
            y: box.y,
            width: box.width,
          };
        }),
        gridWidth: grid.getBoundingClientRect().width,
        cap: globalThis.scrollFixture.containerMaxWidthCells,
        cell,
        scrollWidth: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
      };
    });
  const balancedCapContainer = await capContainerLayout();
  const aroundLayout = async () =>
    page.evaluate(() => {
      const around = document.querySelector('#inventory [data-pane="around"]');
      const sections = [...document.querySelectorAll('#inventory [data-pane="around"] [data-around-section]')];
      const floor = document.querySelector('#inventory .inv-grid-packed');
      if (!(around && floor && sections.length > 0)) {
        throw new Error('responsive vicinity sections are missing');
      }
      const aroundBox = around.getBoundingClientRect();
      const sectionBoxes = sections.map((section) => section.getBoundingClientRect());
      const firstTop = Math.min(...sectionBoxes.map((box) => box.top));
      return {
        firstRow: sectionBoxes.filter((box) => Math.abs(box.top - firstTop) < 1).length,
        overflow: sectionBoxes.some((box) => box.left < aroundBox.left || box.right > aroundBox.right),
        floorWidth: floor.getBoundingClientRect().width,
        floorColumns: getComputedStyle(floor).gridTemplateColumns.trim().split(' ').length,
        pileState: JSON.stringify(globalThis.scrollFixture.inventory.snapshotState().piles),
      };
    });
  const balancedLayout = await aroundLayout();
  await dragSplitter(0);
  const wideLayout = await aroundLayout();
  const wideCapContainer = await capContainerLayout();
  for (const [split, layout] of [
    ['balanced', balancedCapContainer],
    ['wide', wideCapContainer],
  ]) {
    assert.ok(layout.rowSections > 1, `${split} cap-width container shares a row: ${JSON.stringify(layout)}`);
    assert.ok(
      layout.gridWidth <= layout.cap * layout.cell + 1,
      `${split} container grid stays within the cap: ${JSON.stringify(layout)}`,
    );
    assert.ok(
      layout.scrollWidth <= layout.clientWidth,
      `${split} shared container fits without horizontal scrolling: ${JSON.stringify(layout)}`,
    );
  }
  assert.ok(
    wideLayout.firstRow > balancedLayout.firstRow,
    `wider Around you fits another section: ${JSON.stringify({ balancedLayout, wideLayout })}`,
  );
  assert.equal(wideLayout.overflow, false, `Around-you sections stay in their column: ${JSON.stringify(wideLayout)}`);
  assert.equal(
    wideLayout.pileState,
    balancedLayout.pileState,
    'responsive floor packing leaves saved pile positions unchanged',
  );
  assert.ok(
    wideLayout.floorWidth !== balancedLayout.floorWidth && wideLayout.floorColumns !== balancedLayout.floorColumns,
    `floor pile display packing follows its available width: ${JSON.stringify({ balancedLayout, wideLayout })}`,
  );
  await dragSplitter(0.5);
  await page.setViewportSize({ width: 960, height: 540 });
  const fittedAround = await page.locator('#inventory [data-pane="around"]').boundingBox();
  assert.ok(
    fittedAround && fittedAround.x + fittedAround.width <= 960 && fittedAround.y + fittedAround.height <= 540,
    `vicinity stays within the fitted screen: ${JSON.stringify(fittedAround)}`,
  );
  await page.setViewportSize({ width: 480, height: 400 });
  const narrowLayout = await page.evaluate(() => {
    const body = document.querySelector('#inventory .inv-body[data-tab-panel="items"]');
    const you = body?.querySelector('[data-pane="you"]');
    const details = body?.querySelector('[data-pane="details"]');
    const around = body?.querySelector('[data-pane="around"]');
    if (!(body && you && details && around)) {
      throw new Error('Narrow inventory columns are missing');
    }
    const youBox = you.getBoundingClientRect();
    const detailsBox = details.getBoundingClientRect();
    const aroundBox = around.getBoundingClientRect();
    const actions = [...details.querySelectorAll('.inv-option')];
    const actionsFit = actions.every((action) => {
      const bounds = action.getBoundingClientRect();
      return bounds.left >= detailsBox.left && bounds.right <= detailsBox.right;
    });
    return {
      noHorizontalOverflow: body.scrollWidth <= body.clientWidth,
      stacked: youBox.bottom <= detailsBox.top && detailsBox.bottom <= aroundBox.top,
      actionCount: actions.length,
      actionsFit,
    };
  });
  assert.equal(
    narrowLayout.noHorizontalOverflow,
    true,
    `narrow inventory does not hide columns: ${JSON.stringify(narrowLayout)}`,
  );
  assert.equal(
    narrowLayout.stacked,
    true,
    `narrow inventory stacks its scrollable columns: ${JSON.stringify(narrowLayout)}`,
  );
  assert.ok(narrowLayout.actionCount > 0, `the details panel exposes an action: ${JSON.stringify(narrowLayout)}`);
  assert.equal(
    narrowLayout.actionsFit,
    true,
    `narrow detail actions stay inside their panel: ${JSON.stringify(narrowLayout)}`,
  );
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.evaluate(() => globalThis.scrollFixture.populatePiles());
  const failures = [];
  let activeTab;
  for (const { tab, selector } of [
    { tab: 'skills', selector: '#inventory [data-pane="body"]' },
    { tab: 'items', selector: '#inventory [data-pane="you"]' },
    { tab: 'items', selector: '#inventory [data-pane="around"]' },
    { tab: 'items', selector: '#inventory .inv-details' },
  ]) {
    if (activeTab !== tab) {
      await page.locator(`#inventory .inv-tab[data-tab="${tab}"]`).click();
      activeTab = tab;
    }
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
  const selectedPane = page.locator('#inventory [data-pane="you"]');
  const scrolledAway = await selectedPane.evaluate((pane) => {
    pane.scrollTop = pane.scrollHeight;
    const selectedUid = String(globalThis.scrollFixture.screen.selected.uid);
    const row = [...pane.querySelectorAll('.inv-item[data-uid]')].find(
      (candidate) => candidate.dataset.uid === selectedUid,
    );
    const rowBox = row.getBoundingClientRect();
    const paneBox = pane.getBoundingClientRect();
    return {
      scrollTop: pane.scrollTop,
      rowOutsidePane: rowBox.bottom <= paneBox.top || rowBox.top >= paneBox.bottom,
    };
  });
  assert.ok(
    scrolledAway.scrollTop > 0 && scrolledAway.rowOutsidePane,
    `selected row scrolled away: ${JSON.stringify(scrolledAway)}`,
  );
  await page.evaluate(() => globalThis.scrollFixture.redrawAfterNeedsChange());
  const selectionAfterNeedsRedraw = await selectedPane.evaluate((pane) => pane.scrollTop);
  assert.equal(
    selectionAfterNeedsRedraw,
    scrolledAway.scrollTop,
    'needs redraw must preserve the player-scrolled pane even while a row remains selected',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, [], 'each pane scrolls without page/input-surface wheel leakage and survives #67 redraw');
  if (engine === 'chromium') {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      let locked = null;
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
      Element.prototype.requestPointerLock = function () {
        locked = this;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      };
      document.exitPointerLock = () => {
        locked = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await page.goto(
      browserStageUrl(
        'inventory-scroll',
        `http://127.0.0.1:${address.port}/?debug=1&seed=73&radius=64&post=0&sunshadow=0&torchshadow=0`,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
      timeout: 30_000,
    });
    await page.locator('#go').click();
    await page.waitForFunction(() => globalThis.foregripFitTest && document.querySelector('#overlay')?.hidden, null, {
      timeout: 20_000,
    });
    const clickThroughMenuCursor = async (selector) => {
      const targetLocator = typeof selector === 'string' ? page.locator(selector) : selector;
      const bounds = await targetLocator.boundingBox();
      assert.ok(bounds, `visible target: ${selector}`);
      const target = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      await page.mouse.move(target.x, target.y);
      const current = await page.evaluate(() => ({
        x: globalThis.foregripFitTest.input.cursorX,
        y: globalThis.foregripFitTest.input.cursorY,
      }));
      if (Math.abs(current.x - target.x) > 1 || Math.abs(current.y - target.y) > 1) {
        await page.evaluate(dispatchMenuPointerMove, {
          canvasSelector: '#view',
          movementX: target.x - current.x,
          movementY: target.y - current.y,
          centerClient: true,
          alsoDispatchMouseMove: true,
        });
      }
      await page.mouse.click(target.x, target.y);
    };
    const spawn = async (type) => {
      await pressAction(page, 'debug.spawn-menu-toggle');
      await page.locator('#spawn input').fill(type);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#spawn')?.hidden, null, { timeout: 5000 });
      await page.waitForFunction(
        (itemType) =>
          [...globalThis.foregripFitTest.session.inventory.items()].some(({ item }) => item.type === itemType),
        type,
        { timeout: 5000 },
      );
    };
    await spawn('foregrip');
    await spawn('rifle_assault');
    await pressAction(page, 'ui.inventory-toggle');
    await page.waitForFunction(() => !document.querySelector('#inventory')?.hidden);
    const uidFor = (type) =>
      page.evaluate(
        (itemType) =>
          [...globalThis.foregripFitTest.session.inventory.items()].find(({ item }) => item.type === itemType)?.item
            .uid,
        type,
      );
    const gripUid = await uidFor('foregrip');
    const rifleUid = await uidFor('rifle_assault');
    assert.ok(Number.isSafeInteger(gripUid) && Number.isSafeInteger(rifleUid));
    await clickThroughMenuCursor(`#inventory [data-uid="${gripUid}"]`);
    await pressAction(page, 'inventory.best-pocket');
    await page.waitForFunction(
      (uid) =>
        globalThis.foregripFitTest.session.inventory.locate(globalThis.foregripFitTest.session.inventory.itemByUid(uid))
          ?.kind === 'pocket',
      gripUid,
      { timeout: 10_000 },
    );
    await clickThroughMenuCursor(`#inventory [data-uid="${rifleUid}"]`);
    await pressAction(page, 'inventory.hands');
    await page.waitForFunction(
      (uid) => Object.values(globalThis.foregripFitTest.session.inventory.hands).some((item) => item?.uid === uid),
      rifleUid,
      { timeout: 10_000 },
    );
    await clickThroughMenuCursor(`#inventory [data-uid="${rifleUid}"]`);
    const fitButtons = page.locator('#inventory .inv-details button.inv-option').filter({ hasText: /Fit .*foregrip/i });
    assert.ok((await fitButtons.count()) > 0, 'held AR offers the pocketed foregrip as a fit action');
    const fitButton = fitButtons.first();
    await fitButton.scrollIntoViewIfNeeded();
    const slotId = await fitButton.evaluate((button) =>
      button.closest('[data-attachment-slot]')?.getAttribute('data-attachment-slot'),
    );
    assert.ok(slotId, 'the fit control identifies its attachment slot');
    const before = await page.evaluate(() => ({
      dispatches: globalThis.foregripFitTest.dispatches.length,
      jobs: globalThis.foregripFitTest.session.queue.jobs.length,
    }));
    assert.equal(before.jobs, 0, 'the fit begins with an idle handling queue');
    const pageErrorsBeforeFit = errors.length;
    await clickThroughMenuCursor(fitButton);
    await page.waitForFunction(
      (dispatchCount) => globalThis.foregripFitTest.dispatches.length > dispatchCount,
      before.dispatches,
      { timeout: 5000 },
    );
    const fitResult = await page.evaluate(
      ({ dispatchesBefore, rifleUid: expectedRifleUid, gripUid: expectedGripUid, slotId: expectedSlotId }) => {
        const { dispatches } = globalThis.foregripFitTest;
        const fitActions = dispatches
          .slice(dispatchesBefore)
          .filter((action) => action.kind === 'firearm.attachment.fit');
        return {
          fitActions: fitActions.map(({ kind, firearmUid, attachmentUid, slotId: actionSlot }) => ({
            kind,
            firearmUid,
            attachmentUid,
            slotId: actionSlot,
          })),
          expected: {
            kind: 'firearm.attachment.fit',
            firearmUid: expectedRifleUid,
            attachmentUid: expectedGripUid,
            slotId: expectedSlotId,
          },
        };
      },
      { dispatchesBefore: before.dispatches, rifleUid, gripUid, slotId },
    );
    assert.deepEqual(
      fitResult.fitActions,
      [fitResult.expected],
      'the production fit control dispatches once for its slot',
    );
    await page.evaluate(() => globalThis.foregripFitTest.session.frame(0.1));
    const fitJobs = await page.evaluate(() => globalThis.foregripFitTest.session.queue.jobs.length);
    assert.equal(fitJobs - before.jobs, 1, 'the fit dispatch creates exactly one handling job');
    const fitSettled = await page.evaluate(
      ({ rifleUid: expectedRifleUid, gripUid: expectedGripUid, slotId: expectedSlotId }) => {
        const { session } = globalThis.foregripFitTest;
        const maxFrames = Math.ceil(session.queue.remaining / 0.1) + 2;
        let frames = 0;
        while (session.queue.jobs.length > 0 && frames < maxFrames) {
          session.frame(0.1);
          frames += 1;
        }
        const rifle = session.inventory.itemByUid(expectedRifleUid);
        const grip = session.inventory.itemByUid(expectedGripUid);
        const location = grip && session.inventory.locate(grip);
        return {
          frames,
          queueJobs: session.queue.jobs.length,
          attachedUid: rifle?.slots?.[expectedSlotId]?.uid,
          gripLocation:
            location?.kind === 'slot'
              ? { kind: location.kind, ownerUid: location.owner.uid, slot: location.slot }
              : { kind: location?.kind },
        };
      },
      { rifleUid, gripUid, slotId },
    );
    assert.equal(fitSettled.queueJobs, 0, 'simulation frames finish the fit handling job');
    assert.equal(fitSettled.attachedUid, gripUid, 'the grip is fitted in the clicked slot');
    assert.deepEqual(fitSettled.gripLocation, { kind: 'slot', ownerUid: rifleUid, slot: slotId });
    assert.deepEqual(errors.slice(pageErrorsBeforeFit), [], 'fitting does not raise a page error');

    const removeButton = page.locator(`#inventory [data-attachment-slot="${slotId}"] button.inv-option`).filter({
      hasText: /^Remove\b/,
    });
    await removeButton.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await removeButton.count(), 1, 'the fitted slot offers its production removal control');
    const beforeRemove = await page.evaluate(() => ({
      dispatches: globalThis.foregripFitTest.dispatches.length,
      jobs: globalThis.foregripFitTest.session.queue.jobs.length,
    }));
    const pageErrorsBeforeRemove = errors.length;
    await clickThroughMenuCursor(removeButton);
    await page.waitForFunction(
      (dispatchCount) =>
        globalThis.foregripFitTest.dispatches
          .slice(dispatchCount)
          .some((action) => action.kind === 'firearm.attachment.remove'),
      beforeRemove.dispatches,
      { timeout: 5000 },
    );
    const removeResult = await page.evaluate(
      ({ dispatchesBefore }) => {
        const { dispatches } = globalThis.foregripFitTest;
        return dispatches.slice(dispatchesBefore).filter((action) => action.kind === 'firearm.attachment.remove')
          .length;
      },
      { dispatchesBefore: beforeRemove.dispatches },
    );
    assert.equal(removeResult, 1, 'the production removal control dispatches once');
    await page.evaluate(() => globalThis.foregripFitTest.session.frame(0.1));
    const removeJobs = await page.evaluate(() => globalThis.foregripFitTest.session.queue.jobs.length);
    assert.equal(removeJobs - beforeRemove.jobs, 1, 'the removal dispatch creates exactly one handling job');
    const removalSettled = await page.evaluate(
      ({ rifleUid: expectedRifleUid, slotId: expectedSlotId }) => {
        const { session } = globalThis.foregripFitTest;
        const maxFrames = Math.ceil(session.queue.remaining / 0.1) + 2;
        let frames = 0;
        while (session.queue.jobs.length > 0 && frames < maxFrames) {
          session.frame(0.1);
          frames += 1;
        }
        const rifle = session.inventory.itemByUid(expectedRifleUid);
        return { frames, queueJobs: session.queue.jobs.length, attachedUid: rifle?.slots?.[expectedSlotId]?.uid };
      },
      { rifleUid, slotId },
    );
    assert.equal(removalSettled.queueJobs, 0, 'simulation frames finish the removal handling job');
    assert.equal(removalSettled.attachedUid, undefined, 'the production removal control empties the clicked slot');
    assert.deepEqual(errors.slice(pageErrorsBeforeRemove), [], 'removal does not raise a page error');
    process.stdout.write(
      `${engine}: live held-AR pocketed-foregrip fit/removal via locked menu click ${JSON.stringify({ fitSettled, removalSettled })}\n`,
    );
  }
  process.stdout.write(
    `${engine}: inventory/vicinity/details wheel and redraw contract passed (free pointer + synthetic locked cursor)\n`,
  );
} finally {
  await browser?.close();
  await vite.close();
}
