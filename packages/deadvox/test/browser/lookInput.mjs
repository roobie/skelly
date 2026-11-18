// Turns the player the way a mouse does: locked-pointer `mousemove` events reach play's own look listener, which
// scales them by the live look sensitivity; see `packages/presentation/src/presentation/input.ts`, `Input`.
/** @import { Page } from 'playwright' */

/**
 * Where the player's body should face; a pitch left out keeps the current one.
 * @typedef {{ readonly yaw: number, readonly pitch?: number }} Look
 */

/** A pointer move as large as a deliberate turn, so the measured sensitivity carries no rounding of its own. */
const PROBE_PIXELS = 64;

/**
 * Faces `look` through mouse movement. The first move measures the radians per pixel, which a scope's power or
 * the player's setting change, and the second covers the rest of the turn; the event's movement is fractional, as
 * a high-resolution pointer's is.
 * @param {Page} page
 * @param {Look} look
 * @returns {Promise<void>}
 */
export const lookTo = (page, look) =>
  page.evaluate(
    ({ yaw, pitch, probe }) => {
      const { input } = globalThis.skellyPlayTest;
      const { controls } = input;
      if (!input.locked || input.menuPointer || controls.freeLooking) {
        throw new Error('Mouse look needs the pointer locked for play, without the menu pointer or free look');
      }
      /**
       * @param {number} movementX
       * @param {number} movementY
       * @returns {void}
       */
      const move = (movementX, movementY) => {
        const event = new MouseEvent('mousemove', { bubbles: true });
        Object.defineProperties(event, { movementX: { value: movementX }, movementY: { value: movementY } });
        document.dispatchEvent(event);
      };
      const before = controls.yaw;
      move(probe, 0);
      const radiansPerPixel = (before - controls.yaw) / probe;
      if (!(Number.isFinite(radiansPerPixel) && radiansPerPixel > 0)) {
        throw new Error('Mouse movement did not turn the player');
      }
      move(
        (controls.yaw - yaw) / radiansPerPixel,
        pitch === undefined ? 0 : (controls.pitch - pitch) / radiansPerPixel,
      );
      const missed = Math.abs(controls.yaw - yaw) + (pitch === undefined ? 0 : Math.abs(controls.pitch - pitch));
      if (missed > 1e-9) {
        throw new Error(`Mouse look stopped short of the requested look by ${missed} radians`);
      }
    },
    { yaw: look.yaw, pitch: look.pitch, probe: PROBE_PIXELS },
  );
