import { describe, expect, it } from 'vitest';
import { computeMenuState, type MenuStateInput } from '../src/ui/menuState.ts';

const base: MenuStateInput = {
  started: false,
  mainMenuOpen: true,
  inventoryOpen: false,
  debugMenuOpen: false,
  pointerLocked: false,
  dead: false,
};

const cases: { name: string; input: MenuStateInput; expected: ReturnType<typeof computeMenuState> }[] = [
  {
    name: 'start: not started shows the overlay and pauses',
    input: base,
    expected: {
      started: false,
      mainMenuOpen: true,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: false,
      menuPointer: true,
      overlayHidden: false,
      paused: true,
      goLabel: 'Click to play',
    },
  },
  {
    name: 'locking the pointer after resume starts play',
    input: { ...base, mainMenuOpen: false, pointerLocked: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: false,
      menuPointer: false,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'Esc releases the pointer and restores the pause card',
    input: { ...base, started: true, mainMenuOpen: false },
    expected: {
      started: true,
      mainMenuOpen: true,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: true,
      menuPointer: true,
      overlayHidden: false,
      paused: true,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'F9 opens the main menu while locked',
    input: { ...base, started: true, pointerLocked: true },
    expected: {
      started: true,
      mainMenuOpen: true,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: false,
      menuPointer: true,
      overlayHidden: false,
      paused: true,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'F9 closes the main menu while locked',
    input: { ...base, started: true, mainMenuOpen: false, pointerLocked: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: false,
      menuPointer: false,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'inventory opens while pointer-locked',
    input: { ...base, started: true, mainMenuOpen: false, inventoryOpen: true, pointerLocked: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: true,
      debugMenuOpen: false,
      closeOtherMenus: false,
      menuPointer: true,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'inventory closes and locked play resumes',
    input: { ...base, started: true, mainMenuOpen: false, pointerLocked: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: false,
      menuPointer: false,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'debug menu forwards the drawn cursor without pausing play',
    input: { ...base, started: true, mainMenuOpen: false, debugMenuOpen: true, pointerLocked: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      debugMenuOpen: true,
      closeOtherMenus: false,
      menuPointer: true,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'death hides the pause overlay',
    input: { ...base, started: true, mainMenuOpen: false, dead: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: false,
      menuPointer: false,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'inventory plus released pointer returns to pause menu and closes inventory',
    input: { ...base, started: true, mainMenuOpen: false, inventoryOpen: true },
    expected: {
      started: true,
      mainMenuOpen: true,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: true,
      menuPointer: true,
      overlayHidden: false,
      paused: true,
      goLabel: 'Paused. Click to continue',
    },
  },
];

describe('menu and pause state transitions', () => {
  it.each(cases)('$name', ({ input, expected }) => {
    expect(computeMenuState(input)).toEqual(expected);
  });
});
