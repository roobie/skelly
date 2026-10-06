// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: post modes are tested sequentially against one running page
// biome-ignore-all lint/suspicious/noMisplacedAssertion: Node's test runner owns these assertions
// biome-ignore-all lint/style/noProcessEnv: the browser executable is configured by the runner
import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { pressAction } from './input-actions.mjs';
import { browserStageArgs, browserStageUrl } from './stage-mode.mjs';

const { chromium } = await import('playwright');

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const observationPlugin = {
  name: 'melee-build-click-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    assert(code.includes(marker), 'game loop observation point is present');
    return code.replace(
      marker,
      `  Object.assign(globalThis, { d7Review: { input, session, held: view.held, engine, camera, debugTools, inventory } });\n${marker}`,
    );
  },
};
const vite = await createServer({
  root: projectRoot,
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  logLevel: 'error',
  plugins: [observationPlugin],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    headless: true,
    args: browserStageArgs('melee-build-click'),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(browserStageUrl('melee-build-click', `http://127.0.0.1:${address.port}/?seed=73&debug=1&radius=16`), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.d7Review));
  await page.evaluate(() => {
    const runtime = globalThis.d7Review;
    globalThis.d7Observed = { starts: [] };
    const begin = runtime.session.playerCombat.beginMeleeSwing.bind(runtime.session.playerCombat);
    runtime.session.playerCombat.beginMeleeSwing = (start) => {
      const result = begin(start);
      globalThis.d7Observed.starts.push({ result, build: runtime.debugTools.buildOn });
      return result;
    };
  });

  await page.waitForFunction(() => globalThis.d7Review.input.locked && !globalThis.d7Review.input.menuPointer);
  await page.evaluate(() => {
    globalThis.d7Observed.starts = [];
    globalThis.d7Observed.buildStaminaBefore = globalThis.d7Review.session.sim.needs.stamina;
  });
  await pressAction(page, 'debug.build-toggle');
  assert.equal(await page.evaluate(() => globalThis.d7Review.debugTools.buildOn), true);
  await page.mouse.click(640, 360);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const build = await page.evaluate(() => ({
    locked: globalThis.d7Review.input.locked,
    menu: globalThis.d7Review.input.menuPointer,
    build: globalThis.d7Review.debugTools.buildOn,
    starts: globalThis.d7Observed.starts,
    staminaBefore: globalThis.d7Observed.buildStaminaBefore,
    staminaAfter: globalThis.d7Review.session.sim.needs.stamina,
  }));
  await test('A native build-mode click is editor-only: no melee action and no stamina cost', () => {
    assert.equal(build.locked, true);
    assert.equal(build.menu, false);
    assert.equal(build.build, true);
    assert.deepEqual(build.starts, []);
    assert.equal(build.staminaAfter, build.staminaBefore);
  });

  await pressAction(page, 'debug.build-toggle');
  assert.equal(await page.evaluate(() => globalThis.d7Review.debugTools.buildOn), false);
  const meleeAdded = await page.evaluate(() => {
    const { inventory } = globalThis.d7Review;
    return inventory.add(inventory.create('kitchen_knife'), { kind: 'hand', side: 'right' });
  });
  assert.equal(meleeAdded, true, 'positive control has a held melee weapon');
  await page.evaluate(() => {
    globalThis.d7Observed.starts = [];
    globalThis.d7Observed.combatStaminaBefore = globalThis.d7Review.session.sim.needs.stamina;
  });
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => globalThis.d7Observed.starts.length > 0);
  const combat = await page.evaluate(() => ({
    starts: globalThis.d7Observed.starts,
    staminaBefore: globalThis.d7Observed.combatStaminaBefore,
    staminaAfter: globalThis.d7Review.session.sim.needs.stamina,
  }));
  await test('A native combat click with a melee weapon starts one attack and spends stamina (positive control)', () => {
    assert.equal(combat.starts.length, 1);
    assert.equal(combat.starts[0].result, true);
    assert.equal(combat.starts[0].build, false);
    assert.ok(combat.staminaAfter < combat.staminaBefore);
  });

  await page.waitForFunction(() => !globalThis.d7Review.session.playerCombat.activeMeleeAction, null, {
    timeout: 10_000,
  });
  await page.evaluate(() => {
    globalThis.d7Observed.starts = [];
  });
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => globalThis.d7Review.input.menuPointer && !document.querySelector('#inventory').hidden),
    true,
  );
  await page.mouse.click(640, 360);
  await page.keyboard.press('Tab');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const menu = await page.evaluate(() => ({
    locked: globalThis.d7Review.input.locked,
    menu: globalThis.d7Review.input.menuPointer,
    starts: globalThis.d7Observed.starts,
  }));
  await test('A canvas click consumed by the inventory cannot become an attack after Tab closes it', () => {
    assert.equal(menu.locked, true);
    assert.equal(menu.menu, false);
    assert.deepEqual(menu.starts, []);
  });
  await test('Native observation run produces no application errors', () => assert.deepEqual(errors, []));
} finally {
  await browser?.close();
  await vite.close();
}
