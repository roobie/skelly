import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input, nextMenuCursor } from '../src/game/input.ts';

const fixture = (allowed: () => boolean = () => true) => {
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
  const input = new Input(target, allowed);
  return { input, target, document, targetListeners, windowListeners };
};
afterEach(() => vi.unstubAllGlobals());

describe('pointer input', () => {
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
