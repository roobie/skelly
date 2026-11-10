import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelDef } from '../src/engine/content.ts';
import { makeScale } from '../src/engine/world.ts';
import { BindingRegistry } from '../src/game/bindingRegistry.ts';
import { firearmBoreRay } from '../src/game/firearmAim.ts';
import { Input, nextMenuCursor, requestInputLock } from '../src/presentation/input.ts';
import { KeyboardInput, shouldCancelInputForViewerFocus } from '../src/presentation/inputBindings.ts';
import { INPUT_BINDINGS } from '../src/product/controls.ts';
import { baseRegistry } from './baseRegistry.ts';
import { createPlayerBody, PLAYER, steer } from './playerFixture.ts';

const keyboardInput = new KeyboardInput(new BindingRegistry(INPUT_BINDINGS));

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
      input.controls.rightMouseHeld = phase === 'down';
      if (phase === 'up') {
        input.controls.aimingDownSights = false;
      }
    } else if (action === 'aim.ads-toggle' && phase === 'down') {
      input.controls.toggleAimingDownSights();
    } else if (action === 'view.free-look' && phase === 'down') {
      input.controls.startFreeLook();
    }
  };
  input = new Input(target, keyboardInput, { dominantUseAllowed: allowed, viewerInputAllowed });
  input.setLookSensitivity(1, () => 1);
  input.controls.setFreeLook(PLAYER.aim.freeLook, () => input.controls.aimingDownSights);
  keyboardInput.cancelled = (preservePointer) => input.controls.cancel(preservePointer);
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
    const intent = input.controls.intent();
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
        yaw: input.controls.yaw,
        pitch: input.controls.pitch,
        blockSize: scale.blockSize,
        side: 'right',
        leadingSide: 'right',
        twoHanded: false,
        aimFrame: { yaw: 0, pitch: 0 },
        progress: 1,
        loweredPitchRadians: 0.5,
      });
    const bodyBore = bore();
    steer(before, scale, input.controls.yaw, intent);
    keyboardInput.press(key('AltLeft', true));
    documentListeners.get('mousemove')!({ movementX: 100, movementY: -50 } as MouseEvent);
    steer(after, scale, input.controls.yaw, input.controls.intent());
    expect(input.controls.freeLooking).toBe(true);
    expect(input.controls.viewYaw).not.toBe(input.controls.yaw);
    expect(input.controls.viewPitch).not.toBe(input.controls.pitch);
    expect(input.controls.intent()).toEqual(intent);
    expect(after.vel).toEqual(before.vel);
    expect(bore()).toEqual(bodyBore);
    expect(Math.abs(input.controls.freeLook.yaw)).toBeLessThanOrEqual(PLAYER.aim.freeLook.yawLimitRadians);
    expect(Math.abs(input.controls.freeLook.pitch)).toBeLessThanOrEqual(PLAYER.aim.freeLook.pitchLimitRadians);
    keyboardInput.release(key('AltLeft'));
    input.controls.advanceFreeLook(0.01);
    const returning = Math.abs(input.controls.freeLook.yaw);
    expect(returning).toBeLessThan(PLAYER.aim.freeLook.yawLimitRadians);
    input.controls.advanceFreeLook(
      (PLAYER.aim.freeLook.yawLimitRadians + PLAYER.aim.freeLook.pitchLimitRadians) /
        PLAYER.aim.freeLook.returnRadiansPerRealSecond,
    );
    expect(input.controls.freeLooking).toBe(false);
    expect(input.controls.viewYaw).toBe(input.controls.yaw);
    expect(input.controls.viewPitch).toBe(input.controls.pitch);
    expect(input.controls.freeLook.yaw).toBe(0);
    expect(input.controls.freeLook.pitch).toBe(0);
    keyboardInput.release(key('KeyW'));
  });
  it('ends sights when free look starts in ADS and stays at hip after release', () => {
    const { input, targetListeners, documentListeners } = fixture();
    targetListeners.get('mousedown')!({ button: 2 } as MouseEvent);
    input.controls.toggleAimingDownSights();
    expect(input.controls.aimingDownSights).toBe(true);
    keyboardInput.press(key('AltLeft', true));
    expect(input.controls.aimingDownSights).toBe(false);
    const before = input.controls.yaw;
    documentListeners.get('mousemove')!({ movementX: 0.1, movementY: 0 } as MouseEvent);
    expect(input.controls.yaw).toBe(before);
    expect(input.controls.freeLooking).toBe(true);
    keyboardInput.release(key('AltLeft'));
    input.controls.advanceFreeLook(0);
    expect(input.controls.freeLooking).toBe(false);
    expect(input.controls.aimingDownSights).toBe(false);
  });
  it.each(['blur', 'pointerlockchange'] as const)('ends free look on %s without waiting for Alt release', (reason) => {
    const { input, document, documentListeners, windowListeners } = fixture();
    keyboardInput.press(key('AltLeft', true));
    documentListeners.get('mousemove')!({ movementX: 1, movementY: 1 } as MouseEvent);
    expect(input.controls.freeLooking).toBe(true);
    if (reason === 'blur') {
      windowListeners.get('blur')!({} as MouseEvent);
      keyboardInput.windowBlurred();
    } else {
      document.pointerLockElement = null;
      documentListeners.get('pointerlockchange')!({} as MouseEvent);
      keyboardInput.cancel();
    }
    expect(input.controls.freeLook.active).toBe(false);
    expect(input.controls.viewYaw).toBe(input.controls.yaw);
    expect(input.controls.viewPitch).toBe(input.controls.pitch);
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
    input.controls.yaw = 0.8;
    input.controls.pitch = -0.2;
    const orbitLook = vi.fn(() => true);
    input.setMouseLookOverride(orbitLook);

    documentListeners.get('mousemove')!({ movementX: 30, movementY: -12 } as MouseEvent);

    expect(orbitLook).toHaveBeenCalledExactlyOnceWith(30, -12);
    expect(input.controls.yaw).toBe(0.8);
    expect(input.controls.pitch).toBe(-0.2);
  });
  it('scales look by applied optic power on each mouse event', () => {
    const { input, target, document, documentListeners } = fixture();
    document.pointerLockElement = target;
    let power = 1;
    input.setLookSensitivity(1, () => power);
    const turn = () => {
      input.controls.yaw = 0;
      documentListeners.get('mousemove')!({ movementX: 10, movementY: 0 } as MouseEvent);
      return Math.abs(input.controls.yaw);
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
      input.controls.rightMouseHeld = true;
      input.controls.suppressRightMouseUntilRelease();
      const read = () => ({
        rightMousePressed: input.controls.consumeRightMousePressed(),
        rightMouseSuppressed: input.controls.rightMouseHeld && !input.controls.rightMouseActionHeld,
        dominantUsePressed: input.controls.intent().useDominant,
        dominantUseDown: input.controls.dominantUseHeld,
        yaw: input.controls.yaw,
        pitch: input.controls.pitch,
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
    expect(input.controls.intent().useDominantHeld).toBe(false);
    allowed = true;
    expect(input.controls.intent().useDominant).toBe(false);
    targetListeners.get('mousedown')!({ button: 0 } as MouseEvent);
    expect(input.controls.intent().useDominant).toBe(true);
  });
  it('admits hand uses only in locked play and clears presses, holds and ready stance on cancellation', () => {
    const { input, document, target, targetListeners, windowListeners } = fixture();
    document.pointerLockElement = null;
    input.controls.useOff();
    targetListeners.get('mousedown')!({ button: 0 } as MouseEvent);
    expect(input.controls.intent().useOff).toBe(false);
    expect(input.controls.intent().useDominant).toBe(false);
    document.pointerLockElement = target;
    input.menuPointer = true;
    input.controls.useOff();
    expect(input.controls.intent().useOff).toBe(false);
    input.menuPointer = false;
    input.controls.useOff();
    targetListeners.get('mousedown')!({ button: 0 } as MouseEvent);
    targetListeners.get('mousedown')!({ button: 2 } as MouseEvent);
    expect(input.controls.intent()).toMatchObject({ useOff: true, useDominant: true, useDominantHeld: true });
    expect(input.controls.rightMouseHeld).toBe(true);
    input.controls.consumeOffUse();
    input.controls.consumeDominantUse();
    expect(input.controls.intent()).toMatchObject({ useOff: false, useDominant: false, useDominantHeld: true });
    windowListeners.get('mouseup')!({ button: 2 } as MouseEvent);
    expect(input.controls.rightMouseHeld).toBe(false);
    windowListeners.get('blur')!(new Event('blur') as MouseEvent);
    expect(input.controls.intent().useDominantHeld).toBe(false);
  });
  it('suppresses ready and aim actions from the right-click that cancels a glowstick charge', () => {
    const { input, targetListeners, windowListeners } = fixture();
    targetListeners.get('mousedown')!({ button: 2, timeStamp: 1 } as MouseEvent);
    expect(input.controls.rightMouseActionHeld).toBe(true);
    expect(input.controls.consumeRightMousePressed()).toBe(true);
    input.controls.suppressRightMouseUntilRelease();
    expect(input.controls.rightMouseHeld).toBe(true);
    expect(input.controls.rightMouseActionHeld).toBe(false);
    expect(input.controls.consumeRightMousePressed()).toBe(false);
    windowListeners.get('mouseup')!({ button: 2, timeStamp: 2 } as MouseEvent);
    expect(input.controls.rightMouseActionHeld).toBe(false);
    targetListeners.get('mousedown')!({ button: 2, timeStamp: 3 } as MouseEvent);
    expect(input.controls.rightMouseActionHeld).toBe(true);
  });
  it('toggles sight alignment only while the ready stance is held', () => {
    const { input, targetListeners, windowListeners } = fixture();
    const down = targetListeners.get('mousedown')!;
    const up = windowListeners.get('mouseup')!;
    down({ button: 1 } as MouseEvent);
    expect(input.controls.aimingDownSights).toBe(false);
    up({ button: 1 } as MouseEvent);
    down({ button: 2 } as MouseEvent);
    down({ button: 1 } as MouseEvent);
    expect(input.controls.aimingDownSights).toBe(true);
    up({ button: 1 } as MouseEvent);
    down({ button: 1 } as MouseEvent);
    expect(input.controls.aimingDownSights).toBe(false);
    up({ button: 1 } as MouseEvent);
    input.controls.setAimingDownSightsAllowed(() => false);
    down({ button: 1 } as MouseEvent);
    expect(input.controls.aimingDownSights).toBe(false);
    up({ button: 1 } as MouseEvent);
    up({ button: 2 } as MouseEvent);
    expect(input.controls.aimingDownSights).toBe(false);
  });
  it('keeps ready and ADS active when F2 enables debug controls', () => {
    const { input, targetListeners, windowListeners } = fixture();
    keyboardInput.context = () => ({ context: 'play', debug: true });
    const down = targetListeners.get('mousedown')!;
    down({ button: 2, timeStamp: 1 } as MouseEvent);
    down({ button: 1, timeStamp: 2 } as MouseEvent);
    windowListeners.get('mouseup')!({ button: 1, timeStamp: 3 } as MouseEvent);
    expect([input.controls.rightMouseHeld, input.controls.aimingDownSights]).toEqual([true, true]);

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
    expect([
      input.controls.rightMouseHeld,
      input.controls.aimingDownSights,
      keyboardInput.held('stance.ready'),
    ]).toEqual([true, true, true]);
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
    expect([input.controls.rightMouseHeld, input.controls.aimingDownSights]).toEqual([false, false]);
  });
  it('delivers a stance-toggle request once to the simulation consumer', () => {
    const { input } = fixture();
    input.controls.requestStanceToggle('prone');
    expect(input.controls.consumeStanceToggle()).toBe('prone');
    expect(input.controls.consumeStanceToggle()).toBeUndefined();
    input.controls.requestStanceToggle('crouch');
    input.controls.cancel();
    expect(input.controls.consumeStanceToggle()).toBeUndefined();
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
