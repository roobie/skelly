// biome-ignore-all lint/performance/noAwaitInLoops: gate/modifier down edges precede the primary key; releases must reverse that order.
// biome-ignore-all lint/style/useNamingConvention: native metadata retains exact DOM code spelling.
/**
 * @import { CDPSession } from 'playwright'
 * @import { Chord, Modifier } from '@skelly/engine/input'
 */
/**
 * @typedef {{ primary: Chord, gate: Chord | null }} ActionSnapshot
 * @typedef {{ readonly code: string, readonly key: string }} KeyUp
 * @typedef {{ includeGate?: boolean }} HoldOptions
 * @typedef {(expression: string) => Promise<unknown>} Evaluate
 * @typedef {CDPSession['send']} Send
 * @typedef {{ down: (code: string) => Promise<unknown>, up: (code: string) => Promise<unknown> }} Keyboard
 * @typedef {{ evaluate: Evaluate, readonly keyboard: Keyboard }} KeyboardPage
 */
/**
 * Releases the held keys from Node; waitForSimulation releases keyUps in the page first when this is its stop.
 * @typedef {(() => Promise<void>) & { readonly keyUps: readonly KeyUp[] }} HeldKeys
 */

// Native keyboard drivers resolve the running page's effective bindings, including its hold gate.
/**
 * @param {string} id
 * @returns {string}
 */
export const actionSnapshotExpression = (id) => `import('/src/product/input.ts').then(({ inputBindings }) => {
  const binding = inputBindings.binding(${JSON.stringify(id)});
  if (!binding) throw new Error('Unknown input action');
  const primary = inputBindings.chords(binding.id)[0];
  if (!primary) throw new Error('Unbound input action');
  return { primary, gate: binding.gate ? inputBindings.chords(binding.gate)[0] ?? null : null };
})`;
/**
 * @param {Evaluate} evaluate
 * @param {string} id
 */
const actionSnapshot = async (evaluate, id) =>
  // The expression returns this shape; see actionSnapshotExpression.
  /** @type {ActionSnapshot} */ (await evaluate(actionSnapshotExpression(id)));
/** @type {Readonly<Record<Modifier, string>>} */
const modifierKey = { shift: 'ShiftLeft', alt: 'AltLeft', ctrl: 'ControlLeft', meta: 'MetaLeft' };
/** @type {Readonly<Record<Modifier, number>>} */
const modifierBits = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
/**
 * The keys held under the primary key, in press order: the gate's modifier and key, then the primary's modifier.
 * @param {ActionSnapshot} snapshot
 */
const chordPrefix = ({ primary, gate }) => [
  ...new Set(
    [
      gate?.modifier && modifierKey[gate.modifier],
      gate?.code,
      primary.modifier && modifierKey[primary.modifier],
    ].filter((code) => code !== undefined),
  ),
];
/**
 * @param {KeyboardPage} page
 * @param {string} id
 * @param {boolean} includeGate
 */
const heldCodes = async (page, id, includeGate) => {
  const { primary, gate } = await actionSnapshot((expression) => page.evaluate(expression), id);
  return [...new Set([...chordPrefix({ primary, gate: includeGate ? gate : null }), primary.code])];
};
/**
 * @param {readonly string[]} codes
 * @returns {KeyUp[]}
 */
const keyUpsOf = (codes) => codes.toReversed().map((code) => ({ code, key: cdpKey(code).key }));
/**
 * @param {KeyboardPage} page
 * @param {string} id
 * @param {HoldOptions} [options]
 * @returns {Promise<HeldKeys>}
 */
export const holdAction = async (page, id, { includeGate = true } = {}) => {
  const held = await heldCodes(page, id, includeGate);
  /** @type {string[]} */
  const pressed = [];
  try {
    for (const code of held) {
      await page.keyboard.down(code);
      pressed.push(code);
    }
  } catch (error) {
    for (const code of pressed.reverse()) {
      await page.keyboard.up(code);
    }
    throw error;
  }
  let released = false;
  const release = async () => {
    if (released) {
      return;
    }
    released = true;
    for (const code of pressed.reverse()) {
      await page.keyboard.up(code);
    }
  };
  // waitForSimulation dispatches these in the page when the hold is its stop; see simulation-wait.mjs.
  return Object.assign(release, { keyUps: keyUpsOf(pressed) });
};
/**
 * @param {KeyboardPage} page
 * @param {string} id
 * @param {HoldOptions} [options]
 * @returns {Promise<void>}
 */
export const pressAction = async (page, id, options) => {
  const release = await holdAction(page, id, options);
  await release();
};
/**
 * Taps an action whose tap and hold differ by real time (`packages/engine/src/game/pressHoldInput.ts`,
 * `PressHoldInput`). A driven keyup is created only once the page has handled the keydown, so a long frame on a
 * loaded runner becomes hold time and the tap turns into a hold. Both edges are dispatched in one page task, where
 * no frame can run between them, as a player's quick tap reaches the page.
 * @param {KeyboardPage} page
 * @param {string} id
 * @returns {Promise<void>}
 */
