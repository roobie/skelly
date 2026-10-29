// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone experiment contract
// biome-ignore-all lint/performance/noAwaitInLoops: engines run serially to avoid competing workloads
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

function inspect(baseline, driving) {
  assert(Object.keys(baseline).length > 0, 'scenario set is not empty');
  const collisionFindings = [];
  for (const [scenario, candidates] of Object.entries(baseline)) {
    assert(Object.keys(candidates).length > 0, 'candidate set is not empty');
    for (const [candidate, { trajectory, properties }] of Object.entries(candidates)) {
      assert(trajectory.length > 0);
      if (properties.maximumPenetration > driving.penetrationLimit) {
        collisionFindings.push(`${scenario}/${candidate}: penetration ${properties.maximumPenetration}`);
      }
      for (const tick of trajectory) {
        assert([...tick.position, ...tick.velocity].every(Number.isFinite), `${scenario}/${candidate}: finite`);
        if (tick.tests !== null) {
          assert(tick.tests <= driving.maxColliders * driving.maxImpacts, 'owned work bound');
        }
      }
    }
  }
  return collisionFindings;
}
export async function runDrivingComparison(vite, engines, selected) {
  const artifacts = new URL('../../test-results/vehicle-driving/', import.meta.url);
  await mkdir(artifacts, { recursive: true });
  const wasm = await readFile(new URL('../../vendor/rapier-f64/rapier_wasm3d_bg.wasm', import.meta.url));
  const raw = await vite.ssrLoadModule('/vendor/rapier-f64/rapier_wasm3d.js');
  // biome-ignore lint/style/useNamingConvention: wasm-bindgen API
  await raw.default({ module_or_path: wasm });
  const api = await vite.ssrLoadModule('/vendor/rapier-f64/rapier.js');
  const { runDriving, driving, traceBits } = await vite.ssrLoadModule('/src/vehicles/feasibility/driving.ts');
  const baseline = runDriving(api);
  const bits = traceBits(baseline);
  assert.deepEqual(traceBits(runDriving(api)), bits, 'Node repeat agrees at every field');
  const collisionFindings = inspect(baseline, driving);
  const identity = {
    wasmSha256: createHash('sha256').update(wasm).digest('hex'),
    scenarioSha256: createHash('sha256').update(JSON.stringify(driving)).digest('hex'),
    sourceSha256: createHash('sha256')
      .update(await readFile(new URL('../../src/vehicles/feasibility/driving.ts', import.meta.url)))
      .digest('hex'),
  };
  const summary = Object.fromEntries(
    Object.entries(baseline).map(([scenario, candidates]) => [
      scenario,
      Object.fromEntries(Object.entries(candidates).map(([candidate, result]) => [candidate, result.properties])),
    ]),
  );
  await writeFile(
    new URL('node.json', artifacts),
    JSON.stringify({ identity, version: process.version, baseline, bits }),
  );
  await writeFile(new URL('summary.json', artifacts), JSON.stringify({ summary, collisionFindings }, null, 2));
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  for (const engine of (selected.length > 0 ? selected : Object.keys(engines)).filter((name) => name !== 'node')) {
    assert(Object.hasOwn(engines, engine), `Unknown engine: ${engine}`);
    const browser = await engines[engine]();
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/test/browser/vehicle-feasibility.html`);
      const result = await page.evaluate(
        async ({ rawUrl, apiUrl, drivingUrl }) => {
          const browserRaw = await import(rawUrl);
          await browserRaw.default();
          const browserApi = await import(apiUrl);
          const module = await import(drivingUrl);
          const suite = module.runDriving(browserApi);
          return { suite, bits: module.traceBits(suite) };
        },
        {
          rawUrl: '/vendor/rapier-f64/rapier_wasm3d.js',
          apiUrl: '/vendor/rapier-f64/rapier.js',
          drivingUrl: '/src/vehicles/feasibility/driving.ts',
        },
      );
      await writeFile(
        new URL(`${engine}.json`, artifacts),
        JSON.stringify({ identity, version: browser.version(), ...result }),
      );
      assert.deepEqual(result.bits, bits, `${engine}: all trajectory fields agree bit-for-bit with Node`);
      process.stdout.write(`${engine} ${browser.version()}: driving trajectories agree bit-for-bit\n`);
      if (engine === 'chromium') {
        await page.goto(`http://127.0.0.1:${address.port}/src/vehicles/feasibility/driving.html`);
        await page.waitForFunction(() => document.querySelector('#state').textContent.includes('"tick": 0'));
        await page.locator('#step').click();
        await page.waitForFunction(() => JSON.parse(document.querySelector('#state').textContent).tick === 1);
        const played = JSON.parse(await page.locator('#state').textContent());
        assert(played.owned.position.every(Number.isFinite));
        assert(played.rapier.position.every(Number.isFinite));
        await page.locator('#reset').click();
        await page.waitForFunction(() => JSON.parse(document.querySelector('#state').textContent).tick === 0);
      }
    } finally {
      await browser.close();
    }
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ collisionFindings })}\n`);
}
