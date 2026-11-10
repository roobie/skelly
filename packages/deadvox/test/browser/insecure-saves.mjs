// Contract: the game and sounds pages paint styled before their modules load, and an insecure LAN-style context
// must play without touching unavailable save APIs.
// biome-ignore-all lint/correctness/noNodejsModules: standalone Playwright browser contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
// biome-ignore-all lint/style/noProcessEnv: test runner selects the browser executable
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer } from './stageServer.mjs';

const STAGE_TIMEOUT_MS = 30_000;
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const configFile = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));
let server;
let browser;
try {
  server = await createStageServer({
    configFile,
    root: projectRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await launchChromium('insecure-saves', { headless: true });
  // A page's style sheets block its first paint, so the startup screen is styled before the page's module is fetched.
  const styledBeforeModule = async ({ path, module, styled }) => {
    const page = await browser.newPage();
    // Never answered: the check runs while the module is still pending.
    await page.route(module, () => new Promise(() => undefined));
    await page.goto(`http://127.0.0.1:${address.port}${path}`, { waitUntil: 'commit', timeout: STAGE_TIMEOUT_MS });
    await page.locator(styled).waitFor({ state: 'attached', timeout: STAGE_TIMEOUT_MS });
    const links = page.locator('link[rel="stylesheet"]');
    assert.ok((await links.count()) > 0, `${path} links its style sheets in the page`);
    await page.waitForFunction(
      () => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => link.sheet !== null),
      undefined,
      { timeout: STAGE_TIMEOUT_MS },
    );
    const style = await page.evaluate((selector) => {
      const body = getComputedStyle(document.body).backgroundColor;
      return { body, position: getComputedStyle(document.querySelector(selector)).position };
    }, styled);
    assert.notEqual(style.body, 'rgba(0, 0, 0, 0)', `${path} body is styled while its module is pending`);
    if (path === '/') {
      assert.equal(style.position, 'fixed', 'the startup screen is styled while the main module is pending');
    }
    await page.close();
  };
  await styledBeforeModule({ path: '/', module: '**/src/main.ts', styled: '#startup-screen' });
  await styledBeforeModule({ path: '/sounds.html', module: '**/src/soundsPage.ts', styled: '#sound-sheet' });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: false });
    Object.defineProperty(Crypto.prototype, 'subtle', { configurable: true, get: () => undefined });
    Object.defineProperty(Crypto.prototype, 'randomUUID', { configurable: true, value: undefined });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(browserStageUrl('insecure-saves', `http://127.0.0.1:${address.port}/?seed=73`), {
    timeout: STAGE_TIMEOUT_MS,
  });
  await page.waitForSelector('#view', { timeout: STAGE_TIMEOUT_MS });
  await page.waitForFunction(
    () => (document.querySelector('#save-status')?.textContent ?? '').includes('Saves need a secure (https) page'),
    undefined,
    { timeout: STAGE_TIMEOUT_MS },
  );
  assert.equal(await page.locator('#continue').isDisabled(), true);
  assert.match(await page.locator('#save-status').textContent(), /this session won't be saved/);
  await page.click('#go', { timeout: STAGE_TIMEOUT_MS });
  await page.waitForFunction(
    () => (document.querySelector('#save-status')?.textContent ?? '').includes('New world ready'),
    undefined,
    { timeout: STAGE_TIMEOUT_MS },
  );
  assert.equal(await page.locator('#debug-center-x').count(), 0, 'ordinary profile has no debug center X');
  assert.match(
    await page.locator('#save-status').textContent(),
    /Saves need a secure \(https\) page; this session won't be saved/,
  );
  assert.deepEqual(pageErrors, []);
  process.stdout.write(
    'Chromium: pages styled while their modules are pending; insecure-context New world remains playable; Continue disabled, explicit no-save message shown, no page errors\n',
  );
} finally {
  await browser?.close();
  await server?.close();
}
