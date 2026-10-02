import { describe, expect, it } from 'vitest';
import { scrollPanelByWheel, wheelPixels, wheelScrollsPanel } from '../src/debug/wheel.ts';
import { computeMenuState } from '../src/ui/menuState.ts';

const panel = (scrollHeight: number, clientHeight: number) => ({ scrollTop: 0, scrollHeight, clientHeight });
const PIXELS = { deltaY: 100, deltaMode: 0 };

describe('debug panel wheel routing', () => {
  it('scrolls only when the pointer is locked, the panel is open and it overflows', () => {
    const base = { locked: true, panelOpen: true, overflows: true };
    expect(wheelScrollsPanel(base)).toBe(true);
    expect(wheelScrollsPanel({ ...base, locked: false })).toBe(false);
    expect(wheelScrollsPanel({ ...base, panelOpen: false })).toBe(false);
    expect(wheelScrollsPanel({ ...base, overflows: false })).toBe(false);
  });

  it('leaves the wheel to the build mode and the main menu: the open panel is the only state it takes over', () => {
    // play.ts delivers the build wheel only when no menu holds the pointer, and scrolls the card for the main menu.
    const flags = { started: true, inventoryOpen: false, pointerLocked: true, dead: false };
    const panelOpen = computeMenuState({ ...flags, mainMenuOpen: false, debugMenuOpen: true });
    expect(panelOpen.menuPointer).toBe(true);
    const building = computeMenuState({ ...flags, mainMenuOpen: false, debugMenuOpen: false });
    expect(building.menuPointer).toBe(false);
    // Opening the main menu (or unlocking) closes the panel, so panelOpen is false there.
    const unlocked = computeMenuState({
      ...flags,
      pointerLocked: false,
      pointerLockChanged: true,
      mainMenuOpen: false,
      debugMenuOpen: true,
    });
    expect(unlocked.mainMenuOpen).toBe(true);
    expect(unlocked.debugMenuOpen).toBe(false);
  });

  it('scrolls the panel by the wheel and consumes the event only when it scrolled', () => {
    const tall = panel(900, 400);
    expect(scrollPanelByWheel(tall, true, true, PIXELS)).toBe(true);
    expect(tall.scrollTop).toBe(100);
    expect(scrollPanelByWheel(tall, true, true, { deltaY: -40, deltaMode: 0 })).toBe(true);
    expect(tall.scrollTop).toBe(60);

    const fits = panel(300, 400);
    expect(scrollPanelByWheel(fits, true, true, PIXELS)).toBe(false);
    expect(fits.scrollTop).toBe(0);
    expect(scrollPanelByWheel(tall, false, true, PIXELS)).toBe(false);
    expect(scrollPanelByWheel(tall, true, false, PIXELS)).toBe(false);
    expect(scrollPanelByWheel(null, true, true, PIXELS)).toBe(false);
    expect(tall.scrollTop).toBe(60);
  });

  it('converts line and page wheel units to pixels', () => {
    expect(wheelPixels(3, 1, 400)).toBe(48);
    expect(wheelPixels(1, 2, 400)).toBe(400);
    expect(wheelPixels(120, 0, 400)).toBe(120);
  });
});
