// biome-ignore-all lint/correctness/noNodejsModules: shared Node-side Playwright assertion helper.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser-driver assertions.
import assert from 'node:assert/strict';
import { holdAction, keyUpsForHold } from './input-actions.mjs';

let waits = 0;

/**
 * Wait for simulated progress, never a renderer-speed wall deadline.
 * sample is a closure-free browser function returning {time, paused, reached, ...diagnostics}.
 * argument must be JSON-serializable (or undefined).
 * record must persist a snapshot before assertions. The caller's independently capped stage
 * owns the wall limit; pause is a failure even if the destination is already reached.
 *
 * hold names an input action to hold for the wait. The poll that ends it is armed in the page before the
 * key goes down, ignores the sample until the page sees the keydown, and then releases the key in the
 * poll that finds the wait over, so the key is never down without a stop watching for it. The wait
 * starts at the sample taken when the poll is armed, which `from` replaces.
 *
 * stop instead releases a hold the caller already pressed, once the wait ends. That key goes down before
 * the poll is armed, so movement can run first; prefer hold.
 */
export async function waitForSimulation(page, sample, argument, { seconds, from, label, record, stop, hold }) {
  assert.ok(Number.isFinite(seconds) && seconds > 0, 'positive simulation budget');
  assert.ok(hold === undefined || stop === undefined, `${label}: hold and stop are alternatives`);
  // A stop without keyUps, such as a wrapped holdAction release, would leave a held key down until Node
  // releases it; a hold with no key to release, such as a mouse hold, declares keyUps: [].
  assert.ok(stop === undefined || Array.isArray(stop.keyUps), `${label}: stop must carry keyUps`);
  const holdKeyUpEvents = hold === undefined ? [] : await keyUpsForHold(page, hold);
  const initial = hold === undefined ? await page.evaluate(sample, argument) : undefined;
  const start = from ?? initial?.time;
  assert.ok(hold !== undefined || Number.isFinite(start), 'finite simulation start');
  const keyUps = stop?.keyUps ?? holdKeyUpEvents;
  waits += 1;
  const id = `wait${waits}`;
  // Playwright accepts a serialized browser function. Embedding the supplied sample keeps
  // all timeout/pause policy here without a vocabulary of caller-specific conditions.
  const polled = page.waitForFunction(
    `(({id, argument, start, limit, keyUps, gated}) => {
      const slots = (globalThis.simulationWaits ??= {});
      const slot = (slots[id] ??= { down: !gated });
      if (!slot.listening) {
        slot.listening = true;
        slot.onKeyDown = (event) => { slot.down ||= event.code === keyUps[0].code; };
        if (gated) {
          globalThis.addEventListener('keydown', slot.onKeyDown, true);
        }
      }
      const value = (${sample.toString()})(argument);
      slot.start ??= start ?? value.time;
      const seconds = value.time - slot.start;
      if (!slot.down || !(value.reached || seconds >= limit || value.paused)) {
        return false;
      }
      for (const init of keyUps) {
        (document.activeElement ?? document.body).dispatchEvent(
          new KeyboardEvent('keyup', { ...init, bubbles: true, cancelable: true, composed: true }),
        );
      }
      globalThis.removeEventListener('keydown', slot.onKeyDown, true);
      delete slots[id];
      return {...value, seconds};
    })(${JSON.stringify({ id, argument, start, limit: seconds, keyUps, gated: keyUps.length > 0 && hold !== undefined })})`,
    undefined,
    { timeout: 0 },
  );
  let release;
  try {
    if (hold !== undefined) {
      // Settle the poll's rejection in case arming fails; the awaited result below still throws it.
      polled.catch(() => undefined);
      await page.waitForFunction((slotId) => globalThis.simulationWaits?.[slotId]?.listening === true, id);
      release = await holdAction(page, hold);
    }
    const handle = await polled;
    await (stop ?? release)?.();
    const value = await handle.jsonValue();
    await record(`${label}: ${JSON.stringify(value)}`);
    assert.equal(value.reached && !value.paused, true, `${label}: ${JSON.stringify(value)}`);
    await handle.dispose();
    return value;
  } finally {
    await release?.();
  }
}
