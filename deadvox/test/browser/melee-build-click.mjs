// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: post modes are tested sequentially against one running page
// biome-ignore-all lint/suspicious/noMisplacedAssertion: Node's test runner owns these assertions
// biome-ignore-all lint/style/noProcessEnv: the browser executable is configured by the runner
import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import('playwright');

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const observationPlugin = {
  name: 'melee-build-click-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const renderHandlingFrame = (): void => {';
    assert(code.includes(marker), 'game loop observation point is present');
    return code.replace(
      marker,
      `  Object.assign(globalThis, { d7Review: { input, session, held, engine, camera, debugTools } });\n${marker}`,
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
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/?seed=73&debug=1&radius=16`);
  await page.waitForFunction(() => Boolean(globalThis.d7Review));
  await page.evaluate(() => {
    const runtime = globalThis.d7Review;
    globalThis.d7Observed = { frames: [], starts: [], outsideMood: 0 };
    const begin = runtime.session.zombies.beginMeleeSwing.bind(runtime.session.zombies);
    runtime.session.zombies.beginMeleeSwing = (start) => {
      const result = begin(start);
      globalThis.d7Observed.starts.push({ result, build: runtime.debugTools.buildOn });
      return result;
    };
    const { mood, renderer } = runtime.engine;
    const renderMood = mood.render.bind(mood);
    const renderHands = runtime.held.render.bind(runtime.held);
    const render = renderer.render.bind(renderer);
    let active;
    mood.render = (callback) => {
      active = { post: mood.post, hands: 0, targets: [], sequence: [] };
      try {
        return renderMood(callback);
      } finally {
        globalThis.d7Observed.frames.push(active);
        globalThis.d7Observed.frames = globalThis.d7Observed.frames.slice(-12);
        active = undefined;
      }
    };
    runtime.held.render = (...args) => {
      if (active) {
        active.hands += 1;
      } else {
        globalThis.d7Observed.outsideMood += 1;
      }
      return renderHands(...args);
    };
    renderer.render = (scene, camera) => {
      if (active) {
        let sceneKind = 'post';
        if (scene === runtime.held.scene) {
          sceneKind = 'hands';
        } else if (scene === runtime.engine.scene) {
          sceneKind = 'world';
        }
        active.sequence.push(sceneKind);
        if (scene === runtime.held.scene) {
          active.targets.push(Boolean(renderer.getRenderTarget()));
        }
      }
      return render(scene, camera);
    };
  });
  await page.waitForTimeout(300);

  for (const post of [true, false]) {
    await page.evaluate((enabled) => {
      globalThis.d7Observed.frames = [];
      globalThis.d7Review.engine.mood.setPost(enabled);
    }, post);
    await page.waitForFunction(() => globalThis.d7Observed.frames.length >= 3);
    const proof = await page.evaluate(() => ({
      frames: globalThis.d7Observed.frames.slice(-3),
      outsideMood: globalThis.d7Observed.outsideMood,
    }));
    await test(`Post=${post}: one held draw inside Mood with the correct render target`, () => {
      assert.equal(proof.outsideMood, 0);
      for (const frame of proof.frames) {
        assert.equal(frame.post, post);
        assert.equal(frame.hands, 1);
        assert.deepEqual(frame.targets, [post]);
        assert.equal(frame.sequence[0], 'world');
        assert.equal(frame.sequence[1], 'hands');
      }
    });
  }

  await page.locator('#go').click();
  await page.waitForFunction(() => globalThis.d7Review.input.locked && !globalThis.d7Review.input.menuPointer);
  await page.evaluate(() => {
    globalThis.d7Observed.starts = [];
    globalThis.d7Observed.buildStaminaBefore = globalThis.d7Review.session.sim.needs.stamina;
  });
  await page.keyboard.press('KeyB');
  assert.equal(await page.evaluate(() => globalThis.d7Review.debugTools.buildOn), true);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(150);
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

  await page.keyboard.press('KeyB');
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    globalThis.d7Observed.starts = [];
    globalThis.d7Observed.combatStaminaBefore = globalThis.d7Review.session.sim.needs.stamina;
  });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(150);
  const combat = await page.evaluate(() => ({
    starts: globalThis.d7Observed.starts,
    staminaBefore: globalThis.d7Observed.combatStaminaBefore,
    staminaAfter: globalThis.d7Review.session.sim.needs.stamina,
  }));
  await test('A native combat click starts one melee action and spends stamina (positive control)', () => {
    assert.equal(combat.starts.length, 1);
    assert.equal(combat.starts[0].result, true);
    assert.equal(combat.starts[0].build, false);
    assert.ok(combat.staminaAfter < combat.staminaBefore);
  });

  await page.waitForTimeout(1100);
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
  await page.waitForTimeout(150);
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
