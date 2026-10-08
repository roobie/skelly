import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input, nextMenuCursor } from '../src/game/input.ts';
import { keyboardInput, shouldCancelInputForViewerFocus } from '../src/game/inputBindings.ts';

const fixture = (allowed: () => boolean = () => true, viewerInputAllowed: () => boolean = () => true) => {
  const targetListeners = new Map<string, (event: MouseEvent) => void>();
  const windowListeners = new Map<string, (event: MouseEvent) => void>();
  const target = {
    addEventListener: (type: string, listener: (event: MouseEvent) => void) => targetListeners.set(type, listener),
    requestPointerLock: vi.fn<() => Promise<void>>(),
  } as unknown as HTMLElement;
  const document = {
    pointerLockElement: target as HTMLElement | null,
    addEventListener: vi.fn(),
    exitPointerLock: vi.fn(),
  };
  vi.stubGlobal('document', document);
  vi.stubGlobal('innerWidth', 640);
  vi.stubGlobal('innerHeight', 480);
  vi.stubGlobal('addEventListener', (type: string, listener: (event: MouseEvent) => void) =>
    windowListeners.set(type, listener),
  );
  keyboardInput.cancel();
  keyboardInput.context = () => ({ context: 'play', debug: false });
  let input: Input;
  keyboardInput.command = ({ action, phase }) => {
    if (action === 'stance.ready') {
      input.rightMouseHeld = phase === 'down';
      if (phase === 'up') {
        input.aimingDownSights = false;
      }
    } else if (action === 'aim.ads-toggle' && phase === 'down') {
      input.toggleAimingDownSights();
    }
  };
  input = new Input(target, allowed, () => true, viewerInputAllowed);
  keyboardInput.cancelled = (preservePointer) => input.cancel(preservePointer);
  return { input, target, document, targetListeners, windowListeners };
};
afterEach(() => {
  keyboardInput.cancel();
  for (let button = 0; button <= 4; button++) {
    keyboardInput.releasePointer(button, 0);
  }
  keyboardInput.release({
    code: 'F2',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    timeStamp: 0,
  });
  keyboardInput.context = () => ({ context: 'title', debug: false });
  keyboardInput.command = () => undefined;
  keyboardInput.cancelled = () => undefined;
  vi.unstubAllGlobals();
});

