import type { Emote } from '../core/actionMenuContent.ts';
import type { ActionMenu, RadialAction } from './actionMenu.ts';

export interface EmotePressPorts {
  menu: ActionMenu;
  /** The emote modes and their emotes, placed on the ring. */
  entries: () => readonly RadialAction[];
  /** Performs the chosen emote once. */
  perform: (emote: Emote) => void;
}

/**
 * Owns the emote key: holding it opens the emote ring, and the release performs what the ring points at or enters the
 * mode it points at. A mode's ring stays open for the next press, whose release performs from it. A release at the
 * centre performs nothing, so opening the ring never commits to an emote.
 */
export class EmotePress {
  private readonly ports: EmotePressPorts;

  constructor(ports: EmotePressPorts) {
    this.ports = ports;
  }

  press(): void {
    if (this.ports.menu.opened?.source !== 'emote') {
      this.ports.menu.open('emote', undefined, this.ports.entries());
    }
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
