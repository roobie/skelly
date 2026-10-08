import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { browserStageUrl } from './stage-mode.mjs';

const observePage = (globalName) => {
  const marks = {};
  const mark = (name) => {
    marks[name] ??= performance.now();
  };
  const markWhenReady = (name, ready) => {
    if (!marks[name] && ready) {
      mark(name);
    }
  };
  globalThis.freshPlayerTraceMarks = marks;
  document.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('#go')) {
        mark('goClick');
      }
    },
    true,
  );
  let locked = null;
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    get: () => locked,
  });
  Element.prototype.requestPointerLock = function () {
    mark('pointerLockRequested');
    locked = this;
    mark('pointerLockGranted');
    document.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  };
  document.exitPointerLock = () => {
    locked = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  const sampleRuntime = () => {
    const runtime = globalThis[globalName];
    if (!runtime) {
      return;
    }
    mark('playRuntimeCreated');
    const position = runtime.session.body.pos;
    markWhenReady('spawnColumnsReady', runtime.streamer.isReady(position[0], position[2]));
    markWhenReady('firstMesh', Array.from(runtime.engine.meshes.keys()).length > 0);
    const progress = document.querySelector('#startup-hint-progress');
    markWhenReady('spawnColumnsMeshed', progress && progress.value === progress.max);
    markWhenReady('firstRenderedFrame', runtime.engine.renderer?.info.render.frame > 0);
    const start = marks.playerStart;
    markWhenReady('walking', start && Math.hypot(position[0] - start[0], position[2] - start[2]) > 0.05);
    marks.playerStart ??= Array.from(position);
  };
  const sample = () => {
    sampleRuntime();
    if (!marks.walking) {
      requestAnimationFrame(sample);
    }
  };
  requestAnimationFrame(sample);
};

export async function traceFreshPlayer({ browser, stage, url, browserName, runtimeName, renderMode }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const started = performance.now();
  const mark = async (stageName) => {
    const state = await page.evaluate((globalName) => {
      const runtime = globalThis[globalName];
      const button = document.querySelector('#go');
      const overlay = document.querySelector('#overlay');
      const position = runtime ? Array.from(runtime.session.body.pos) : null;
      const [navigation] = performance.getEntriesByType('navigation');
      return {
        events: { ...globalThis.freshPlayerTraceMarks },
        readyState: document.readyState,
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
        loadEventMs: navigation?.loadEventEnd ?? null,
        goEnabled: button?.getAttribute('aria-disabled') === 'false',
        overlayHidden: overlay?.hidden ?? null,
        saveStatus: document.querySelector('#save-status')?.textContent?.trim() ?? null,
        player: position,
        spawnReady: runtime ? runtime.streamer.isReady(position[0], position[2]) : null,
        meshes: runtime ? Array.from(runtime.engine.meshes.keys()).length : null,
        startupHintHidden: document.querySelector('#startup-hint')?.hidden ?? null,
        startupProgress: (() => {
          const progress = document.querySelector('#startup-hint-progress');
          return progress ? { value: progress.value, max: progress.max } : null;
        })(),
      };
    }, runtimeName);
    process.stdout.write(
      `FRESH_PLAYER_TRACE ${JSON.stringify({
        browser: browserName,
        stage: stageName,
        elapsedMs: Math.round(performance.now() - started),
        ...state,
      })}\n`,
    );
  };

  await page.addInitScript(observePage, runtimeName);
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
    await page.waitForFunction((globalName) => {
      const runtime = globalThis[globalName];
      const hint = document.querySelector('#startup-hint');
      const progress = document.querySelector('#startup-hint-progress');
      return (
        runtime &&
        hint &&
        !hint.hidden &&
        progress &&
        progress.value < progress.max &&
        Array.from(runtime.engine.meshes.keys()).length === 0
      );
    }, runtimeName);
    await mark('pointer-lock-and-play-entry');

    await page.waitForFunction((globalName) => {
      const runtime = globalThis[globalName];
      const position = runtime?.session?.body?.pos;
      return position && runtime.streamer.isReady(position[0], position[2]);
    }, runtimeName);
    await page.waitForFunction((globalName) => {
      const meshes = globalThis[globalName]?.engine?.meshes;
      return meshes?.keys && Array.from(meshes.keys()).length > 0;
    }, runtimeName);
    await mark('first-chunk-meshed');
    await page.waitForFunction(() => {
      const hint = document.querySelector('#startup-hint');
      const progress = document.querySelector('#startup-hint-progress');
      return hint?.hidden && progress && progress.value === progress.max;
    });
    await mark('spawn-columns-meshed');

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
