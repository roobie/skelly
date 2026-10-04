// Contract: an insecure LAN-style context must play without touching unavailable save APIs.
// biome-ignore-all lint/correctness/noNodejsModules: standalone Playwright browser contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
// biome-ignore-all lint/style/noProcessEnv: test runner selects the browser executable
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { browserStageArgs, browserStageUrl } from './stage-mode.mjs';

const STAGE_TIMEOUT_MS = 30_000;
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const configFile = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));
let server;
let browser;
try {
  server = await createServer({
    configFile,
    root: projectRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const { chromium } = await import('playwright');
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? undefined,
    headless: true,
    args: browserStageArgs('insecure-saves'),
  });
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
  assert.match(
    await page.locator('#save-status').textContent(),
    /Saves need a secure \(https\) page; this session won't be saved/,
  );
  assert.deepEqual(pageErrors, []);
  process.stdout.write(
    'Chromium: insecure-context New world remains playable; Continue disabled, explicit no-save message shown, no page errors\n',
  );
} finally {
  await browser?.close();
  await server?.close();
}
