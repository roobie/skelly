import type { Emote } from '../core/actionMenuContent.ts';
import type { ActionMenu, RadialAction } from './actionMenu.ts';

export interface EmotePressPorts {
  menu: ActionMenu;
  /** The emotes on offer now, placed on the ring. */
  entries: () => readonly RadialAction[];
  /** Performs the chosen emote once. */
  perform: (emote: Emote) => void;
}

/**
 * Owns the emote key: holding it holds the emote ring open, and the release performs what the ring points at. A
 * release at the centre performs nothing, so opening the ring never commits to an emote.
 */
export class EmotePress {
  private readonly ports: EmotePressPorts;

  constructor(ports: EmotePressPorts) {
    this.ports = ports;
  }

  press(): void {
    this.ports.menu.open('emote', undefined, this.ports.entries());
  }

  release(): void {
    if (this.ports.menu.opened?.source !== 'emote') {
      return;
    }
    const choice = this.ports.menu.confirm(this.ports.entries());
    if (choice) {
      this.ports.perform(choice.id as Emote);
    }
  }

  /** Closes the ring without performing, as losing focus or a refusal does. */
  cancel(): void {
    if (this.ports.menu.opened?.source === 'emote') {
      this.ports.menu.close();
    }
  }
}
