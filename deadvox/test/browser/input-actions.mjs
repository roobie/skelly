// Native keyboard drivers resolve the running page's effective bindings, including its hold gate.
export const actionSnapshotExpression = (id) => `import('/src/game/inputBindings.ts').then(({ inputBindings }) => {
  const binding = inputBindings.binding(${JSON.stringify(id)});
  if (!binding) throw new Error('Unknown input action');
  return { primary: inputBindings.chords(binding.id)[0], gate: binding.gate ? inputBindings.chords(binding.gate)[0] : null };
})`;
const modifierKey = { shift: 'ShiftLeft', alt: 'AltLeft', ctrl: 'ControlLeft', meta: 'MetaLeft' };
export const pressAction = async (page, id) => {
  const { primary, gate } = await page.evaluate(actionSnapshotExpression(id));
  const held = [
    ...new Set(
      [
        gate?.modifier && modifierKey[gate.modifier],
        gate?.code,
        primary.modifier && modifierKey[primary.modifier],
      ].filter(Boolean),
    ),
  ];
  try {
    for (const code of held) {
      await page.keyboard.down(code);
    }
    await page.keyboard.press(primary.code);
  } finally {
    for (const code of held.reverse()) {
      await page.keyboard.up(code);
    }
  }
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
export const cdpKey = (code) => ({
  code,
  key: code.startsWith('Key')
    ? code.slice(3).toLowerCase()
    : code.startsWith('Digit')
      ? code.slice(5)
      : code === 'Backquote'
        ? '`'
        : code,
  windowsVirtualKeyCode: code.startsWith('Key')
    ? code.charCodeAt(3)
    : code.startsWith('Digit')
      ? code.charCodeAt(5)
      : /^F\d+$/.test(code)
        ? 111 + Number(code.slice(1))
        : navigation[code],
});
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
