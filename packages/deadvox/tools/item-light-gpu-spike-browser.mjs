import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStageServer } from '../test/browser/stageServer.mjs';
import { launchChromium } from '../test/browser/chromium.mjs';
import { gameUrl } from '../test/browser/gameUrl.mjs';

if (!process.argv.includes('--gpuReachSpike')) {
  throw new Error('Pass --gpuReachSpike to enable this throwaway prototype');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.SPIKE_OUT;
if (!out) {
  throw new Error('Set SPIKE_OUT to an existing output directory');
}
const run = process.env.SPIKE_RUN ?? '1';
const modes = (process.env.MODES ?? 'hard,smooth,penumbra,both').split(',');
const once = (code, match, replacement) => {
  if (code.split(match).length !== 2) {
    throw new Error(`Missing spike instrumentation: ${match}`);
  }
  return code.replace(match, replacement);
};
const server = await createStageServer({
  root,
  configFile: `${root}/vite.config.ts`,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'gpu-reach-spike-only',
    enforce: 'pre',
    transform(original, id) {
      let code = original;
      if (id.endsWith('/src/core/lampReach.ts')) {
        code = once(code, 'entry.reach = this.build(entry);', `const spikeStart=performance.now();entry.reach = this.build(entry);
          if(globalThis.gpuSpikeEnabled)(globalThis.gpuSpikeCpu??=[]).push({ms:performance.now()-spikeStart,source:entry.light.pos,size:entry.reach.size});`);
      }
      if (id.endsWith('/src/render/fixtureReach.ts')) {
        code = once(code, '      const reach = this.cache.reachOf(lamp, !rebuilt);', `      const reach = this.cache.reachOf(lamp, globalThis.gpuSpikeMode==='gpu'?false:!rebuilt);
        if(globalThis.gpuSpikeEnabled&&lamp.reachSource)globalThis.gpuSpikeDemand(lamp);`);
      }
      if (id.endsWith('/src/render/playView.ts')) {
        code = once(code, '      fixtureReach?.update(lightPool.reachSlots);', '      globalThis.gpuSpikeCache=lampReach;globalThis.gpuSpikePool=lightPool;fixtureReach?.update(lightPool.reachSlots);');
      }
      if (id.endsWith('/src/presentation/engine.ts')) {
        code = `import {install as installSpikePerf} from '${root}/tools/perf-baseline-browser.mjs';\n${once(code, '  const resize = () => {', '  if(renderer)installSpikePerf({renderer,scene,camera,meshes,shadows:drawing.shadows});\n  const resize = () => {')}`;
      }
      if (id.endsWith('/src/presentation/play.ts')) {
        code = once(code, '  startRealFrames(frame);', '  globalThis.perfBaseline.attach({engine,session,input,view,worldLoading,debug:debugTools,actorStore,body});startRealFrames((now)=>globalThis.perfBaseline.frame(frame,now));');
      }
      return code === original ? undefined : code;
    },
  }],
});
let browser;
const errors = [];
try {
  await server.listen();
  browser = await launchChromium('render-probe', { headless: false, args: ['--use-gl=angle', '--use-angle=gl'] });
  // Alternating fresh pages prevent one implementation from always receiving the colder host.
  for (const mode of modes) {
    for (const backend of run === '1' ? ['cpu', 'gpu'] : ['gpu', 'cpu']) {
      const page = await browser.newPage({ viewport: { width: 920, height: 740 } });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') {
          errors.push(m.text());
        }
      });
      const base = `http://127.0.0.1:${server.httpServer.address().port}`;
      await page.goto(gameUrl(base, {
        startMod: 'skelly.deadvox.scenario.test-house.item-vehicle-light-look',
        hash: { debug: true, seed: 1, radius: 32, cam: [-17.5, 21, -2.8, 20, -25, 0], freeze: true, shadowBlend: mode },
      }), { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', undefined, { timeout: 120000 });
      await page.locator('#go').click();
      await page.waitForFunction(() => globalThis.perfBaseline?.worldLoading?.ready, undefined, { timeout: 180000 });
      await page.waitForFunction(() => globalThis.perfBaseline.engine.meshes.origins().some(([x, y, z]) => x === -64 && y === 32 && z === -32), undefined, { timeout: 120000 });
      const resume = page.getByRole('button', { name: 'Continue', exact: true });
      if (await resume.isVisible()) {
        await resume.click();
      }
      const settle = (n) => page.evaluate((n) => new Promise((resolve) => {
        let i = 0;
        function tick() {
          if (++i >= n) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }), n);
      await page.evaluate(() => {
        const p = globalThis.perfBaseline;
        p.engine.mood.externalGpuTiming = true;
        p.engine.mood.setRenderScale(1);
        globalThis.gpuSpikeInitialYaw = p.input.controls.yaw;
        let frame = 0;
        p.enabled = true;
        p.mode = 'off';
        p.before = () => { p.input.controls.yaw = globalThis.gpuSpikeInitialYaw + Math.sin(++frame / 35); };
      });
      await settle(180);
      await page.evaluate(() => {
        const p = globalThis.perfBaseline;
        p.before = undefined;
        p.enabled = false;
        p.input.controls.yaw = globalThis.gpuSpikeInitialYaw;
      });
      await settle(30);
      const identity = await page.evaluate(() => ({ ...globalThis.perfBaseline.identity, body: [...globalThis.perfBaseline.body.pos] }));
      if (/swiftshader|llvmpipe/i.test(identity.renderer)) throw new Error('Software GPU');
      const capability = await page.evaluate(async (url) => {
        const { createItemLightGpuSpike } = await import(url);
        globalThis.gpuReachSpike = createItemLightGpuSpike({ gpuReachSpike: true });
        return globalThis.gpuReachSpike.identity;
      }, `${base}/tools/item-light-gpu-spike.mjs`);
      // Warm shader and resources outside the measured movement windows, then perform equality/readback checks.
      const warm = await page.evaluate(async () => {
        const cache = globalThis.gpuSpikeCache;
        const light = globalThis.gpuSpikePool.reachSlots.find((l) => l?.reachSource);
        const run = (blockingRead) => globalThis.gpuReachSpike.build({ light, tuning: cache.tuning, blockSize: cache.blockSize, penumbra: cache.penumbra, isBlocking: cache.isBlocking, blockingRead });
        const asyncResult = await run(false).done;
        const blockingResult = await run(true).done;
        const expected = cache.build({ light: { ...light, pos: asyncResult.result.source }, revision: 1 });
        const compare = (cells) => {
          let mismatches = 0, maxDifference = 0;
          const examples = [];
          cells.forEach((v, i) => { const difference = Math.abs(v - expected.cells[i]); if (difference) { mismatches++; maxDifference = Math.max(maxDifference, difference); if (examples.length < 8) examples.push({ index: i, cpu: expected.cells[i], gpu: v }); } });
          return { mismatches, maxDifference, cells: cells.length, examples };
        };
        return { asynchronous: { ...asyncResult.result, equality: compare(asyncResult.cells) }, blocking: { ...blockingResult.result, equality: compare(blockingResult.cells) } };
      });
      const routes = {};
      for (const route of ['turn', 'walk']) {
        await page.evaluate(({ backend, route }) => {
          const p = globalThis.perfBaseline, cache = globalThis.gpuSpikeCache;
          const key = (light) => light.pos.map((v) => Math.floor(v / cache.tuning.cellBlocks)).join(',');
          const seen = new Set(globalThis.gpuSpikePool.reachSlots.filter((l) => l?.reachSource).map(key));
          globalThis.gpuSpikeJobs = [];
          globalThis.gpuSpikeCpu = [];
          globalThis.gpuSpikeMode = backend;
          globalThis.gpuSpikeEnabled = true;
          globalThis.gpuSpikeDemand = (light) => {
            if (backend !== 'gpu' || seen.has(key(light))) return;
            seen.add(key(light));
            const held = { ...light, pos: [...light.pos] };
            const job = globalThis.gpuReachSpike.build({ light: held, tuning: cache.tuning, blockSize: cache.blockSize, penumbra: cache.penumbra, isBlocking: cache.isBlocking });
            globalThis.gpuSpikeJobs.push({ light: held, job });
          };
          const yaw = p.input.controls.yaw, body = [...p.body.pos];
          let frame = 0;
          p.records = [];
          p.enabled = true;
          p.mode = 'off';
          p.phase = route;
          p.before = () => {
            frame++;
            if (route === 'turn') p.input.controls.yaw = yaw + Math.sin(frame / 35);
            else p.body.pos[0] = body[0] + Math.min(frame / 120, 1) * 3;
          };
        }, { backend, route });
        await settle(125);
        const records = await page.evaluate(() => {
          const p = globalThis.perfBaseline;
          p.before = undefined;
          p.enabled = false;
          globalThis.gpuSpikeEnabled = false;
          return p.records;
        });
        const builds = await page.evaluate(async () => {
          const cache = globalThis.gpuSpikeCache;
          const results = [];
          for (const { light, job } of globalThis.gpuSpikeJobs) {
            const { result, cells } = await job.done;
            const start = performance.now();
            const expected = cache.build({ light: { ...light, pos: result.source }, revision: 1 });
            const referenceMs = performance.now() - start;
            let mismatches = 0, maxDifference = 0;
            const examples = [];
            cells.forEach((v, i) => { const difference = Math.abs(v - expected.cells[i]); if (difference) { mismatches++; maxDifference = Math.max(maxDifference, difference); if (examples.length < 8) examples.push({ index: i, cpu: expected.cells[i], gpu: v }); } });
            results.push({ ...result, referenceMs, mismatches, maxDifference, cells: cells.length, examples });
          }
          return { gpu: results, cpu: globalThis.gpuSpikeCpu };
        });
        routes[route] = { records, builds };
      }
      const result = { mode, backend, run, identity, capability, warm, routes, errors };
      await writeFile(`${out}/${backend}-${run}-${mode}.json`, JSON.stringify(result));
      console.log(JSON.stringify({ mode, backend, run, capability, warm, routes: Object.fromEntries(Object.entries(routes).map(([key, d]) => {
        const frames = d.records.slice(1).map((r, i) => r.now - d.records[i].now);
        return [key, { worst: Math.max(...frames), over50: frames.filter((ms) => ms > 50).length, builds: d.builds }];
      })), errors }));
      await page.evaluate(() => globalThis.gpuReachSpike.dispose());
      await page.close();
      if (errors.length) throw new Error(errors.join('\n'));
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
