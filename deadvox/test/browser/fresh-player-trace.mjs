import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { browserStageUrl } from './stage-mode.mjs';

const observePage = (globalName) => {
  const marks = {};
  const mark = (name) => {
    marks[name] ??= performance.now();
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
  const sample = () => {
    const runtime = globalThis[globalName];
    if (runtime) {
      mark('playRuntimeCreated');
      const position = runtime.session.body.pos;
      if (runtime.streamer.isReady(position[0], position[2])) {
        mark('spawnColumnsReady');
      }
      if (Array.from(runtime.engine.meshes.keys()).length > 0) {
        mark('firstMesh');
      }
      if (runtime.engine.renderer?.info.render.frame > 0) {
        mark('firstRenderedFrame');
      }
      const start = marks.playerStart;
      if (start && Math.hypot(position[0] - start[0], position[2] - start[2]) > 0.05) {
        mark('walking');
      }
      marks.playerStart ??= Array.from(position);
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

async function sampleView(page) {
  const screenshot = await page.locator('#view').screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sampled = 0;
    let nonDark = 0;
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 4 * 16) {
      const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
      sampled += 1;
      if (luminance > 20) {
        nonDark += 1;
      }
      if (luminance > 32) {
        visible += 1;
      }
    }
    return {
      pixels: sampled,
      nonDarkFraction: Number((nonDark / sampled).toFixed(3)),
      visibleFraction: Number((visible / sampled).toFixed(3)),
    };
  }, screenshot.toString('base64'));
}

export async function traceFreshPlayer({ browser, stage, url, browserName, runtimeName, renderMode }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const started = performance.now();
  const mark = async (stageName, takeViewSample = false) => {
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
      };
    }, runtimeName);
    const view = takeViewSample ? await sampleView(page) : null;
    process.stdout.write(
      `FRESH_PLAYER_TRACE ${JSON.stringify({
        browser: browserName,
        stage: stageName,
        elapsedMs: Math.round(performance.now() - started),
        ...state,
        view,
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
    await mark('pointer-lock-and-play-entry', true);

    await page.waitForFunction((globalName) => {
      const runtime = globalThis[globalName];
      const position = runtime?.session?.body?.pos;
      return position && runtime.streamer.isReady(position[0], position[2]);
    }, runtimeName);
    await page.waitForFunction((globalName) => {
      const meshes = globalThis[globalName]?.engine?.meshes;
      return meshes?.keys && Array.from(meshes.keys()).length > 0;
    }, runtimeName);
    await mark('first-chunk-meshed', true);

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
