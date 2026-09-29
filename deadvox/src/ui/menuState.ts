export interface MenuStateInput {
  started: boolean;
  mainMenuOpen: boolean;
  inventoryOpen: boolean;
  debugMenuOpen: boolean;
  pointerLocked: boolean;
  dead: boolean;
  /** True only while handling the browser's pointerlockchange event, not on animation frames. */
  pointerLockChanged?: boolean;
  /** Resume intent is applied only if that request actually acquires the pointer lock. */
  resumeRequested?: boolean;
}

export interface MenuState {
  started: boolean;
  mainMenuOpen: boolean;
  inventoryOpen: boolean;
  debugMenuOpen: boolean;
  closeOtherMenus: boolean;
  menuPointer: boolean;
  overlayHidden: boolean;
  paused: boolean;
  goLabel: string;
}

/** Derives menu, overlay, pointer-cursor and pause presentation without reading game state. */
export const computeMenuState = (input: MenuStateInput): MenuState => {
  const started = input.started || input.pointerLocked;
  const pointerUnlocked = Boolean(input.pointerLockChanged && started && !input.pointerLocked && !input.dead);
  const resumed = Boolean(input.pointerLockChanged && input.pointerLocked && input.resumeRequested && !input.dead);
  const closeOtherMenus = pointerUnlocked || resumed;
  const { mainMenuOpen: requestedMainMenuOpen } = input;
  let mainMenuOpen = requestedMainMenuOpen;
  if (pointerUnlocked) {
    mainMenuOpen = true;
  } else if (resumed) {
    mainMenuOpen = false;
  }
  const inventoryOpen = closeOtherMenus ? false : input.inventoryOpen;
  const debugMenuOpen = closeOtherMenus ? false : input.debugMenuOpen;
  const overlayHidden = (input.pointerLocked && !mainMenuOpen) || inventoryOpen || input.dead;
  return {
    started,
    mainMenuOpen,
    inventoryOpen,
    debugMenuOpen,
    closeOtherMenus,
    menuPointer: mainMenuOpen || inventoryOpen || debugMenuOpen,
    overlayHidden,
    paused: !overlayHidden,
    goLabel: started ? 'Paused. Click to continue' : 'Click to play',
  };
};
