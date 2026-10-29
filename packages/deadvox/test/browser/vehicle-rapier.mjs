// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone cross-runtime browser contract
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium, loadPlaywright } from './chromium.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = new URL('../../test-results/vehicle-rapier/', import.meta.url);
const vite = await createServer({
  configFile: false,
  root,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 0 },
});
const repeats = 2;
const summary = { node: process.version, repeats, runs: [], divergence: null, rapierFloats: {}, colliders: {} };
const model = readFileSync(
  fileURLToPath(new URL('../../src/content/base/assets/models/hatchback_shell.glb', import.meta.url)),
);
let baseline;
const compare = async (runtime, version, repeat, encoded) => {
  assert.ok(encoded.length > 0, 'Replay must not be empty');
  await writeFile(
    new URL(`${runtime}-${repeat}.json`, artifacts),
    JSON.stringify({ runtime, version, repeat, encoded }),
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
  await writeFile(new URL('summary.json', artifacts), JSON.stringify(summary, null, 2));
  assert.equal(summary.divergence, null, `NO-GO: first divergence ${JSON.stringify(summary.divergence)}`);
};
try {
  await mkdir(artifacts, { recursive: true });
  await vite.listen();
  const reference = await vite.ssrLoadModule('/test/fixtures/vehicleRapierReplay.ts');
  await reference.initializeVehicleReplay();
  for (let repeat = 0; repeat < repeats; repeat++) {
    const output = reference.replayVehicleQueries(undefined, new Uint8Array(model));
    for (const [tier, result] of Object.entries(output)) {
      assert.ok(result.poses.length > 0 && result.flight.points.length > 0 && result.rays.some((v) => v !== undefined));
      for (const [name, probe] of [
        ['panel', result.panel],
        ['part', result.part],
      ]) {
        assert.ok(probe.rapierFloats > 0, `${tier}/${name}: no Rapier float answers`);
        summary.rapierFloats[`${tier}/${name}`] = probe.rapierFloats;
      }
      summary.colliders[tier] = result.counts;
    }
    // biome-ignore lint/performance/noAwaitInLoops: serialize repeats and retain diagnostics before a possible disagreement
    await compare('node', process.version, repeat, reference.encodeReplay(output));
  }
  const address = vite.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const { firefox } = loadPlaywright();
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
          const encoded = await page.evaluate(async (base64) => {
            // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this browser-root TypeScript fixture URL
            const fixture = await import('/test/fixtures/vehicleRapierReplay.ts');
            await fixture.initializeVehicleReplay();
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            return fixture.encodeReplay(fixture.replayVehicleQueries(undefined, bytes));
          }, model.toString('base64'));
          await compare(runtime, browser.version(), repeat, encoded);
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
