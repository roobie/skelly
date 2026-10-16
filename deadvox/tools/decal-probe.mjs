// biome-ignore-all lint/correctness/noNodejsModules: hardware diagnostic writes evidence supplied by its caller
// biome-ignore-all lint/suspicious/noConsole: CLI evidence
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports Chromium from playwright-core at runtime
import { chromium } from 'playwright';

const [headUrl, output, baselineUrl, mode] = process.argv.slice(2);
if (!(headUrl && output && baselineUrl)) {
  throw new Error(
    'usage: node tools/decal-probe.mjs <head-url-with-pose> <output-directory> <main-url-with-same-pose>',
  );
}
await mkdir(output, { recursive: true });
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

const installTiming = () => {
  const raf = globalThis.requestAnimationFrame.bind(globalThis);
  const timing = { active: false, cpu: [], gpu: [], frames: [], draws: [], disjoint: 0 };
  globalThis.decalProbe = timing;
  let gl;
  let extension;
  let previous;
  let draws = 0;
  const pending = [];
  globalThis.requestAnimationFrame = (callback) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: query lifetime must bracket the same frame callback as draw counting
    raf((timestamp) => {
      if (!gl) {
        gl = document.querySelector('#view canvas')?.getContext('webgl2');
        extension = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
        if (gl) {
          for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
            const original = gl[name].bind(gl);
            gl[name] = (...args) => {
              draws += 1;
              return original(...args);
            };
          }
        }
      }
      if (gl && extension) {
        const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
        if (disjoint) {
          timing.disjoint += 1;
        }
        for (let i = pending.length - 1; i >= 0; i--) {
          const row = pending[i];
          if (gl.getQueryParameter(row.query, gl.QUERY_RESULT_AVAILABLE)) {
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
      if (query) {
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
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    await page.addInitScript(installTiming);
    const url = new URL(variant === 'main' ? baselineUrl : headUrl);
    url.searchParams.set('freeze', '1');
    if (variant === 'off') {
      url.searchParams.set('decals', '0');
    }
    await page.goto(url.href);
    await page.getByRole('button', { name: 'New world', exact: true }).click({ timeout: 90_000 });
    await page.waitForFunction(
      () => document.querySelector('#world-loading')?.dataset.state === 'ready',
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
      const gl = document.querySelector('#view canvas').getContext('webgl2');
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
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
      const t = globalThis.decalProbe;
      t.cpu = [];
      t.gpu = [];
      t.frames = [];
      t.draws = [];
      t.active = true;
    });
    await page.waitForFunction(() => globalThis.decalProbe.cpu.length >= 600, {}, { timeout: 90_000 });
    await page.evaluate(() => {
      globalThis.decalProbe.active = false;
    });
    await page.waitForTimeout(500);
    const timing = await page.evaluate(() => globalThis.decalProbe);
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
