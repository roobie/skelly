// biome-ignore-all lint/correctness/noNodejsModules: shared Node-side Playwright assertion helper.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser-driver assertions.
import assert from 'node:assert/strict';

/**
 * Wait for simulated progress, never a renderer-speed wall deadline.
 * sample is a closure-free browser function returning {time, paused, reached, ...diagnostics}.
 * argument must be JSON-serializable (or undefined).
 * stop optionally releases a held real input once the wait ends; record must
 * persist a snapshot before assertions. The caller's independently capped stage
 * owns the wall limit; pause is a failure even if the destination is already reached.
 */
export async function waitForSimulation(page, sample, argument, { seconds, from, label, record, stop }) {
  assert.ok(Number.isFinite(seconds) && seconds > 0, 'positive simulation budget');
  // A stop without keyUps, such as a wrapped holdAction release, would leave a held key down until Node
  // releases it; a hold with no key to release, such as a mouse hold, declares keyUps: [].
  assert.ok(stop === undefined || Array.isArray(stop.keyUps), `${label}: stop must carry keyUps`);
  const initial = await page.evaluate(sample, argument);
  const start = from ?? initial.time;
  assert.ok(Number.isFinite(start), 'finite simulation start');
  // A key held through holdAction is released in the page by the poll that ends the wait, before the
  // next game frame, through the same window listeners a real keyup reaches. Released from Node, the
  // key would stay down through the round trip and a walk would overshoot by speed × latency.
  const keyUps = stop?.keyUps ?? [];
  // Playwright accepts a serialized browser function. Embedding the supplied sample keeps
  // all timeout/pause policy here without a vocabulary of caller-specific conditions.
  const handle = await page.waitForFunction(
    `(({argument, start, limit, keyUps}) => {
      const value = (${sample.toString()})(argument);
      const seconds = value.time - start;
      if (!(value.reached || seconds >= limit || value.paused)) {
        return false;
      }
      for (const init of keyUps) {
        (document.activeElement ?? document.body).dispatchEvent(
          new KeyboardEvent('keyup', { ...init, bubbles: true, cancelable: true, composed: true }),
        );
      }
      return {...value, seconds};
    })(${JSON.stringify({ argument, start, limit: seconds, keyUps })})`,
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
