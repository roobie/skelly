export interface MenuStateInput {
  started: boolean;
  mainMenuOpen: boolean;
  inventoryOpen: boolean;
  debugMenuOpen: boolean;
  pointerLocked: boolean;
  dead: boolean;
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
  const closeOtherMenus = started && !input.pointerLocked && !input.dead;
  const mainMenuOpen = closeOtherMenus || input.mainMenuOpen;
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
