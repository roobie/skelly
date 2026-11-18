// biome-ignore-all lint/correctness/noNodejsModules: hardware diagnostic writes evidence supplied by its caller
// biome-ignore-all lint/suspicious/noConsole: CLI evidence
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports Chromium from playwright-core at runtime
import { chromium } from 'playwright';
import { readHash, writeHash } from '../src/hashState.ts';

const [headUrl, output, baselineUrl, mode] = process.argv.slice(2);
if (!(headUrl && output && baselineUrl)) {
  throw new Error(
    'usage: node tools/decal-probe.mjs <head-url-with-pose> <output-directory> <main-url-with-same-pose>',
  );
}
await mkdir(output, { recursive: true });
/** @param {readonly number[]} values */
const summary = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length === 0) {
    throw new Error('No timing samples');
  }
  return {
    samples: sorted.length,
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    median: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
  };
};

/**
 * @typedef {object} DecalTiming
 * @property {boolean} active
 * @property {number[]} cpu
 * @property {number[]} gpu
 * @property {number[]} frames
 * @property {number[]} draws
 * @property {number} disjoint
 */
/**
 * The root program checks this module without the stage page globals, so page callbacks name the one they read.
 * @typedef {typeof globalThis & { decalProbe: DecalTiming }} DecalPage
 */
/**
 * The DOM library does not declare this WebGL2 extension.
 * @typedef {{ readonly TIME_ELAPSED_EXT: GLenum; readonly GPU_DISJOINT_EXT: GLenum }} TimerQueryExtension
 */

const installTiming = () => {
  const raf = globalThis.requestAnimationFrame.bind(globalThis);
  /** @type {DecalTiming} */
  const timing = { active: false, cpu: [], gpu: [], frames: [], draws: [], disjoint: 0 };
  /** @type {DecalPage} */ (globalThis).decalProbe = timing;
  /** @type {WebGL2RenderingContext | null | undefined} */
  let gl;
  /** @type {TimerQueryExtension | null | undefined} */
  let extension;
  /** @type {number | undefined} */
  let previous;
  let draws = 0;
  /** @type {{ query: WebGLQuery; record: boolean }[]} */
  const pending = [];
  /**
   * @template {unknown[]} A
   * @template R
   * @param {(...args: A) => R} draw
   * @returns {(...args: A) => R}
   */
  const counted =
    (draw) =>
    (...args) => {
      draws += 1;
      return draw(...args);
    };
  globalThis.requestAnimationFrame = (callback) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: query lifetime must bracket the same frame callback as draw counting
    raf((timestamp) => {
      if (!gl) {
        const canvas = document.querySelector('#view canvas');
        gl = canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : undefined;
        extension = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
        if (gl) {
          gl.drawElements = counted(gl.drawElements.bind(gl));
          gl.drawArrays = counted(gl.drawArrays.bind(gl));
          gl.drawElementsInstanced = counted(gl.drawElementsInstanced.bind(gl));
          gl.drawArraysInstanced = counted(gl.drawArraysInstanced.bind(gl));
        }
      }
      if (gl && extension) {
        const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
        if (disjoint) {
          timing.disjoint += 1;
        }
        for (let i = pending.length - 1; i >= 0; i--) {
          const row = pending[i];
          if (row !== undefined && gl.getQueryParameter(row.query, gl.QUERY_RESULT_AVAILABLE)) {
            if (!disjoint && row.record) {
              timing.gpu.push(gl.getQueryParameter(row.query, gl.QUERY_RESULT) / 1e6);
            }
            gl.deleteQuery(row.query);
            pending.splice(i, 1);
          }
        }
      }
      let query;
      if (timing.active && gl && extension && !gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
        query = gl.createQuery();
        gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      }
      const start = performance.now();
      const before = draws;
      callback(timestamp);
      const rendered = draws > before;
      if (timing.active && rendered) {
        timing.cpu.push(performance.now() - start);
        timing.draws.push(draws - before);
        if (previous !== undefined) {
          timing.frames.push(timestamp - previous);
        }
        previous = timestamp;
      } else if (!timing.active) {
        previous = undefined;
      }
      if (query && gl && extension) {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        pending.push({ query, record: rendered });
      }
    });
};

