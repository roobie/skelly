// biome-ignore-all lint/correctness/noNodejsModules: shared Node-side Playwright assertion helper.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser-driver assertions.
import assert from 'node:assert/strict';

/**
 * Wait for simulated progress, never a renderer-speed wall deadline.
 * sample is a closure-free browser function returning {time, paused, reached, ...diagnostics}.
 * argument must be JSON-serializable (or undefined).
 * stop optionally releases a held real input before transport/snapshot work; record must
 * persist a snapshot before assertions. The caller's independently capped stage
 * owns the wall limit; pause is a failure even if the destination is already reached.
 */
export async function waitForSimulation(page, sample, argument, { seconds, from, label, record, stop }) {
  assert.ok(Number.isFinite(seconds) && seconds > 0, 'positive simulation budget');
  const initial = await page.evaluate(sample, argument);
  const start = from ?? initial.time;
  assert.ok(Number.isFinite(start), 'finite simulation start');
  // Playwright accepts a serialized browser function. Embedding the supplied sample keeps
  // all timeout/pause policy here without a vocabulary of caller-specific conditions.
  const handle = await page.waitForFunction(
    `(({argument, start, limit}) => {
      const value = (${sample.toString()})(argument);
      const seconds = value.time - start;
      return value.reached || seconds >= limit || value.paused ? {...value, seconds} : false;
    })(${JSON.stringify({ argument, start, limit: seconds })})`,
    undefined,
    { timeout: 0 },
  );
  await stop?.();
  const value = await handle.jsonValue();
  await record(`${label}: ${JSON.stringify(value)}`);
  assert.equal(value.reached && !value.paused, true, `${label}: ${JSON.stringify(value)}`);
  await handle.dispose();
  return value;
}
