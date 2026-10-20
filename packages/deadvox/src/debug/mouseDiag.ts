// Debug-only: shows the last mouse/pointer event the page received, so a side button that "does nothing"
// (e.g. Firefox consuming it for history navigation) can be told apart from one that arrives oddly.

export interface MouseDiagEvent {
  readonly type: string;
  readonly button: number;
  readonly buttons: number;
  readonly targetTag: string;
  readonly locked: boolean;
}

export const formatMouseDiag = (e: MouseDiagEvent | undefined): string =>
  e
    ? `mouse: ${e.type} button=${e.button} buttons=${e.buttons} target=${e.targetTag} locked=${e.locked ? 'yes' : 'no'}`
    : 'mouse: no button event yet';

const TYPES = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick', 'click'];

/** Capture-phase document listeners; `show` receives the formatted line for each event. */
export const attachMouseDiag = (show: (text: string) => void): void => {
  for (const type of TYPES) {
    document.addEventListener(
      type,
      (e) => {
        const m = e as MouseEvent;
        show(
          formatMouseDiag({
            type,
            button: m.button,
            buttons: m.buttons,
            targetTag: (m.target as Element | null)?.tagName?.toLowerCase() ?? '?',
            locked: document.pointerLockElement !== null,
          }),
        );
      },
      true,
    );
  }
};