export const tapAction = async (page, id) => {
  const codes = await heldCodes(page, id, true);
  /** @type {Set<string>} */
  const down = new Set();
  const edges = [
    ...codes.map((code) => ({ type: 'keydown', code })),
    ...codes.toReversed().map((code) => ({ type: 'keyup', code })),
  ].map(({ type, code }) => {
    if (type === 'keydown') {
      down.add(code);
    } else {
      down.delete(code);
    }
    const flags = Object.entries(modifierKey).map(([modifier, key]) => [`${modifier}Key`, down.has(key)]);
    return { type, init: { code, key: cdpKey(code).key, ...Object.fromEntries(flags) } };
  });
  // Every event is built before the first dispatch, so a slow keydown handler cannot age the keyup's timestamp.
  await page.evaluate(`(${JSON.stringify(edges)})
    .map(({ type, init }) => new KeyboardEvent(type, { ...init, bubbles: true, cancelable: true, composed: true }))
    .forEach((event) => (document.activeElement ?? document.body).dispatchEvent(event))`);
};
// The keyup events that release a hold of the action, known before the hold is pressed.
/**
 * @param {KeyboardPage} page
 * @param {string} id
 * @param {HoldOptions} [options]
 * @returns {Promise<HeldKeys['keyUps']>}
 */
export const keyUpsForHold = async (page, id, { includeGate = true } = {}) =>
  keyUpsOf(await heldCodes(page, id, includeGate));

// CDP needs native virtual-key metadata for browser default actions; this is a platform adapter,
// not a game binding table. Defaults and gates above always come from the running registry.
/** @type {Readonly<Record<string, number>>} */
const navigation = {
  Tab: 9,
  Enter: 13,
  Escape: 27,
  Space: 32,
  Backspace: 8,
  Backquote: 192,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34,
  ShiftLeft: 16,
  AltLeft: 18,
};
const functionKey = /^F\d+$/;
/**
 * @param {string} code
 * @returns {{ code: string, key: string, windowsVirtualKeyCode?: number }}
 */
export const cdpKey = (code) => {
  if (code.startsWith('Key')) {
    return { code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) };
  }
  if (code.startsWith('Digit')) {
    return { code, key: code.slice(5), windowsVirtualKeyCode: code.charCodeAt(5) };
  }
  const windowsVirtualKeyCode = functionKey.test(code) ? 111 + Number(code.slice(1)) : navigation[code];
  return {
    code,
    key: code === 'Backquote' ? '`' : code,
    ...(windowsVirtualKeyCode === undefined ? {} : { windowsVirtualKeyCode }),
  };
};
/** @param {ActionSnapshot} snapshot */
const cdpModifiers = ({ primary, gate }) =>
  (gate?.modifier ? modifierBits[gate.modifier] : 0) | (primary.modifier ? modifierBits[primary.modifier] : 0);
/**
 * @param {Evaluate} evaluate
 * @param {Send} send
 * @param {string} id
 * @returns {Promise<void>}
 */
export const pressCdpAction = async (evaluate, send, id) => {
  const snapshot = await actionSnapshot(evaluate, id);
  const { primary } = snapshot;
  const held = chordPrefix(snapshot);
  const modifiers = cdpModifiers(snapshot);
  try {
    for (const code of held) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...cdpKey(code), modifiers });
    }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...cdpKey(primary.code), modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...cdpKey(primary.code), modifiers });
  } finally {
    for (const code of held.reverse()) {
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...cdpKey(code) });
    }
  }
};
/**
 * @param {Evaluate} evaluate
 * @param {Send} send
 * @param {string} id
 * @param {number} count
 * @returns {Promise<void>}
 */
export const pressCdpActionBurst = async (evaluate, send, id, count) => {
  const snapshot = await actionSnapshot(evaluate, id);
  const { primary } = snapshot;
  const held = chordPrefix(snapshot);
  const modifiers = cdpModifiers(snapshot);
  const events = [
    ...held.map((code) => ({ type: /** @type {const} */ ('keyDown'), code })),
    ...Array.from({ length: count }, () => [
      { type: /** @type {const} */ ('keyDown'), code: primary.code },
      { type: /** @type {const} */ ('keyUp'), code: primary.code },
    ]).flat(),
    ...held.reverse().map((code) => ({ type: /** @type {const} */ ('keyUp'), code })),
  ];
  await Promise.all(
    events.map(({ type, code }) => {
      const key = cdpKey(code);
      return send('Input.dispatchKeyEvent', {
        type,
        ...key,
        ...(key.windowsVirtualKeyCode === undefined ? {} : { nativeVirtualKeyCode: key.windowsVirtualKeyCode }),
        modifiers,
        autoRepeat: false,
      });
    }),
  );
};
