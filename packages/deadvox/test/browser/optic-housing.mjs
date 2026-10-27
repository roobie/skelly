// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract uses Node assertions and diagnostics
// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions belong to the enclosing browser stage
import assert from 'node:assert/strict';
import process from 'node:process';

export const opticHousingChecks = async (page) => {
  const moduleUrl = '/test/browser/optic-housing-scene.mjs';
  const results = await page.evaluate(async (url) => {
    const { runOpticHousingProperty } = await import(url);
    return runOpticHousingProperty(globalThis.primaryActionTest.inventory.registry);
  }, moduleUrl);
  process.stdout.write(`OPTIC_HOUSING ${JSON.stringify(results)}\n`);
  for (const result of results) {
    assert.ok(result.housing > 0, `${result.model} exercises opaque housing inside the disc`);
    assert.equal(result.coveredHousing, 0, `${result.model}: world disc must preserve opaque housing pixels`);
    assert.ok(result.clearWindowChanged > 0, `${result.model}: the glass still receives the world image`);
  }
};
