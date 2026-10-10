import { describe, expect, it } from 'vitest';
import { BACKQUOTE_DOUBLE_TAP_WINDOW_MS, BackquoteOrbitGesture } from '../src/game/backquoteOrbitGesture.ts';
import { INPUT_BINDINGS } from '../src/game/inputBindings.ts';
import { isOrbitResetMovementAction, ThirdPersonOrbit } from '../src/game/thirdPersonOrbit.ts';

const hintHoldMs = INPUT_BINDINGS.find(({ id }) => id === 'hud.toggle-interaction-hints')?.holdMs ?? 0;

const gestureFixture = () => {
  const orbit = new ThirdPersonOrbit();
  const hudToggles: number[] = [];
  const panelToggles: number[] = [];
  const gesture = new BackquoteOrbitGesture({
    holdRealMs: hintHoldMs,
    orbit,
    canToggleHud: () => true,
    toggleHud: () => hudToggles.push(1),
    toggleDebugPanel: () => panelToggles.push(1),
  });
  return { gesture, orbit, hudToggles, panelToggles };
};

describe('third-person orbit', () => {
  it('resets orbit only after a walk direction, not sprint, walk-toggle or jump', () => {
    for (const action of ['movement.forward', 'movement.back', 'movement.left', 'movement.right']) {
      expect(isOrbitResetMovementAction(action)).toBe(true);
    }
    for (const action of ['movement.sprint', 'movement.walk-toggle', 'movement.jump']) {
      expect(isOrbitResetMovementAction(action)).toBe(false);
    }
  });

  it('allows movement while held but resets on movement after release', () => {
    const orbit = new ThirdPersonOrbit();
    orbit.begin(0);
    orbit.rotate(80, 0, true);
    const rotated = orbit.angle(true);
    orbit.movementInput();
    expect(orbit.angle(true)).toEqual(rotated);
    orbit.release();
    orbit.movementInput();
    expect(orbit.angle(true)).toBeUndefined();
  });

  it('maps a plain press-and-hold to the HUD toggle', () => {
    expect(hintHoldMs).toBeGreaterThan(0);
    const { gesture, orbit, hudToggles, panelToggles } = gestureFixture();
    expect(gesture.keyDown(0, true, true, 0)).toBe(true);
    gesture.update(hintHoldMs - 1);
    expect(hudToggles).toEqual([]);
    gesture.update(hintHoldMs);
    expect(hudToggles).toEqual([1]);
    gesture.keyUp(hintHoldMs + 1);
    gesture.update(hintHoldMs + BACKQUOTE_DOUBLE_TAP_WINDOW_MS + 2);
    expect(panelToggles).toEqual([]);
    expect(orbit.angle(true)).toBeUndefined();
  });

  it('maps tap-then-hold to orbit and keeps the angle after release', () => {
    const { gesture, orbit, hudToggles, panelToggles } = gestureFixture();
    gesture.keyDown(0, true, true, 0.4);
    gesture.keyUp(10);
    const secondDown = 10 + BACKQUOTE_DOUBLE_TAP_WINDOW_MS;
    expect(gesture.keyDown(secondDown, true, true, 0.4)).toBe(true);
    expect(orbit.rotate(80, -20, true)).toBe(true);
    const rotated = orbit.angle(true);
    expect(rotated?.yaw).not.toBe(0.4);
    gesture.keyUp(secondDown + BACKQUOTE_DOUBLE_TAP_WINDOW_MS + 1);
    gesture.update(secondDown + 2 * BACKQUOTE_DOUBLE_TAP_WINDOW_MS + 2);
    expect(orbit.angle(true)).toEqual(rotated);
    expect(orbit.rotate(10, 0, true)).toBe(false);
    expect(hudToggles).toEqual([]);
    expect(panelToggles).toEqual([]);
  });

  it('maps tap-tap to follow-camera reset', () => {
    const { gesture, orbit } = gestureFixture();
    orbit.begin(0);
    orbit.rotate(80, 0, true);
    orbit.release();
    expect(orbit.angle(true)).toBeDefined();

    gesture.keyDown(0, true, true, 0.4);
    gesture.keyUp(10);
    const secondDown = 10 + BACKQUOTE_DOUBLE_TAP_WINDOW_MS;
    gesture.keyDown(secondDown, true, true, 0.4);
    gesture.keyUp(secondDown + BACKQUOTE_DOUBLE_TAP_WINDOW_MS);

    expect(orbit.angle(true)).toBeUndefined();
  });

  it('defers a single third-person tap briefly to preserve the debug-panel action', () => {
    const { gesture, orbit, hudToggles, panelToggles } = gestureFixture();
    gesture.keyDown(0, true, true, 0.4);
    gesture.keyUp(10);
    gesture.update(10 + BACKQUOTE_DOUBLE_TAP_WINDOW_MS);
    expect(panelToggles).toEqual([]);
    gesture.update(11 + BACKQUOTE_DOUBLE_TAP_WINDOW_MS);
    expect(panelToggles).toEqual([1]);
    expect(hudToggles).toEqual([]);
    expect(orbit.angle(true)).toBeUndefined();
  });

  it('keeps a plain tap inert when the debug gate was not held', () => {
    const { gesture, hudToggles, panelToggles } = gestureFixture();
    gesture.keyDown(0, true, false, 0.4);
    gesture.keyUp(10);
    gesture.update(11 + BACKQUOTE_DOUBLE_TAP_WINDOW_MS);
    expect(hudToggles).toEqual([]);
    expect(panelToggles).toEqual([]);
  });

  it('routes gated Backquote through the gesture and preserves other debug actions', () => {
    const { gesture, panelToggles } = gestureFixture();
    let handled = 0;
    const handleAction = (): void => {
      handled += 1;
    };
    gesture.routeDebugAction({
      action: 'debug.panel-toggle',
      at: 0,
      thirdPerson: true,
      facingYaw: 0.4,
      handleAction,
    });
    expect(handled).toBe(0);
    expect(
      gesture.routeInput('debug.panel-toggle', {
        phase: 'up',
        at: 10,
        thirdPerson: true,
        debugPanelAvailable: true,
        facingYaw: 0.4,
        fallback: handleAction,
      }),
    ).toBe(true);
    gesture.update(11 + BACKQUOTE_DOUBLE_TAP_WINDOW_MS);
    expect(panelToggles).toEqual([1]);

    gesture.routeDebugAction({
      action: 'debug.panel-toggle',
      at: 300,
      thirdPerson: false,
      facingYaw: 0.4,
      handleAction,
    });
    gesture.routeDebugAction({
      action: 'debug.performance-toggle',
      at: 310,
      thirdPerson: true,
      facingYaw: 0.4,
      handleAction,
    });
    expect(handled).toBe(2);
  });

  it('leaves first-person Backquote handling to its existing input path', () => {
    const { gesture, orbit, hudToggles, panelToggles } = gestureFixture();
    expect(gesture.keyDown(0, false, true, 0.4)).toBe(false);
    expect(gesture.keyUp(10)).toBe(false);
    gesture.update(10 + BACKQUOTE_DOUBLE_TAP_WINDOW_MS * 2);
    expect(hudToggles).toEqual([]);
    expect(panelToggles).toEqual([]);
    expect(orbit.angle(true)).toBeUndefined();
  });
});
