// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the executable and source checkout for A/B tests
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import('playwright');
const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
const observationPlugin = {
  name: 'primary-action-test-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const renderHandlingFrame = (): void => {';
    assert(code.includes(marker), 'game-loop observation point exists');
    return code.replace(
      marker,
      `  Object.assign(globalThis, { primaryActionTest: { input, inventory, session, survival, debugTools, showNotice, getNotice: () => notice, feet } });\n${marker}`,
    );
  },
};
const vite = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
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
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let locked = false;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => (locked ? document.querySelector('#view canvas') : null),
    });
    Element.prototype.requestPointerLock = () => {
      locked = true;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      locked = false;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
  });
  await page.goto(
    `http://127.0.0.1:${address.port}/?debug=1&seed=73&radius=64&time=12:00&post=0&sunshadow=0&torchshadow=0`,
  );
  await page.locator('#go').click();
  await page.waitForFunction(() => document.querySelector('#overlay')?.hidden && document.pointerLockElement);

  const flashlightUid = await page.evaluate(() => {
    const runtime = globalThis.primaryActionTest;
    const flashlight = runtime.inventory.create('flashlight');
    if (!runtime.inventory.add(flashlight, { kind: 'hand', side: 'right' })) {
      throw new Error('Could not place flashlight in the right hand');
    }
    globalThis.primaryActionObserved = { flashlightUid: flashlight.uid, swings: [] };
    const begin = runtime.session.zombies.beginMeleeSwing.bind(runtime.session.zombies);
    runtime.session.zombies.beginMeleeSwing = (start) => {
      const result = begin(start);
      globalThis.primaryActionObserved.swings.push({ result, profile: start.profile, hand: start.hand });
      return result;
    };
    return flashlight.uid;
  });
  const observe = () =>
    page.evaluate(
      (uid) => ({
        on: globalThis.primaryActionTest.inventory.itemByUid(uid)?.on ?? false,
        stamina: globalThis.primaryActionTest.session.sim.needs.stamina,
        swings: [...globalThis.primaryActionObserved.swings],
      }),
      flashlightUid,
    );

  const beforeOn = await observe();
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const afterOn = await observe();
  assert.equal(
    afterOn.on,
    true,
    `first left-click must switch the held flashlight on; state=${JSON.stringify(afterOn)}`,
  );
  assert.deepEqual(afterOn.swings, [], `switching on the flashlight must not swing; state=${JSON.stringify(afterOn)}`);
  assert.equal(afterOn.stamina, beforeOn.stamina, 'switching on the flashlight must not spend melee stamina');

  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const afterOff = await observe();
  assert.equal(afterOff.on, false, 'second left-click must switch the held flashlight off');
  assert.deepEqual(afterOff.swings, [], 'switching off the flashlight must not swing');
  assert.equal(afterOff.stamina, beforeOn.stamina, 'switching the flashlight off must not spend melee stamina');

  await page.evaluate(() => {
    const runtime = globalThis.primaryActionTest;
    runtime.inventory.hands.right = runtime.inventory.create('rag');
    runtime.inventory.hands.left = undefined;
    runtime.inventory.version += 1;
    globalThis.primaryActionObserved.swings = [];
  });
  const beforeUnsupported = await page.evaluate(() => globalThis.primaryActionTest.session.sim.needs.stamina);
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const unsupported = await page.evaluate(() => ({
    swings: [...globalThis.primaryActionObserved.swings],
    stamina: globalThis.primaryActionTest.session.sim.needs.stamina,
    notice: globalThis.primaryActionTest.getNotice(),
  }));
  assert.deepEqual(unsupported.swings, [], 'an unsupported item must not fall back to fists');
  assert.equal(unsupported.stamina, beforeUnsupported, 'an unsupported item must not spend melee stamina');
  assert.equal(unsupported.notice, 'Nothing to do with rag');

  await page.evaluate(() => {
    const { inventory } = globalThis.primaryActionTest;
    inventory.hands.right = undefined;
    inventory.version += 1;
    globalThis.primaryActionObserved.swings = [];
  });
  const beforeFists = await page.evaluate(() => globalThis.primaryActionTest.session.sim.needs.stamina);
  await page.mouse.click(640, 450);
  await page.waitForTimeout(150);
  const fists = await page.evaluate(() => ({
    swings: [...globalThis.primaryActionObserved.swings],
    stamina: globalThis.primaryActionTest.session.sim.needs.stamina,
  }));
  assert.equal(fists.swings.length, 1, 'empty hands must start a fists swing');
  assert.equal(fists.swings[0].profile, 'fists');
  assert.equal(fists.swings[0].result, true);
  assert.ok(fists.stamina < beforeFists, 'the fists swing must spend stamina');
  assert.deepEqual(pageErrors, [], `browser errors: ${pageErrors.join('; ')}`);
  process.stdout.write(
    'primary-action browser contract passed: light toggles without a swing, unsupported items hint, and empty hands punch.\n',
  );
} finally {
  await browser?.close();
  await vite.close();
}
