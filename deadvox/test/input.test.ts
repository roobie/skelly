import { describe, expect, it } from 'vitest';
import { Input, isMenuOpeningKey, KEY_BINDINGS, nextMenuCursor, worldActionForKey } from '../src/game/input.ts';

describe('menu input', () => {
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
    const target = {} as HTMLElement;
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

  it('moves the menu cursor and clamps it to the viewport', () => {
    expect(nextMenuCursor({ x: 20, y: 30 }, { x: 5, y: -8 }, { width: 100, height: 80 })).toEqual({ x: 25, y: 22 });
    expect(nextMenuCursor({ x: 99, y: 79 }, { x: 10, y: 10 }, { width: 100, height: 80 })).toEqual({ x: 99, y: 79 });
    expect(nextMenuCursor({ x: 0, y: 0 }, { x: -10, y: -10 }, { width: 100, height: 80 })).toEqual({ x: 0, y: 0 });
  });
});
