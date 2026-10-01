type SearchTarget = (target: EventTarget | null) => boolean;

/** Prevents focused debug search keystrokes from mutating the game's global keyboard input. */
export const installSearchInputKeyboardBoundary = (isSearchTarget: SearchTarget): (() => void) => {
  if (typeof globalThis.addEventListener !== 'function') {
    return () => undefined;
  }

  const maskedCodes = new Set<string>();
  const originalCodes = new WeakMap<KeyboardEvent, string>();
  const maskCode = (event: KeyboardEvent): void => {
    if (event.type === 'keydown') {
      if (!isSearchTarget(event.target)) {
        return;
      }
      maskedCodes.add(event.code);
    } else if (!maskedCodes.delete(event.code)) {
      return;
    }

    originalCodes.set(event, event.code);
    Object.defineProperty(event, 'code', { configurable: true, value: '' });
  };
  const restoreCode = (event: KeyboardEvent): void => {
    const code = originalCodes.get(event);
    if (code === undefined) {
      return;
    }
    Object.defineProperty(event, 'code', { configurable: true, value: code });
  };
  const clearMaskedCodes = (): void => maskedCodes.clear();

  // Input's game-wide bubble listeners are installed before the debug menu is created.
  // Restore afterward so the game's menu handler and other listeners see the real code.
  globalThis.addEventListener('keydown', maskCode, true);
  globalThis.addEventListener('keyup', maskCode, true);
  globalThis.addEventListener('keydown', restoreCode);
  globalThis.addEventListener('keyup', restoreCode);
  globalThis.addEventListener('blur', clearMaskedCodes);

  return () => {
    globalThis.removeEventListener('keydown', maskCode, true);
    globalThis.removeEventListener('keyup', maskCode, true);
    globalThis.removeEventListener('keydown', restoreCode);
    globalThis.removeEventListener('keyup', restoreCode);
    globalThis.removeEventListener('blur', clearMaskedCodes);
    maskedCodes.clear();
  };
};
