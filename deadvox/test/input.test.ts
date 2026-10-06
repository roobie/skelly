import { describe, expect, it, vi } from 'vitest';
import {
  CONTROL_CODES,
  Input,
  isMenuOpeningKey,
  KEY_BINDINGS,
  nextMenuCursor,
  restKindForControl,
  worldActionForKey,
} from '../src/game/input.ts';

describe('menu input', () => {
  it('keyboard controls expose sleep but no rest binding for R or dollar', () => {
    expect(restKindForControl('KeyR')).toBeUndefined();
    expect(restKindForControl('$')).toBeUndefined();
    expect(restKindForControl('KeyL')).toBe('sleep');
  });

  it('holds crouch on C and reserves Enter for continuing an interrupted action', () => {
    const descriptors = ['document', 'addEventListener'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
    );
    const listeners = new Map<string, (event: KeyboardEvent) => void>();
    const target = { addEventListener: () => undefined } as unknown as HTMLElement;
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: (type: string, listener: (event: KeyboardEvent) => void) => listeners.set(type, listener),
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { pointerLockElement: target, addEventListener: () => undefined },
    });
    try {
      const input = new Input(target);
      expect(CONTROL_CODES.crouch).toBe('KeyC');
      expect(CONTROL_CODES.continue).toBe('Enter');
      listeners.get('keydown')!({ code: CONTROL_CODES.crouch, repeat: false } as KeyboardEvent);
      expect(input.intent().crouch).toBe(true);
      listeners.get('keyup')!({ code: CONTROL_CODES.crouch } as KeyboardEvent);
      expect(input.intent().crouch).toBe(false);
      const preventDefault = vi.fn();
      listeners.get('keydown')!({
        code: CONTROL_CODES.continue,
        repeat: false,
        preventDefault,
      } as unknown as KeyboardEvent);
      expect(preventDefault).toHaveBeenCalledOnce();
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor);
        } else {
          Reflect.deleteProperty(globalThis, key);
        }
      }
    }
  });

  it('Backspace suppresses browser navigation in locked play but keeps menu text editing', () => {
    const listeners = new Map<string, (event: KeyboardEvent) => void>();
    const target = { addEventListener: () => undefined } as unknown as HTMLElement;
    vi.stubGlobal('addEventListener', (type: string, listener: (event: KeyboardEvent) => void) =>
      listeners.set(type, listener),
    );
    vi.stubGlobal('document', { pointerLockElement: target, addEventListener: () => undefined });
    try {
      const input = new Input(target);
      const preventDefault = vi.fn();
      const event = { code: 'Backspace', repeat: false, preventDefault } as unknown as KeyboardEvent;
      listeners.get('keydown')!(event);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      input.menuPointer = true;
      listeners.get('keydown')!(event);
      expect(preventDefault).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('surfaces a native pointer-lock promise rejection without an unhandled rejection', async () => {
    const error = new Error('The browser failed to lock the pointer');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const input = Object.create(Input.prototype) as Input;
    Object.assign(input, { target: { requestPointerLock: () => Promise.reject(error) } });
    try {
      input.lock();
      await Promise.resolve();
      expect(warn).toHaveBeenCalledWith('Pointer lock request failed', error);
    } finally {
      warn.mockRestore();
    }
  });

  it('identifies G as the opening key so its text default can be cancelled', () => {
    expect(isMenuOpeningKey('KeyG', true, false)).toBe(true);
    expect(isMenuOpeningKey('KeyG', true, true)).toBe(false);
    expect(isMenuOpeningKey('KeyG', false, false)).toBe(false);
    expect(isMenuOpeningKey(KEY_BINDINGS.mainMenu.code, true, false)).toBe(false);
    expect(isMenuOpeningKey(KEY_BINDINGS.browserMenuBar.code, true, false)).toBe(false);
  });

  it('binds world interaction to F and leaves Q and E unbound', () => {
    expect(worldActionForKey('KeyF')).toBe('interact');
    expect(worldActionForKey('KeyQ')).toBeUndefined();
    expect(worldActionForKey('KeyE')).toBeUndefined();
  });

  it('moves only the menu cursor while pointer lock is held', () => {
    const descriptors = ['document', 'innerWidth', 'innerHeight', 'addEventListener'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
    );
    const target = { addEventListener: () => undefined } as unknown as HTMLElement;
    let mousemove: ((event: MouseEvent) => void) | undefined;
    const documentStub = {
      pointerLockElement: target,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'mousemove') {
          mousemove = listener as (event: MouseEvent) => void;
        }
      },
    } as unknown as Document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentStub });
    Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 640 });
    Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 480 });
    Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: () => undefined });
    try {
      const input = new Input(target);
      input.menuPointer = true;
      input.yaw = 0.7;
      input.pitch = -0.3;
      input.moveMenuCursor(24, -12);
      const mouseEvent = new Event('mousemove') as MouseEvent;
      Object.defineProperties(mouseEvent, { movementX: { value: 24 }, movementY: { value: -12 } });
      mousemove?.(mouseEvent);
      expect({ x: input.cursorX, y: input.cursorY }).toEqual({ x: 344, y: 228 });
      expect({ yaw: input.yaw, pitch: input.pitch }).toEqual({ yaw: 0.7, pitch: -0.3 });
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor);
        } else {
          Reflect.deleteProperty(globalThis, key);
        }
      }
    }
  });

  it('does not queue primary clicks rejected at press time', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener');
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const targetListeners = new Map<string, EventListener>();
    const target = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          targetListeners.set(type, listener);
        }
      },
    } as unknown as HTMLElement;
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { pointerLockElement: target, addEventListener: () => undefined },
    });
    let primaryActionAllowed = false;
    try {
      const input = new Input(target, () => primaryActionAllowed);
      targetListeners.get('mousedown')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominant).toBe(false);
      expect(input.intent().useDominantHeld).toBe(false);
      primaryActionAllowed = true;
      expect(input.intent().useDominant).toBe(false);
      targetListeners.get('mousedown')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominant).toBe(true);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'addEventListener', original);
      } else {
        Reflect.deleteProperty(globalThis, 'addEventListener');
      }
      if (originalDocument) {
        Object.defineProperty(globalThis, 'document', originalDocument);
      } else {
        Reflect.deleteProperty(globalThis, 'document');
      }
    }
  });

  it('tracks held right mouse for the ready stance and clears it on release or blur', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener');
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const windowListeners = new Map<string, EventListener>();
    const targetListeners = new Map<string, EventListener>();
    const target = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          targetListeners.set(type, listener);
        }
      },
    } as unknown as HTMLElement;
    Object.defineProperty(globalThis, 'addEventListener', {
      configurable: true,
      value: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          windowListeners.set(type, listener);
        }
      },
    });
    const documentStub: { addEventListener: () => undefined; pointerLockElement: HTMLElement | null } = {
      addEventListener: () => undefined,
      pointerLockElement: target,
    };
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: documentStub,
    });
    try {
      const input = new Input(target);
      documentStub.pointerLockElement = null;
      targetListeners.get('mousedown')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominant).toBe(false);
      windowListeners.get('keydown')?.({ code: KEY_BINDINGS.useOff.code, repeat: false } as KeyboardEvent);
      expect(input.intent().useOff).toBe(false);
      windowListeners.get('keyup')?.({ code: KEY_BINDINGS.useOff.code } as KeyboardEvent);
      windowListeners.get('mouseup')?.({ button: 0 } as MouseEvent);
      documentStub.pointerLockElement = target;
      input.menuPointer = true;
      targetListeners.get('mousedown')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominant).toBe(false);
      windowListeners.get('keydown')?.({ code: KEY_BINDINGS.useOff.code, repeat: false } as KeyboardEvent);
      expect(input.intent().useOff).toBe(false);
      windowListeners.get('keyup')?.({ code: KEY_BINDINGS.useOff.code } as KeyboardEvent);
      windowListeners.get('mouseup')?.({ button: 0 } as MouseEvent);
      input.menuPointer = false;
      targetListeners.get('mousedown')?.({ button: 2 } as MouseEvent);
      expect(input.rightMouseHeld).toBe(true);
      windowListeners.get('mouseup')?.({ button: 2 } as MouseEvent);
      expect(input.rightMouseHeld).toBe(false);
      targetListeners.get('mousedown')?.({ button: 2 } as MouseEvent);
      windowListeners.get('blur')?.(new Event('blur'));
      expect(input.rightMouseHeld).toBe(false);
      input.menuPointer = true;
      targetListeners.get('mousedown')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominant).toBe(false);
      windowListeners.get('mouseup')?.({ button: 0 } as MouseEvent);
      input.menuPointer = false;
      targetListeners.get('mousedown')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominant).toBe(true);
      input.consumeDominantUse();
      expect(input.intent().useDominant).toBe(false);
      expect(input.intent().useDominantHeld).toBe(true);
      windowListeners.get('keydown')?.({ code: KEY_BINDINGS.useOff.code, repeat: false } as KeyboardEvent);
      expect(input.intent().useOff).toBe(true);
      input.consumeOffUse();
      expect(input.intent().useOff).toBe(false);
      windowListeners.get('keydown')?.({ code: KEY_BINDINGS.useOff.code, repeat: true } as KeyboardEvent);
      expect(input.intent().useOff).toBe(false);
      windowListeners.get('keyup')?.({ code: KEY_BINDINGS.useOff.code } as KeyboardEvent);
      windowListeners.get('keydown')?.({ code: KEY_BINDINGS.useOff.code, repeat: false } as KeyboardEvent);
      expect(input.intent().useOff).toBe(true);
      targetListeners.get('mousedown')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominant).toBe(false);
      windowListeners.get('mouseup')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominantHeld).toBe(false);
      targetListeners.get('mousedown')?.({ button: 0 } as MouseEvent);
      expect(input.intent().useDominant).toBe(true);
      windowListeners.get('blur')?.(new Event('blur'));
      expect(input.intent().useDominantHeld).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'addEventListener', original);
      } else {
        Reflect.deleteProperty(globalThis, 'addEventListener');
      }
      if (originalDocument) {
        Object.defineProperty(globalThis, 'document', originalDocument);
      } else {
        Reflect.deleteProperty(globalThis, 'document');
      }
    }
  });

  it('moves the menu cursor and clamps it to the viewport', () => {
    expect(nextMenuCursor({ x: 20, y: 30 }, { x: 5, y: -8 }, { width: 100, height: 80 })).toEqual({ x: 25, y: 22 });
    expect(nextMenuCursor({ x: 99, y: 79 }, { x: 10, y: 10 }, { width: 100, height: 80 })).toEqual({ x: 99, y: 79 });
    expect(nextMenuCursor({ x: 0, y: 0 }, { x: -10, y: -10 }, { width: 100, height: 80 })).toEqual({ x: 0, y: 0 });
  });
});
