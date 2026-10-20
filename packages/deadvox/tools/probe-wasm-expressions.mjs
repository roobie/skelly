// biome-ignore-all lint/performance/noAwaitInLoops: serialize runtime calls and timing probes to avoid concurrent measurement noise
// biome-ignore-all lint/correctness/noUnresolvedImports: page imports resolve against the isolated Vite server; Playwright reexports are not resolved by Biome
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract, not a Vitest test
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'isolated-expression-page',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== '/expression-probe') {
            return next();
          }
          response.setHeader('Content-Type', 'text/html');
          response.end('<!doctype html><title>Expression probe</title>');
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0 },
});
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const results = [];
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.on('console', (message) => console.log(name, message.text()));
      page.on('pageerror', (error) => console.error(name, error));
      await page.goto(`http://127.0.0.1:${address.port}/expression-probe`);
      if (process.argv.includes('--loads') && name === 'chromium') {
        for (const entry of ['small', 'cel', 'starlark', 'luau']) {
          for (const fixture of ['sleepHealsPredicate', 'panelEffect']) {
            const coldPage = await browser.newPage();
            try {
              await coldPage.goto(`http://127.0.0.1:${address.port}/expression-probe`);
              const load = await coldPage.evaluate(
                async ({ entry: candidateEntry, fixture: fixtureKey }) => {
                  const { default: rules } = await import('/test/fixtures/mods/expression-spike.json');
                  const { sleepSchema, panelSchema } = await import('/src/spikes/expressions/contract.ts');
                  const start = performance.now();
                  const module = await import(`/src/spikes/expressions/${candidateEntry}.ts`);
                  const importUs = (performance.now() - start) * 1000;
                  const candidate = module[candidateEntry];
                  const sources = rules.wasm[candidateEntry] ?? rules;
                  const loadStart = performance.now();
                  const program = await candidate.load(
                    sources[fixtureKey],
                    fixtureKey === 'panelEffect' ? panelSchema : sleepSchema,
                    fixtureKey === 'panelEffect' ? 'string' : 'boolean',
                  );
                  const loadUs = (performance.now() - loadStart) * 1000;
                  program.dispose?.();
                  return { entry: candidateEntry, fixture: fixtureKey, importUs, loadUs };
                },
                { entry, fixture },
              );
              console.log(JSON.stringify({ browser: name, coldLoad: load }));
            } finally {
              await coldPage.close();
            }
          }
        }
      }
      const result = await page.evaluate(async () => {
        const { starlark } = await import('/src/spikes/expressions/starlark.ts');
        const { luau } = await import('/src/spikes/expressions/luau.ts');
        const { wasmCases } = await import('/test/expressionWasmCases.ts');
        const values = [];
        for (const [language, candidate] of [
          ['starlark', starlark],
          ['luau', luau],
        ]) {
          const checks = [];
          for (const test of wasmCases(candidate, language)) {
            checks.push({ name: test.name, evidence: await test.run() });
          }
          values.push({ name: candidate.name, checks });
        }
        return values;
      });
      results.push(result);
      console.log(JSON.stringify({ browser: name, version: browser.version(), result }));
      if (process.argv.includes('--bench') && name === 'chromium') {
        const measurements = await page.evaluate(async () => {
          const { benchmarkWasmExpressions } = await import('/src/spikes/expressions/benchmark.ts');
          return benchmarkWasmExpressions();
        });
        console.log(JSON.stringify({ browser: name, measurements }));
      }
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(results[0], results[1]);
} finally {
  await server.close();
}