describe('pointer input', () => {
  it('cancels each viewer-focus reason live but not during replay', () => {
    for (const reason of ['window-blur', 'document-hidden', 'pointer-lock-lost'] as const) {
      expect(shouldCancelInputForViewerFocus(reason, false)).toBe(true);
      expect(shouldCancelInputForViewerFocus(reason, true)).toBe(false);
    }
    expect(shouldCancelInputForViewerFocus('context-change', true)).toBe(true);
    expect(shouldCancelInputForViewerFocus('manual', true)).toBe(true);
  });
  it('surfaces native pointer-lock refusal without an unhandled rejection', async () => {
    const { input, target } = fixture();
    const error = new Error('Pointer lock refused');
    vi.mocked(target.requestPointerLock).mockRejectedValue(error);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      input.lock();
      await Promise.resolve();
      expect(warn).toHaveBeenCalledWith('Pointer lock request failed', error);
    } finally {
      warn.mockRestore();
    }
  });
  it('ignores viewer mouse transitions during replay while live input remains admitted', () => {
    const run = (viewerAllowed: boolean, locked: boolean) => {
      const allowed = viewerAllowed;
      const { input, target, document, targetListeners, windowListeners } = fixture(() => true, () => allowed);
      document.pointerLockElement = locked ? target : null;
      input.rightMouseHeld = true;
      input.suppressRightMouseUntilRelease();
      const read = () => ({
        rightMousePressed: input.consumeRightMousePressed(),
        rightMouseSuppressed: input.rightMouseHeld && !input.rightMouseActionHeld,
        dominantUsePressed: input.intent().useDominant,
        dominantUseDown: input.dominantUseHeld,
      });
      type MouseState = ReturnType<typeof read>;
      const initial = read();
      const transitions: MouseState[] = [];
      for (const button of [0, 1, 2]) {
        targetListeners.get('mousedown')!({ button } as MouseEvent);
        transitions.push(read());
        windowListeners.get('mouseup')!({ button } as MouseEvent);
        transitions.push(read());
      }
      return { initial, transitions };
    };

    for (const locked of [false, true]) {
      const replay = run(false, locked);
      expect(replay.transitions, `replay mouse events with pointer lock=${locked}`).toEqual(
        Array.from({ length: 6 }, () => replay.initial),
      );
      const live = run(true, locked);
      expect(live.transitions.some((state) => state.rightMousePressed)).toBe(true);
      expect(live.transitions.some((state) => !state.rightMouseSuppressed)).toBe(true);
      if (locked) {
        expect(live.transitions.some((state) => state.dominantUsePressed)).toBe(true);
        expect(live.transitions.some((state) => state.dominantUseDown)).toBe(true);
      }
    }
  });
  it('does not retain a dominant press refused by the active owner', () => {
    let allowed = false;
    const { input, targetListeners } = fixture(() => allowed);
    targetListeners.get('mousedown')!({ button: 0 } as MouseEvent);
    expect(input.intent().useDominantHeld).toBe(false);
    allowed = true;
    expect(input.intent().useDominant).toBe(false);
    targetListeners.get('mousedown')!({ button: 0 } as MouseEvent);
    expect(input.intent().useDominant).toBe(true);
  });
  it('admits hand uses only in locked play and clears presses, holds and ready stance on cancellation', () => {
    const { input, document, target, targetListeners, windowListeners } = fixture();
    document.pointerLockElement = null;
    input.useOff();
    targetListeners.get('mousedown')!({ button: 0 } as MouseEvent);
    expect(input.intent().useOff).toBe(false);
    expect(input.intent().useDominant).toBe(false);
    document.pointerLockElement = target;
    input.menuPointer = true;
    input.useOff();
    expect(input.intent().useOff).toBe(false);
    input.menuPointer = false;
    input.useOff();
    targetListeners.get('mousedown')!({ button: 0 } as MouseEvent);
    targetListeners.get('mousedown')!({ button: 2 } as MouseEvent);
    expect(input.intent()).toMatchObject({ useOff: true, useDominant: true, useDominantHeld: true });
    expect(input.rightMouseHeld).toBe(true);
    input.consumeOffUse();
    input.consumeDominantUse();
    expect(input.intent()).toMatchObject({ useOff: false, useDominant: false, useDominantHeld: true });
    windowListeners.get('mouseup')!({ button: 2 } as MouseEvent);
    expect(input.rightMouseHeld).toBe(false);
    windowListeners.get('blur')!(new Event('blur') as MouseEvent);
    expect(input.intent().useDominantHeld).toBe(false);
  });
  it('suppresses ready and aim actions from the right-click that cancels a glowstick charge', () => {
    const { input, targetListeners, windowListeners } = fixture();
    targetListeners.get('mousedown')!({ button: 2, timeStamp: 1 } as MouseEvent);
    expect(input.rightMouseActionHeld).toBe(true);
    expect(input.consumeRightMousePressed()).toBe(true);
    input.suppressRightMouseUntilRelease();
    expect(input.rightMouseHeld).toBe(true);
    expect(input.rightMouseActionHeld).toBe(false);
    expect(input.consumeRightMousePressed()).toBe(false);
    windowListeners.get('mouseup')!({ button: 2, timeStamp: 2 } as MouseEvent);
    expect(input.rightMouseActionHeld).toBe(false);
    targetListeners.get('mousedown')!({ button: 2, timeStamp: 3 } as MouseEvent);
    expect(input.rightMouseActionHeld).toBe(true);
  });
  it('toggles sight alignment only while the ready stance is held', () => {
    const { input, targetListeners, windowListeners } = fixture();
    const down = targetListeners.get('mousedown')!;
    const up = windowListeners.get('mouseup')!;
    down({ button: 1 } as MouseEvent);
    expect(input.aimingDownSights).toBe(false);
    up({ button: 1 } as MouseEvent);
    down({ button: 2 } as MouseEvent);
    down({ button: 1 } as MouseEvent);
    expect(input.aimingDownSights).toBe(true);
    up({ button: 1 } as MouseEvent);
    down({ button: 1 } as MouseEvent);
    expect(input.aimingDownSights).toBe(false);
    up({ button: 1 } as MouseEvent);
    input.setAimingDownSightsAllowed(() => false);
    down({ button: 1 } as MouseEvent);
    expect(input.aimingDownSights).toBe(false);
    up({ button: 1 } as MouseEvent);
    up({ button: 2 } as MouseEvent);
    expect(input.aimingDownSights).toBe(false);
  });
  it('keeps ready and ADS active when F2 enables debug controls', () => {
    const { input, targetListeners, windowListeners } = fixture();
    keyboardInput.context = () => ({ context: 'play', debug: true });
    const down = targetListeners.get('mousedown')!;
    down({ button: 2, timeStamp: 1 } as MouseEvent);
    down({ button: 1, timeStamp: 2 } as MouseEvent);
    windowListeners.get('mouseup')!({ button: 1, timeStamp: 3 } as MouseEvent);
    expect([input.rightMouseHeld, input.aimingDownSights]).toEqual([true, true]);

    keyboardInput.press({
      code: 'F2',
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      repeat: false,
      isComposing: false,
      timeStamp: 4,
    });
    expect([input.rightMouseHeld, input.aimingDownSights, keyboardInput.held('stance.ready')]).toEqual([
      true,
      true,
      true,
    ]);
    keyboardInput.release({
      code: 'F2',
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      repeat: false,
      isComposing: false,
      timeStamp: 5,
    });
    windowListeners.get('mouseup')!({ button: 2, timeStamp: 6 } as MouseEvent);
    expect([input.rightMouseHeld, input.aimingDownSights]).toEqual([false, false]);
  });
  it('delivers a crouch-toggle request once to the simulation consumer', () => {
    const { input } = fixture();
    input.requestCrouchToggle();
    expect(input.consumeCrouchToggle()).toBe(true);
    expect(input.consumeCrouchToggle()).toBe(false);
    input.requestCrouchToggle();
    input.cancel();
    expect(input.consumeCrouchToggle()).toBe(false);
  });
  it('clamps the virtual menu cursor to its viewport', () => {
    const { input } = fixture();
    input.menuPointer = true;
    input.moveMenuCursor(24, -12);
    expect([input.cursorX, input.cursorY]).toEqual([344, 228]);
    expect(nextMenuCursor({ x: 99, y: 79 }, { x: 10, y: 10 }, { width: 100, height: 80 })).toEqual({ x: 99, y: 79 });
    expect(nextMenuCursor({ x: 0, y: 0 }, { x: -10, y: -10 }, { width: 100, height: 80 })).toEqual({ x: 0, y: 0 });
  });
});