const browser = await chromium.launch({ headless: false });
const rows = [];
try {
  for (const [trial, variant] of (mode === 'screens'
    ? ['on', 'off']
    : ['main', 'on', 'on', 'main', 'main', 'on', 'off']
  ).entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: GPU trials must be exclusive, never concurrent
    const context = await browser.newContext({ viewport: { width: 1672, height: 832 }, deviceScaleFactor: 1.5 });
    const page = await context.newPage();
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    await page.addInitScript(installTiming);
    const url = new URL(variant === 'main' ? baselineUrl : headUrl);
    const read = readHash(url.hash);
    url.hash = writeHash({
      ...('hash' in read ? read.hash : {}),
      freeze: true,
      ...(variant === 'off' ? { decals: false } : {}),
    });
    await page.goto(url.href);
    await page.getByRole('button', { name: 'New world', exact: true }).click({ timeout: 90_000 });
    await page.waitForFunction(
      () => {
        const loading = document.querySelector('#world-loading');
        return loading instanceof HTMLElement && loading.dataset.state === 'ready';
      },
      {},
      { timeout: 90_000 },
    );
    // Dirty fringe chunks are intentionally left pending outside the mesh radius; only in-radius holes must drain.
    await page.waitForFunction(
      () => document.querySelector('#debug-readout')?.textContent.includes('· 0 holes'),
      {},
      { timeout: 90_000 },
    );
    await page.waitForTimeout(6000);
    const hardware = await page.evaluate(() => {
      const canvas = document.querySelector('#view canvas');
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('No #view canvas is on the page');
      }
      const gl = canvas.getContext('webgl2');
      if (!gl) {
        throw new Error('The #view canvas has no WebGL2 context');
      }
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      if (!extension) {
        throw new Error('WEBGL_debug_renderer_info is unavailable');
      }
      return {
        renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
        timer: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),
        canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        visibility: document.visibilityState,
      };
    });
    if (!hardware.timer || /llvmpipe|SwiftShader/i.test(hardware.renderer)) {
      throw new Error(`Expected hardware WebGL with timer queries: ${JSON.stringify(hardware)}`);
    }
    if (trial < 2 || variant === 'off') {
      await page.screenshot({ path: join(output, `${variant}.png`) });
    }
    if (mode === 'screens') {
      if (errors.length > 0) {
        throw new Error(JSON.stringify(errors));
      }
      rows.push({ trial, variant, url: url.href, hardware, errors });
      await writeFile(join(output, 'screenshots.json'), JSON.stringify(rows, null, 2));
      await context.close();
      continue;
    }
    await page.evaluate(() => {
      const t = /** @type {DecalPage} */ (globalThis).decalProbe;
      t.cpu = [];
      t.gpu = [];
      t.frames = [];
      t.draws = [];
      t.active = true;
    });
    await page.waitForFunction(
      () => /** @type {DecalPage} */ (globalThis).decalProbe.cpu.length >= 600,
      {},
      { timeout: 90_000 },
    );
    await page.evaluate(() => {
      /** @type {DecalPage} */ (globalThis).decalProbe.active = false;
    });
    await page.waitForTimeout(500);
    const timing = await page.evaluate(() => /** @type {DecalPage} */ (globalThis).decalProbe);
    if (errors.length > 0 || timing.disjoint > 0) {
      throw new Error(JSON.stringify({ errors, disjoint: timing.disjoint }));
    }
    const row = {
      trial,
      variant,
      url: url.href,
      hardware,
      errors,
      disjoint: timing.disjoint,
      cpu: summary(timing.cpu),
      gpu: summary(timing.gpu),
      frames: summary(timing.frames),
      draws: summary(timing.draws),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
    await writeFile(join(output, 'timings.json'), JSON.stringify(rows, null, 2));
    await context.close();
  }
} finally {
  await browser.close();
}
