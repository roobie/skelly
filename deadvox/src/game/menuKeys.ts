import { CONTROL_CODES } from './input.ts';

interface MenuKeyContext {
  readonly inventory: { readonly isOpen: boolean; onKey: (event: KeyboardEvent) => boolean };
  readonly debug: { readonly menuOpen: boolean; handleKey: (event: KeyboardEvent) => boolean } | undefined;
  readonly locksInput: boolean;
  readonly toggleInventory: () => void;
  readonly syncMenuState: () => void;
}

/** The active inventory owns its commands; debug modals and gameplay retain their priority. */
export const handlePlayMenuKey = (event: KeyboardEvent, context: MenuKeyContext): boolean => {
  const toggle = event.code === CONTROL_CODES.inventory && !context.locksInput;
  if (context.inventory.isOpen && !context.debug?.menuOpen) {
    if (toggle) {
      context.toggleInventory();
      event.preventDefault();
      return true;
    }
    if (context.inventory.onKey(event)) {
      event.preventDefault();
      return true;
    }
  }
  if (context.debug?.handleKey(event)) {
    context.syncMenuState();
    return true;
  }
  if (toggle) {
    context.toggleInventory();
    return true;
  }
  return context.inventory.isOpen;
};
