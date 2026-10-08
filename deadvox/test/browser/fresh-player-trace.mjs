import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { browserStageUrl } from './stage-mode.mjs';

export async function traceFreshPlayer({ browser, stage, url, browserName, runtimeName, renderMode }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const started = performance.now();
  const mark = async (stageName, details = {}) => {
    const state = await page.evaluate((globalName) => {
      const runtime = globalThis[globalName];
      const button = document.querySelector('#go');
      const overlay = document.querySelector('#overlay');
      const position = runtime ? Array.from(runtime.session.body.pos) : null;
      return {
        readyState: document.readyState,
        goEnabled: button?.getAttribute('aria-disabled') === 'false',
        overlayHidden: overlay?.hidden ?? null,
        saveStatus: document.querySelector('#save-status')?.textContent?.trim() ?? null,
        player: position,
        spawnReady: runtime ? runtime.streamer.isReady(position[0], position[2]) : null,
        meshes: runtime ? Array.from(runtime.engine.meshes.keys()).length : null,
      };
    }, runtimeName);
    const navigation = await page.evaluate(() => {
      const [entry] = performance.getEntriesByType('navigation');
      return {
        domContentLoadedMs: entry?.domContentLoadedEventEnd ?? null,
        loadEventMs: entry?.loadEventEnd ?? null,
      };
    });
    process.stdout.write(
      `FRESH_PLAYER_TRACE ${JSON.stringify({
        browser: browserName,
        stage: stageName,
        elapsedMs: Math.round(performance.now() - started),
        ...navigation,
        ...state,
        ...details,
      })}\n`,
    );
  };

  await page.addInitScript(() => {
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => locked,
    });
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

  try {
    await page.goto(browserStageUrl(stage, url, renderMode), { waitUntil: 'commit' });
    await mark('document-commit');
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await mark('new-player-ready');

    await page.locator('#go').click();
    await page.waitForFunction(
      (globalName) =>
        Boolean(globalThis[globalName] && document.querySelector('#overlay')?.hidden && document.pointerLockElement),
      runtimeName,
    );
    await mark('pointer-lock-and-play-entry');

    await page.waitForFunction((globalName) => {
      const runtime = globalThis[globalName];
      const position = runtime?.session?.body?.pos;
      return position && runtime.streamer.isReady(position[0], position[2]);
    }, runtimeName);
    await mark('spawn-columns-ready');

    await page.waitForFunction((globalName) => {
      const meshes = globalThis[globalName]?.engine?.meshes;
      return meshes?.keys && Array.from(meshes.keys()).length > 0;
    }, runtimeName);
    await mark('first-chunk-meshed');

    const before = await page.evaluate(
      (globalName) => Array.from(globalThis[globalName].session.body.pos),
      runtimeName,
    );
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      ({ globalName, initial }) => {
        const position = globalThis[globalName]?.session?.body?.pos;
        return position && Math.hypot(position[0] - initial[0], position[2] - initial[2]) > 0.05;
      },
      { globalName: runtimeName, initial: before },
    );
    await page.keyboard.up('KeyW');
    await mark('walking');
  } finally {
    await page.close();
  }
}
