// biome-ignore-all lint/performance/noAwaitInLoops: gate/modifier down edges precede the primary key; releases must reverse that order.
// biome-ignore-all lint/style/useNamingConvention: native metadata retains exact DOM code spelling.
// Native keyboard drivers resolve the running page's effective bindings, including its hold gate.
export const actionSnapshotExpression = (id) => `import('/src/game/inputBindings.ts').then(({ inputBindings }) => {
  const binding = inputBindings.binding(${JSON.stringify(id)});
  if (!binding) throw new Error('Unknown input action');
  return { primary: inputBindings.chords(binding.id)[0], gate: binding.gate ? inputBindings.chords(binding.gate)[0] : null };
})`;
const modifierKey = { shift: 'ShiftLeft', alt: 'AltLeft', ctrl: 'ControlLeft', meta: 'MetaLeft' };
export const holdAction = async (page, id, { includeGate = true } = {}) => {
  const { primary, gate: effectiveGate } = await page.evaluate(actionSnapshotExpression(id));
  const gate = includeGate ? effectiveGate : null;
  const held = [
    ...new Set(
      [
        gate?.modifier && modifierKey[gate.modifier],
        gate?.code,
        primary.modifier && modifierKey[primary.modifier],
        primary.code,
      ].filter(Boolean),
    ),
  ];
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
  return async () => {
    if (released) {
      return;
    }
    released = true;
    for (const code of pressed.reverse()) {
      await page.keyboard.up(code);
    }
  };
};
export const pressAction = async (page, id, options) => {
  const release = await holdAction(page, id, options);
  await release();
};

// CDP needs native virtual-key metadata for browser default actions; this is a platform adapter,
// not a game binding table. Defaults and gates above always come from the running registry.
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
export const cdpKey = (code) => {
  if (code.startsWith('Key')) {
    return { code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) };
  }
  if (code.startsWith('Digit')) {
    return { code, key: code.slice(5), windowsVirtualKeyCode: code.charCodeAt(5) };
  }
  return {
    code,
    key: code === 'Backquote' ? '`' : code,
    windowsVirtualKeyCode: functionKey.test(code) ? 111 + Number(code.slice(1)) : navigation[code],
  };
};
export const pressCdpAction = async (evaluate, send, id) => {
  const { primary, gate } = await evaluate(actionSnapshotExpression(id));
  const held = [
    ...new Set(
      [
        gate?.modifier && modifierKey[gate.modifier],
        gate?.code,
        primary.modifier && modifierKey[primary.modifier],
      ].filter(Boolean),
    ),
  ];
  const modifierBits = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
  const modifiers =
    (gate?.modifier ? modifierBits[gate.modifier] : 0) | (primary.modifier ? modifierBits[primary.modifier] : 0);
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
export const pressCdpActionBurst = async (evaluate, send, id, count) => {
  const { primary, gate } = await evaluate(actionSnapshotExpression(id));
  const held = [
    ...new Set(
      [
        gate?.modifier && modifierKey[gate.modifier],
        gate?.code,
        primary.modifier && modifierKey[primary.modifier],
      ].filter(Boolean),
    ),
  ];
  const modifierBits = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
  const modifiers =
    (gate?.modifier ? modifierBits[gate.modifier] : 0) | (primary.modifier ? modifierBits[primary.modifier] : 0);
  const events = [
    ...held.map((code) => ({ type: 'keyDown', code })),
    ...Array.from({ length: count }, () => [
      { type: 'keyDown', code: primary.code },
      { type: 'keyUp', code: primary.code },
    ]).flat(),
    ...held.reverse().map((code) => ({ type: 'keyUp', code })),
  ];
  await Promise.all(
    events.map(({ type, code }) => {
      const key = cdpKey(code);
      return send('Input.dispatchKeyEvent', {
        type,
        ...key,
        nativeVirtualKeyCode: key.windowsVirtualKeyCode,
        modifiers,
        autoRepeat: false,
      });
    }),
  );
};
