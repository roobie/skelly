export type SaveMenuAction = 'title' | 'continue' | 'new-world' | 'error';

export interface SaveMenuInput {
  action: SaveMenuAction;
  hasCompatibleSave: boolean;
  hasSavedData: boolean;
  storageError?: boolean;
}

export interface SaveMenuState {
  showTitleControls: boolean;
  continueEnabled: boolean;
  confirmNewWorld: boolean;
  showError: boolean;
  continueRequested: boolean;
  newWorldRequested: boolean;
}

export const computeSaveMenuState = (input: SaveMenuInput): SaveMenuState => ({
  showTitleControls: input.action === 'title',
  continueEnabled: input.action === 'title' && input.hasCompatibleSave && !input.storageError,
  confirmNewWorld: input.action === 'title' && input.hasSavedData,
  showError: input.action === 'error' || Boolean(input.storageError),
  continueRequested: input.action === 'continue' && input.hasCompatibleSave && !input.storageError,
  newWorldRequested: input.action === 'new-world' && !input.storageError,
});

export interface MenuStateInput {
  started: boolean;
  mainMenuOpen: boolean;
  inventoryOpen: boolean;
  debugMenuOpen: boolean;
  pointerLocked: boolean;
  dead: boolean;
  /** True only while handling the browser's pointerlockchange event, not on animation frames. */
  pointerLockChanged?: boolean;
  /** Resume intent is applied only while the pointer is locked, whether newly acquired or already held. */
  resumeRequested?: boolean;
  titleNewWorldLabel?: string;
  saveMenu?: SaveMenuInput;
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
  saveMenu?: SaveMenuState;
}

/** Derives menu, overlay, pointer-cursor and pause presentation without reading game state. */
export const computeMenuState = (input: MenuStateInput): MenuState => {
  const started = input.started || input.pointerLocked;
  const pointerUnlocked = Boolean(input.pointerLockChanged && started && !input.pointerLocked && !input.dead);
  const resumed = Boolean(input.pointerLocked && input.resumeRequested && !input.dead);
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
    goLabel: started ? 'Paused. Click to continue' : (input.titleNewWorldLabel ?? 'Click to play'),
    ...(input.saveMenu ? { saveMenu: computeSaveMenuState(input.saveMenu) } : {}),
  };
};
