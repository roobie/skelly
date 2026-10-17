import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { watchPageErrors } from './perf-baseline-page.mjs';
import { rankProfile, summarize } from './perf-baseline-stats.mjs';

const { chromium } = await import('playwright');
const leadingSlash = /^\//;
const softwareRenderer = /swiftshader|llvmpipe|software|lavapipe/i;

async function captureLook(page, directory, { route, mode, repeat }) {
  if (mode !== 'whole' || repeat !== 1) {
    return;
  }
  const look = await page.evaluate(() => {
    const perf = globalThis.perfBaseline;
    const { mood, renderer, config } = perf.engine;
    const settled = mood.renderScale;
    const seed = mood.frame;
    const url = new URL(location.href);
    url.searchParams.delete('skyRoute');
    url.searchParams.set('freeze', '1');
    url.searchParams.set(
      'cam',
      [
        ...perf.session.body.pos.map((value) => value * config.scale.blockSize),
        (perf.input.yaw * 180) / Math.PI,
        (perf.input.pitch * 180) / Math.PI,
        0,
      ].join(','),
    );
    const images = [mood.graphicsTuning.renderScale.max, settled].map((scale) => {
      mood.setRenderScale(scale);
      mood.frame = seed;
      perf.view.render();
      url.searchParams.set('renderscale', String(scale));
      return { scale, url: url.pathname + url.search, png: renderer.domElement.toDataURL('image/png').split(',')[1] };
    });
    return { images, position: perf.engine.camera.position.toArray() };
  });
  for (const [index, image] of look.images.entries()) {
    const path = `${route.id}-look-${index === 0 ? 'full' : 'settled'}.png`;
    await writeFile(resolve(directory, path), Buffer.from(image.png, 'base64'));
    image.png = undefined;
    image.path = path;
  }
  await writeFile(resolve(directory, `${route.id}-look.json`), JSON.stringify(look, null, 2));
}

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const at = arg.indexOf('=');
    if (!arg.startsWith('--') || at < 0) {
      throw new Error('Use --root=deadvox --out=PATH [--route=ID] [--config=PATH] [--executable=PATH]');
    }
    return [arg.slice(2, at), arg.slice(at + 1)];
  }),
);
const root = resolve(options.root ?? fileURLToPath(new URL('..', import.meta.url)));
if (!options.out) {
  throw new Error('--out is required; keep machine evidence outside tracked files');
}
const out = resolve(options.out);
await mkdir(out, { recursive: true });
const config = JSON.parse(await readFile(options.config ?? resolve(root, 'src/config/perf-baseline.json'), 'utf8'));
const routes = config.routes.filter((route) => !options.route || route.id === options.route);
if (routes.length === 0) {
  throw new Error('No matching routes');
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
const runtime = fileURLToPath(new URL('./perf-baseline-browser.mjs', import.meta.url));
function once(code, match, replacement) {
  if (code.split(match).length !== 2) {
    throw new Error(`Instrumentation boundary changed: ${match}`);
  }
  return code.replace(match, replacement);
}
await build({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'warn',
  build: { minify: false, sourcemap: false },
  plugins: [
    {
      name: 'perf-baseline',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/src/game/engine.ts')) {
          return `import { install as installPerfBaseline } from ${JSON.stringify(runtime)};\n${once(code, '  const resize = () => {', '  if (renderer) installPerfBaseline({ renderer, scene, camera, meshes, shadows });\n  const resize = () => {')}`;
        }
        if (id.endsWith('/src/render/mood.ts')) {
          return once(
            code,
            '    this.composer = composer;',
            '    this.composer = composer;\n    globalThis.perfBaseline.wrapPasses(composer);',
          );
        }
        if (id.endsWith('/src/game/play.ts')) {
          return once(
            code,
            '  startRealFrames(frame);',
            '  globalThis.perfBaseline.attach({ engine, session, input, view, worldLoading, debug: debugTools, zombieStore });\n  startRealFrames((now) => globalThis.perfBaseline.frame(frame, now));',
          );
        }
        if (id.endsWith('/src/debug/skyRoute.ts')) {
          return once(
            once(
              code,
              'startedRealMs === undefined && active() && inputPermitsRoute()',
              'startedRealMs === undefined && active() && inputPermitsRoute() && globalThis.perfBaseline.skyReady?.()',
            ),
            '      frames.push({',
            '      if (globalThis.perfBaseline.current) globalThis.perfBaseline.current.phase = phase;\n      frames.push({',
          );
        }
      },
    },
  ],
});
const server = await preview({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  preview: { host: '127.0.0.1', port: 0, open: false },
});
const [origin] = server.resolvedUrls.local;
let browser;
const result = {
  schemaVersion: 1,
  complete: false,
  revision,
  sourceStatus,
  config,
  chromium: null,
  runs: [],
  profiles: [],
  method:
    'Production unminified measurement build; whole and segmented GPU queries in separate interleaved runs; CPU submission surrounds game frame only; intervals include browser work. CPU profiles are separate, without GPU queries. Pass whole-frame value is the sum of non-overlapping segments. No synchronous GPU readback.',
};
try {
  await writeFile(resolve(out, 'baseline.json'), JSON.stringify(result, null, 2));
  browser = await chromium.launch({
    channel: 'chromium',
    headless: false,
    ...(options.executable ? { executablePath: options.executable } : {}),
    args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'],
  });
  result.chromium = browser.version();
  async function run(route, mode, repeat) {
    console.info(`START ${repeat} ${route.id} ${mode}`);
    const page = await browser.newPage({ viewport: config.viewport, deviceScaleFactor: config.deviceScaleFactor });
    const errors = [];
    let rejectPage;
    const pageFailed = new Promise((_, reject) => {
      rejectPage = reject;
    });
    pageFailed.catch(() => undefined);
    watchPageErrors(page, (error) => {
      errors.push(String(error));
      rejectPage(error);
    });
    const waitFor = (...args) => Promise.race([page.waitForFunction(...args), pageFailed]);
    await page.addInitScript((count) => {
      globalThis.addEventListener('mousemove', (event) => event.stopImmediatePropagation(), true);
      if (count) {
        localStorage.setItem('deadvox.shambler-spawn-count', String(count));
      }
    }, route.spawnCount);
    let cdp;
    try {
      await page.goto(new URL(route.path.replace(leadingSlash, ''), origin).href);
      await waitFor(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
        timeout: config.timeoutMs,
      });
      await page.locator('#go').click();
      await waitFor(() => globalThis.perfBaseline?.worldLoading?.ready, null, {
        timeout: config.timeoutMs,
      });
      const identity = await page.evaluate(() => globalThis.perfBaseline.identity);
      if (softwareRenderer.test(identity.renderer)) {
        throw new Error(`Not a real GPU: ${identity.renderer}`);
      }
      await page.evaluate(
        ({ route: workload, mode: queryMode, config: sampling }) => {
          const perf = globalThis.perfBaseline;
          perf.mode = queryMode;
          perf.prepare();
          perf.skyReady = () => perf.enabled && perf.records.length >= sampling.warmFrames;
          perf.debug.handleAction('debug.noclip-toggle');
          if (workload.driver === 'sky') {
            // A stationary prewarm must not let the horde kill the player before route movement starts.
            perf.debug.handleAction('debug.freeze-game');
          }
          if (workload.driver !== 'sky') {
            if (workload.spawnCount) {
              perf.debug.handleAction('debug.spawn-shamblers');
            }
            perf.session.body.pos[1] += (workload.liftMetres ?? 0) / perf.engine.config.scale.blockSize;
          }
          const { yaw } = perf.input;
          let frame = 0;
          perf.resetPath = () => {
            frame = 0;
          };
          perf.before = () => {
            if (workload.driver === 'sky' && perf.debug.frozen && perf.skyReady()) {
              perf.debug.handleAction('debug.freeze-game');
            }
            if (workload.driver === 'orbit') {
              perf.input.yaw =
                yaw +
                ((workload.yawAmplitudeDegrees * Math.PI) / 180) *
                  Math.sin((2 * Math.PI * workload.yawCycles * frame) / sampling.sampleFrames);
              frame += 1;
            }
          };
          perf.enabled = true;
        },
        { route, mode, config },
      );
      if (route.driver === 'sky') {
        await waitFor(() => Boolean(document.querySelector('[data-sky-route] textarea')?.value), null, {
          timeout: config.timeoutMs,
        });
      } else {
        await waitFor((count) => globalThis.perfBaseline.records.length >= count, config.warmFrames, {
          timeout: config.timeoutMs,
        });
        await page.evaluate(() => {
          const perf = globalThis.perfBaseline;
          perf.records = [];
          perf.resetPath();
        });
        if (mode === 'cpu') {
          cdp = await page.context().newCDPSession(page);
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.start');
        }
        await waitFor((count) => globalThis.perfBaseline.records.length >= count, config.sampleFrames, {
          timeout: config.timeoutMs,
        });
      }
      if (cdp) {
        const { profile } = await cdp.send('Profiler.stop');
        const profilePath = `${route.id}-${repeat}.cpuprofile`;
        await writeFile(resolve(out, profilePath), JSON.stringify(profile));
        result.profiles.push({ route: route.id, repeat, path: profilePath, ranking: rankProfile(profile) });
      }
      await page.evaluate(() => {
        globalThis.perfBaseline.enabled = false;
      });
      await waitFor(
        () => {
          globalThis.perfBaseline.poll();
          return globalThis.perfBaseline.pending.length === 0;
        },
        null,
        { timeout: config.queryDrainMs },
      );
      const observation = await page.evaluate(() => {
        const perf = globalThis.perfBaseline;
        return {
          records: perf.records,
          visibility: document.visibilityState,
          position: perf.engine.camera.position.toArray(),
          zombieCount: perf.zombieStore.size,
          drawingBuffer: [perf.engine.renderer.domElement.width, perf.engine.renderer.domElement.height],
          renderScale: perf.engine.mood.renderScale,
          sky: document.querySelector('[data-sky-route] textarea')?.value,
        };
      });
      if (observation.sky) {
        observation.sky = JSON.parse(observation.sky);
      }
      if (observation.visibility !== 'visible' || errors.length > 0) {
        throw new Error(`Invalid run: ${JSON.stringify(errors)}`);
      }
      if (route.driver === 'sky' && observation.sky?.status !== 'complete') {
        throw new Error('Sky route did not complete');
      }
      const records =
        route.driver === 'sky'
          ? observation.records.filter((record) => record.phase === 'warm')
          : observation.records.slice(0, config.sampleFrames);
      const summary = summarize(records, mode);
      if (route.spawnCount && summary.zombieDrawFrames !== summary.frames) {
        const rejected = `${route.id}-${mode}-${repeat}-rejected`;
        await writeFile(
          resolve(out, `${rejected}.json`),
          JSON.stringify({ route, mode, repeat, identity, errors, ...observation, records, summary }),
        );
        await page.screenshot({ path: resolve(out, `${rejected}.png`) });
        throw new Error('Horde is not drawn');
      }
      await page.screenshot({ path: resolve(out, `${route.id}-${mode}-${repeat}.png`) });
      await captureLook(page, out, { route, mode, repeat });
      const evidence = { route: route.id, mode, repeat, identity, errors, ...observation, records, summary };
      result.runs.push(evidence);
      await writeFile(resolve(out, `${route.id}-${mode}-${repeat}.json`), JSON.stringify(evidence));
      console.info(
        `END ${repeat} ${route.id} ${mode}: GPU ${summary.wholeFrameGpuMs?.p50}, interval ${summary.frameIntervalMs.p50}`,
      );
      await writeFile(resolve(out, 'baseline.json'), JSON.stringify(result, null, 2));
    } finally {
      await page.close();
    }
  }
  for (let repeat = 1; repeat <= config.repeats; repeat++) {
    const schedule = routes.flatMap((route) => config.modes.map((mode) => ({ route, mode })));
    if (repeat % 2 === 0) {
      schedule.reverse();
    }
    for (const { route, mode } of schedule) {
      await run(route, mode, repeat);
    }
  }
  for (const route of routes.filter((workload) => workload.cpuProfile)) {
    await run(route, 'cpu', 1);
  }
  result.complete = true;
  await writeFile(resolve(out, 'baseline.json'), JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await new Promise((done) => server.httpServer.close(done));
}
