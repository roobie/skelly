import { describe, expect, it } from 'vitest';
import { computeMenuState, computeSaveMenuState, type MenuStateInput } from '../src/ui/menuState.ts';

const base: MenuStateInput = {
  started: false,
  mainMenuOpen: true,
  inventoryOpen: false,
  debugMenuOpen: false,
  pointerLocked: false,
  dead: false,
};

type TransitionInput = MenuStateInput & { pointerLockChanged?: boolean; resumeRequested?: boolean };

const cases: { name: string; input: TransitionInput; expected: ReturnType<typeof computeMenuState> }[] = [
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
    input: { ...base, started: true, mainMenuOpen: false, pointerLockChanged: true },
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
    name: 'external pointer lock hides the visible pause state without a resume request',
    input: { ...base, started: true, mainMenuOpen: false, pointerLocked: true, pointerLockChanged: true },
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
    name: 'a frame between resume request and pointer lock does not reopen the pause menu',
    input: { ...base, started: true, mainMenuOpen: false, resumeRequested: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: false,
      menuPointer: false,
      overlayHidden: false,
      paused: true,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'a late resume action after lock leaves the already-hidden pause state alone',
    input: { ...base, started: true, mainMenuOpen: false, pointerLocked: true, resumeRequested: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: true,
      menuPointer: false,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'a resume request closes the open menu when the pointer is already locked',
    input: { ...base, started: true, pointerLocked: true, resumeRequested: true },
    expected: {
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      debugMenuOpen: false,
      closeOtherMenus: true,
      menuPointer: false,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'a resume request while locked and dead preserves menus and death overlay',
    input: {
      ...base,
      started: true,
      inventoryOpen: true,
      debugMenuOpen: true,
      pointerLocked: true,
      dead: true,
      resumeRequested: true,
    },
    expected: {
      started: true,
      mainMenuOpen: true,
      inventoryOpen: true,
      debugMenuOpen: true,
      closeOtherMenus: false,
      menuPointer: true,
      overlayHidden: true,
      paused: false,
      goLabel: 'Paused. Click to continue',
    },
  },
  {
    name: 'after a dead resume request clears, respawn does not close the open menu',
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
    name: 'an external lock keeps the open main menu',
    input: { ...base, started: true, pointerLocked: true, pointerLockChanged: true },
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
    name: 'an external lock keeps the inventory menu',
    input: {
      ...base,
      started: true,
      mainMenuOpen: false,
      inventoryOpen: true,
      pointerLocked: true,
      pointerLockChanged: true,
    },
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
    name: 'an external lock while dead preserves the death overlay state',
    input: { ...base, started: true, mainMenuOpen: false, pointerLocked: true, dead: true, pointerLockChanged: true },
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
    input: { ...base, started: true, mainMenuOpen: false, inventoryOpen: true, pointerLockChanged: true },
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

describe('title save menu transitions', () => {
  it.each([
    {
      action: 'title' as const,
      hasCompatibleSave: true,
      hasSavedData: true,
      expected: {
        showTitleControls: true,
        continueEnabled: true,
        confirmNewWorld: true,
        showError: false,
        continueRequested: false,
        newWorldRequested: false,
      },
    },
    {
      action: 'continue' as const,
      hasCompatibleSave: true,
      hasSavedData: true,
      expected: {
        showTitleControls: false,
        continueEnabled: false,
        confirmNewWorld: false,
        showError: false,
        continueRequested: true,
        newWorldRequested: false,
      },
    },
    {
      action: 'new-world' as const,
      hasCompatibleSave: false,
      hasSavedData: false,
      expected: {
        showTitleControls: false,
        continueEnabled: false,
        confirmNewWorld: false,
        showError: false,
        continueRequested: false,
        newWorldRequested: true,
      },
    },
    {
      action: 'error' as const,
      hasCompatibleSave: false,
      hasSavedData: true,
      expected: {
        showTitleControls: false,
        continueEnabled: false,
        confirmNewWorld: false,
        showError: true,
        continueRequested: false,
        newWorldRequested: false,
      },
    },
    {
      action: 'title' as const,
      hasCompatibleSave: false,
      hasSavedData: true,
      storageError: true,
      expected: {
        showTitleControls: true,
        continueEnabled: false,
        confirmNewWorld: true,
        showError: true,
        continueRequested: false,
        newWorldRequested: false,
      },
    },
  ])('resolves $action with saved-data and error guards', ({ expected, ...input }) => {
    expect(computeSaveMenuState(input)).toEqual(expected);
  });
});

describe('save controls flow through the shared menu state', () => {
  it('keeps a compatible current-version save continuable while requiring replacement confirmation', () => {
    const state = computeMenuState({
      ...base,
      saveMenu: { action: 'title', hasCompatibleSave: true, hasSavedData: true },
    });
    expect(state.saveMenu).toEqual({
      showTitleControls: true,
      continueEnabled: true,
      confirmNewWorld: true,
      showError: false,
      continueRequested: false,
      newWorldRequested: false,
    });
  });

  it('routes storage errors through the shared state without enabling Continue', () => {
    const state = computeMenuState({
      ...base,
      saveMenu: { action: 'title', hasCompatibleSave: true, hasSavedData: true, storageError: true },
    });
    expect(state.saveMenu?.continueEnabled).toBe(false);
    expect(state.saveMenu?.showError).toBe(true);
  });
});

describe('menu and pause state transitions', () => {
  it('external lock dismisses the pause state; a late resume request does not reopen it', () => {
    const visible = computeMenuState({ ...base, started: true, mainMenuOpen: false });
    expect(visible.overlayHidden).toBe(false);
    const locked = computeMenuState({
      ...base,
      started: true,
      mainMenuOpen: false,
      pointerLocked: true,
      pointerLockChanged: true,
    });
    const lateResume = computeMenuState({
      ...base,
      started: locked.started,
      mainMenuOpen: locked.mainMenuOpen,
      pointerLocked: true,
      resumeRequested: true,
    });
    expect(lateResume).toMatchObject({ mainMenuOpen: false, overlayHidden: true, paused: false, menuPointer: false });
  });

  it.each(cases)('$name', ({ input, expected }) => {
    expect(computeMenuState(input)).toEqual(expected);
  });
});
