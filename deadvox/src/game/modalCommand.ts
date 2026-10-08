export interface ModalCommandHandlers {
  toggleMainMenu: () => void;
  readingOpen: boolean;
  readingAction: (action: string) => void;
  toggleInventory: () => void;
  inventoryTabAction: (action: string) => boolean;
  screenOpen: boolean;
  screenAction: (action: string) => void;
  mainMenuOpen: boolean;
  timeKeyAction: (action: string) => boolean;
}

export const routeModalCommand = (action: string, handlers: ModalCommandHandlers): boolean => {
  if (action === 'ui.main-menu-toggle') {
    handlers.toggleMainMenu();
    return true;
  }
  if (handlers.readingOpen) {
    handlers.readingAction(action);
    return true;
  }
  if (action === 'ui.inventory-toggle') {
    handlers.toggleInventory();
    return true;
  }
  if (handlers.inventoryTabAction(action)) {
    return true;
  }
  if (handlers.screenOpen) {
    handlers.screenAction(action);
    return true;
  }
  return handlers.mainMenuOpen || handlers.timeKeyAction(action);
};
