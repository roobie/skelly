// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone cross-runtime browser contract
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';
import { createStageServer } from './stageServer.mjs';

const { firefox } = await import('playwright');

const root = fileURLToPath(new URL('../..', import.meta.url));
const vite = await createStageServer({
  configFile: false,
  root,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 0 },
});
const artifacts = new URL('../../test-results/vehicle-rapier/', import.meta.url);
const repeats = 2;
const summary = { node: process.version, repeats, runs: [], divergence: null, counts: {} };
let baseline;
const compare = async ({ runtime, version, repeat, encoded, counts }) => {
  assert.ok(encoded.length > 0, 'Replay must not be empty');
  assert.ok(counts.rayHits > 0, `${runtime}: no ray hits`);
  assert.ok(counts.rayMisses > 0, `${runtime}: no ray misses`);
  assert.ok(counts.rapierFloats > 0, `${runtime}: no Rapier float answers`);
  assert.ok(counts.contactFrames > 0, `${runtime}: the sliding body never contacted the panel`);
  await writeFile(
    new URL(`${runtime}-${repeat}.json`, artifacts),
    JSON.stringify({ runtime, version, repeat, encoded, counts }),
  );
  baseline ??= encoded;
  const index = baseline.findIndex((entry, i) => entry.path !== encoded[i]?.path || entry.value !== encoded[i]?.value);
  const lengthDifference = baseline.length === encoded.length ? -1 : baseline.length;
  const difference = index >= 0 ? index : lengthDifference;
  if (difference >= 0) {
    summary.divergence = {
      runtime,
      version,
      repeat,
      index: difference,
      reference: baseline[difference] ?? null,
      actual: encoded[difference] ?? null,
    };
  }
  summary.runs.push({ runtime, version, repeat, values: encoded.length });
  summary.counts[`${runtime}-${repeat}`] = counts;
  await writeFile(new URL('summary.json', artifacts), JSON.stringify(summary, null, 2));
  assert.equal(summary.divergence, null, `NO-GO: first divergence ${JSON.stringify(summary.divergence)}`);
};
try {
  await vite.listen();
  await mkdir(artifacts, { recursive: true });
  // Node runs the fixture through the same Vite server transform, reading the vendored bytes from the file.
  const fixture = await vite.ssrLoadModule('/test/fixtures/vehicleRapierReplay.ts');
  const wasm = new Uint8Array(
    await readFile(new URL('../../vendor/rapier-f64/rapier_wasm3d_bg.wasm', import.meta.url)),
  );
  await fixture.initializeVehicleReplay(wasm);
  const countsOf = (replay) => ({
    rayHits: replay.rayHits,
    rayMisses: replay.rayMisses,
    rapierFloats: replay.rapierFloats,
    contactFrames: replay.contactFrames,
    rapierWasmSha256: createHash('sha256').update(wasm).digest('hex'),
  });
  for (let repeat = 0; repeat < repeats; repeat++) {
    const replay = fixture.replayPanelQueries();
    // biome-ignore lint/performance/noAwaitInLoops: serialize repeats and retain diagnostics before a possible disagreement
    await compare({
      runtime: 'node',
      version: process.version,
      repeat,
      encoded: fixture.encodeReplay(replay),
      counts: countsOf(replay),
    });
  }
  const address = vite.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const engines = { chromium: () => launchChromium('vehicle-rapier'), firefox: () => firefox.launch() };
  for (const [runtime, launch] of Object.entries(engines)) {
    // biome-ignore lint/performance/noAwaitInLoops: browsers must not compete, and the first disagreement stops the gate
    const browser = await launch();
    try {
      for (let repeat = 0; repeat < repeats; repeat++) {
        // biome-ignore lint/performance/noAwaitInLoops: a fresh page gives each repeat a separate module/WASM instance
        const page = await browser.newPage();
        try {
          await page.goto(`http://127.0.0.1:${address.port}/test/browser/vehicle-rapier.html`);
          const run = await page.evaluate(async () => {
            // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this browser-root TypeScript fixture URL
            const module = await import('/test/fixtures/vehicleRapierReplay.ts');
            // No bytes in a browser: the seam loads the WASM from the served asset URL.
            await module.initializeVehicleReplay();
            const replay = module.replayPanelQueries();
            return {
              encoded: module.encodeReplay(replay),
              counts: {
                rayHits: replay.rayHits,
                rayMisses: replay.rayMisses,
                rapierFloats: replay.rapierFloats,
                contactFrames: replay.contactFrames,
              },
            };
          });
          await compare({ runtime, version: browser.version(), repeat, encoded: run.encoded, counts: run.counts });
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  process.stdout.write(`GO ${JSON.stringify(summary)}\n`);
} catch (error) {
  await writeFile(new URL('failure.txt', artifacts), String(error));
  throw error;
} finally {
  await vite.close();
}
