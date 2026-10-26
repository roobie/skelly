// biome-ignore-all lint/correctness/noNodejsModules: standalone measurement driver for the throwaway wall-leeway spike
// biome-ignore-all lint/performance/noAwaitInLoops: one page at a time keeps the samples from competing for the CPU
// biome-ignore-all lint/suspicious/noConsole: the driver's output is its report
// biome-ignore-all lint/style/noProcessEnv: frame count and render mode are run options
// Wall-leeway spike cost at its bookmarks: the spike's own per-detector readout with `wall=` on, and the game's
// per-frame CPU work with `wall=` on and off in the same scene and build. Headless Chromium only.
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { percentile } from '../src/bench/stats.ts';
import { launchChromium } from '../test/browser/chromium.mjs';
import { browserStageUrl } from '../test/browser/stage-mode.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const FRAMES = Number(process.env.WALL_COST_FRAMES ?? 600);
const SETTLE_MS = 5000;
const STAGE = 'render-probe';
const renderMode = process.env.WALL_COST_RENDER ?? 'pixel';

const SAMPLES = [
  ['door normal', 'gauntlet', '16.50,23.50,14.30,0.0,0.0,0'],
  ['door oblique', 'gauntlet', '17.20,23.50,14.10,35.0,0.0,0'],
  ['table above', 'gauntlet', '13.50,23.50,-6.30,0.0,-20.0,0'],
  ['table below edge', 'gauntlet', '13.50,23.50,-6.40,0.0,-60.0,0'],
  ['table beside leg', 'gauntlet', '12.61,23.50,-6.50,0.0,-60.0,0'],
  ['garage shelves', 'testHouse', '-13.00,21.00,-9.90,0.0,4.0,0'],
  ['brick wall control', 'testHouse', '-20.60,21.00,-10.00,90.0,0.0,0'],
  ['terrace edging control', 'testHouse', '5.00,24.50,-2.00,90.0,-55.0,0'],
  ['worst: pressed into brick', 'testHouse', `${process.env.WALL_COST_WORST ?? '-20.85'},21.00,-10.00,90.0,0.0,0`],
];

const frameWork = {
  name: 'wall-spike-cost-frame-work',
  enforce: 'pre',
  transform(code, id) {
    const marker = 'frameWork.record(now, realNow() - workStart);';
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    if (!code.includes(marker)) {
      throw new Error('frame work anchor missing in play.ts');
    }
    return code.replace(marker, `${marker}\n    globalThis.wallCostFrames?.push(realNow() - workStart);`);
  },
};

const stats = (values) => ({ p50: percentile(values, 0.5), p95: percentile(values, 0.95), frames: values.length });

const vite = await createServer({
  root: projectRoot,
  configFile: resolve(projectRoot, 'vite.config.ts'),
  logLevel: 'error',
  plugins: [frameWork],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  const { port } = vite.httpServer.address();
  browser = await launchChromium(STAGE, { headless: true, renderMode });
  const measure = async (site, cam, wall) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const query = `debug=1&site=${site}&seed=1&loadout=hunting&time=12%3A00&fog=0&freeze=1&cam=${cam}${wall ? '&wall=refined' : ''}`;
    await page.goto(browserStageUrl(STAGE, `http://127.0.0.1:${port}/?${query}`, renderMode), {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
      timeout: 120_000,
    });
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
      null,
      { timeout: 180_000 },
    );
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => {
      globalThis.wallCostFrames = [];
    });
    const started = Date.now();
    await page.waitForFunction((frames) => globalThis.wallCostFrames.length >= frames, FRAMES, {
      timeout: 600_000,
      polling: 500,
    });
    const elapsed = (Date.now() - started) / 1000;
    const work = await page.evaluate(() => globalThis.wallCostFrames.slice());
    const spike = wall
      ? await page.evaluate(() => {
          const readout = document.querySelector('.debug-wall-readout');
          return { cost: JSON.parse(readout?.dataset.wallCost ?? 'null'), text: readout?.textContent ?? '' };
        })
      : undefined;
    await page.close();
    return { work: stats(work), fps: work.length / elapsed, spike, errors };
  };
  const only = process.env.WALL_COST_ONLY;
  for (const [name, site, cam] of SAMPLES.filter(([label]) => !only || label.startsWith(only))) {
    const on = await measure(site, cam, true);
    const off = await measure(site, cam, false);
    console.log(JSON.stringify({ name, site, cam, on, off }));
  }
  console.log(JSON.stringify({ renderMode, frames: FRAMES, userAgent: await browser.version() }));
} finally {
  await browser?.close();
  await vite.close();
}
