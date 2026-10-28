import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelDef } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import { firearmBoreRay } from '../src/game/firearmAim.ts';
import { Input, nextMenuCursor, requestInputLock } from '../src/game/input.ts';
import { keyboardInput, shouldCancelInputForViewerFocus } from '../src/game/inputBindings.ts';
import { baseRegistry } from './baseRegistry.ts';
import { createPlayerBody, PLAYER, steer } from './playerFixture.ts';

const fixture = (allowed: () => boolean = () => true, viewerInputAllowed: () => boolean = () => true) => {
  const targetListeners = new Map<string, (event: MouseEvent) => void>();
  const windowListeners = new Map<string, (event: MouseEvent) => void>();
  const target = {
    addEventListener: (type: string, listener: (event: MouseEvent) => void) => targetListeners.set(type, listener),
    requestPointerLock: vi.fn<() => Promise<void>>(),
  } as unknown as HTMLElement;
  const documentListeners = new Map<string, (event: MouseEvent) => void>();
  const document = {
    pointerLockElement: target as HTMLElement | null,
    addEventListener: (type: string, listener: (event: MouseEvent) => void) => documentListeners.set(type, listener),
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
  input.setLookSensitivity(1, () => 1);
  input.setFreeLook(PLAYER.aim.freeLook, () => input.aimingDownSights);
  keyboardInput.cancelled = (preservePointer) => input.cancel(preservePointer);
  return { input, target, document, targetListeners, windowListeners, documentListeners };
};
afterEach(() => {
  keyboardInput.release(key('AltLeft'));
  keyboardInput.release(key('KeyW'));
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

const key = (code: string, altKey = false) => ({
  code,
  altKey,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  timeStamp: 0,
});

describe('pointer input', () => {
  it('turns only the head while free look leaves movement heading unchanged, then returns to the body', () => {
    const { input, documentListeners } = fixture();
    const scale = makeScale(0.5);
    const before = createPlayerBody(scale, 0, 0, 0);
    const after = createPlayerBody(scale, 0, 0, 0);
    keyboardInput.press(key('KeyW'));
    const intent = input.intent();
    const bore = () =>
      firearmBoreRay({
        model: {
          hold: 'upright',
          grip: { at: [0, 0, 0] },
          anchors: { muzzle: [0, 0, 0] },
          gun: { muzzleDirection: [0, 0, -1] },
        } as unknown as ModelDef,
        holds: baseRegistry().figures.get('player')!.holds,
        eye: [0, 2, 0],
        yaw: input.yaw,
        pitch: input.pitch,
        blockSize: scale.blockSize,
        side: 'right',
        leadingSide: 'right',
        twoHanded: false,
        aimFrame: { yaw: 0, pitch: 0 },
        progress: 1,
        loweredPitchRadians: 0.5,
      });
    const bodyBore = bore();
    steer(before, scale, input.yaw, intent);
    keyboardInput.press(key('AltLeft', true));
    documentListeners.get('mousemove')!({ movementX: 100, movementY: -50 } as MouseEvent);
    steer(after, scale, input.yaw, input.intent());
    expect(input.freeLooking).toBe(true);
    expect(input.viewYaw).not.toBe(input.yaw);
    expect(input.viewPitch).not.toBe(input.pitch);
    expect(input.intent()).toEqual(intent);
    expect(after.vel).toEqual(before.vel);
    expect(bore()).toEqual(bodyBore);
    expect(Math.abs(input.freeLook.yaw)).toBeLessThanOrEqual(PLAYER.aim.freeLook.yawLimitRadians);
    expect(Math.abs(input.freeLook.pitch)).toBeLessThanOrEqual(PLAYER.aim.freeLook.pitchLimitRadians);
    keyboardInput.release(key('AltLeft'));
    input.advanceFreeLook(0.01);
    const returning = Math.abs(input.freeLook.yaw);
    expect(returning).toBeLessThan(PLAYER.aim.freeLook.yawLimitRadians);
    input.advanceFreeLook(
      (PLAYER.aim.freeLook.yawLimitRadians + PLAYER.aim.freeLook.pitchLimitRadians) /
        PLAYER.aim.freeLook.returnRadiansPerRealSecond,
    );
    expect(input.freeLooking).toBe(false);
    expect(input.viewYaw).toBe(input.yaw);
    expect(input.viewPitch).toBe(input.pitch);
    expect(input.freeLook.yaw).toBe(0);
    expect(input.freeLook.pitch).toBe(0);
    keyboardInput.release(key('KeyW'));
  });
  it('ignores free look while sights are toggled on', () => {
    const { input, targetListeners, documentListeners } = fixture();
    targetListeners.get('mousedown')!({ button: 2 } as MouseEvent);
    input.toggleAimingDownSights();
    expect(input.aimingDownSights).toBe(true);
    keyboardInput.press(key('AltLeft', true));
    const before = input.yaw;
    documentListeners.get('mousemove')!({ movementX: 0.1, movementY: 0 } as MouseEvent);
    expect(input.yaw).not.toBe(before);
    expect(input.freeLooking).toBe(false);
    expect(input.viewYaw).toBe(input.yaw);
  });
  it.each(['blur', 'pointerlockchange'] as const)('ends free look on %s without waiting for Alt release', (reason) => {
    const { input, document, documentListeners, windowListeners } = fixture();
    keyboardInput.press(key('AltLeft', true));
    documentListeners.get('mousemove')!({ movementX: 1, movementY: 1 } as MouseEvent);
    expect(input.freeLooking).toBe(true);
    if (reason === 'blur') {
      windowListeners.get('blur')!({} as MouseEvent);
      keyboardInput.windowBlurred();
    } else {
      document.pointerLockElement = null;
      documentListeners.get('pointerlockchange')!({} as MouseEvent);
      keyboardInput.cancel();
    }
    expect(input.freeLook.active).toBe(false);
    expect(input.viewYaw).toBe(input.yaw);
    expect(input.viewPitch).toBe(input.pitch);
    expect(keyboardInput.held('view.free-look')).toBe(false);
  });
  it('cancels each viewer-focus reason live but not during replay', () => {
    for (const reason of ['window-blur', 'document-hidden', 'pointer-lock-lost', 'modifier-state-lost'] as const) {
      expect(shouldCancelInputForViewerFocus(reason, false)).toBe(true);
      expect(shouldCancelInputForViewerFocus(reason, true)).toBe(false);
    }
    expect(shouldCancelInputForViewerFocus('context-change', true)).toBe(true);
    expect(shouldCancelInputForViewerFocus('manual', true)).toBe(true);
  });
  it('routes orbit mouse movement without changing player look', () => {
    const { input, target, document, documentListeners } = fixture();
    document.pointerLockElement = target;
    input.yaw = 0.8;
    input.pitch = -0.2;
    const orbitLook = vi.fn(() => true);
    input.setMouseLookOverride(orbitLook);

    documentListeners.get('mousemove')!({ movementX: 30, movementY: -12 } as MouseEvent);

    expect(orbitLook).toHaveBeenCalledExactlyOnceWith(30, -12);
    expect(input.yaw).toBe(0.8);
    expect(input.pitch).toBe(-0.2);
  });
  it('scales look by applied optic power on each mouse event', () => {
    const { input, target, document, documentListeners } = fixture();
    document.pointerLockElement = target;
    let power = 1;
    input.setLookSensitivity(1, () => power);
    const turn = () => {
      input.yaw = 0;
      documentListeners.get('mousemove')!({ movementX: 10, movementY: 0 } as MouseEvent);
      return Math.abs(input.yaw);
    };

    const unaimed = turn();
    expect(turn()).toBe(unaimed);
    power = 2;
    const magnified = turn();
    expect(magnified).toBeLessThan(unaimed);
    power = 3;
    expect(turn()).toBeLessThan(magnified);
  });
  it('surfaces native pointer-lock refusal without an unhandled rejection', async () => {
    const { input, target, document } = fixture();
    document.pointerLockElement = null;
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
  it('shares the gesture-time lock request with entry and permits a later fresh gesture after release', async () => {
    const { input, target, document } = fixture();
    document.pointerLockElement = null;
    let grant!: () => void;
    vi.mocked(target.requestPointerLock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          grant = resolve;
        }),
    );

    const pending = requestInputLock(target);
    expect(target.requestPointerLock).toHaveBeenCalledOnce();
    input.lock();
    expect(target.requestPointerLock).toHaveBeenCalledOnce();
    document.pointerLockElement = target;
    grant();
    await pending;
    input.lock();
    expect(target.requestPointerLock).toHaveBeenCalledOnce();

    document.pointerLockElement = null;
    input.lock();
    expect(target.requestPointerLock).toHaveBeenCalledTimes(2);
    grant();
    await requestInputLock(target);
  });
  it('ignores viewer mouse transitions and look when the viewer is suppressed while live input remains admitted', () => {
    const run = (viewerAllowed: boolean, locked: boolean) => {
      const allowed = viewerAllowed;
      const { input, target, document, targetListeners, windowListeners, documentListeners } = fixture(
        () => true,
        () => allowed,
      );
      document.pointerLockElement = locked ? target : null;
      input.rightMouseHeld = true;
      input.suppressRightMouseUntilRelease();
      const read = () => ({
        rightMousePressed: input.consumeRightMousePressed(),
        rightMouseSuppressed: input.rightMouseHeld && !input.rightMouseActionHeld,
        dominantUsePressed: input.intent().useDominant,
        dominantUseDown: input.dominantUseHeld,
        yaw: input.yaw,
        pitch: input.pitch,
      });
      type MouseState = ReturnType<typeof read>;
      const initial = read();
      const transitions: MouseState[] = [];
      for (const button of [0, 1, 2]) {
        targetListeners.get('mousedown')!({ button } as MouseEvent);
        transitions.push(read());
        windowListeners.get('mouseup')!({ button } as MouseEvent);
        documentListeners.get('mousemove')!({ movementX: 10, movementY: 5 } as MouseEvent);
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
        expect(live.transitions.some((state) => state.yaw !== live.initial.yaw)).toBe(true);
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
  it('delivers a stance-toggle request once to the simulation consumer', () => {
    const { input } = fixture();
    input.requestStanceToggle('prone');
    expect(input.consumeStanceToggle()).toBe('prone');
    expect(input.consumeStanceToggle()).toBeUndefined();
    input.requestStanceToggle('crouch');
    input.cancel();
    expect(input.consumeStanceToggle()).toBeUndefined();
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
