// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared standalone browser assertions.
import assert from 'node:assert/strict';
import process from 'node:process';
import { holdAction } from './input-actions.mjs';

export const verifyAltRelease = async (page) => {
  await page.evaluate(() => {
    globalThis.altReleaseEvents = [];
    globalThis.altReleaseObservation = new AbortController();
    for (const type of ['keydown', 'keyup', 'mousemove', 'blur', 'focus', 'visibilitychange', 'pointerlockchange']) {
      const target = type === 'visibilitychange' || type === 'pointerlockchange' ? document : globalThis;
      const record = (event) => {
        globalThis.altReleaseEvents.push({
          type,
          code: event.code,
          trusted: event.isTrusted,
          cancelable: event.cancelable,
          prevented: event.defaultPrevented,
          alt: event.altKey,
          modifierAlt: event.getModifierState?.('Alt'),
          focused: document.hasFocus(),
          visible: document.visibilityState,
          locked: Boolean(document.pointerLockElement),
        });
      };
      target.addEventListener(type, record, { signal: globalThis.altReleaseObservation.signal });
    }
  });
  const releaseMovement = await holdAction(page, 'movement.forward');
  const releaseLook = await holdAction(page, 'view.free-look');
  try {
    await page.mouse.move(640, 360);
    await page.mouse.move(680, 380);
    await releaseLook();
    await releaseMovement();
    await page.mouse.move(700, 380);
    const state = await page.evaluate(async (moduleUrl) => {
      const { keyboardInput } = await import(moduleUrl);
      return {
        events: globalThis.altReleaseEvents,
        moving: keyboardInput.held('movement.forward'),
        looking: keyboardInput.held('view.free-look'),
      };
    }, '/src/game/inputBindings.ts');
    process.stdout.write(`ALT_RELEASE ${JSON.stringify(state)}\n`);
    assert.equal(state.moving, false, 'movement ends after the native release');
    assert.equal(state.looking, false, 'free look ends after the native release');
    const keys = state.events.filter((event) => event.type === 'keydown' || event.type === 'keyup');
    assert(keys.length > 0 && keys.every((event) => event.trusted), 'keyboard input is trusted');
    const alt = keys.filter((event) => event.code?.startsWith('Alt'));
    assert(
      alt.some((event) => event.type === 'keydown'),
      'Alt down arrives',
    );
    assert(
      alt.some((event) => event.type === 'keyup'),
      'Alt up arrives',
    );
    assert(
      alt.every((event) => event.prevented),
      'both Alt defaults are cancelled',
    );
  } finally {
    await releaseLook();
    await releaseMovement();
    await page.evaluate(() => globalThis.altReleaseObservation.abort());
  }
};
