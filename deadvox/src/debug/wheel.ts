// Mouse-wheel scrolling of the debug panel while the pointer is locked.
//
// With the pointer locked the browser sends every wheel event to the page, never to the element
// under a cursor, so nothing scrolls natively. play.ts routes the wheel like this:
//   - main menu open: scrolls the menu card;
//   - otherwise, only when no menu holds the pointer (`!input.menuPointer`): `DebugRuntime.wheel`,
//     which cycles the build-mode block.
// An open debug panel makes `menuPointer` true, so play.ts delivers the wheel nowhere. This module
// fills that gap from the debug side, which keeps the change out of the fingerprinted play.ts.
//
// The rule: the wheel scrolls the panel when the pointer is locked, the panel is open and it
// overflows. It never competes with the build wheel, because play.ts only delivers that one while
// the panel is closed, and never with the main menu, because opening the main menu closes the
// panel. Unlocked, the browser scrolls the panel natively (it has `overflow: auto`) and this
// module does nothing.

/** Pixels per line, for browsers that report the wheel in lines (Firefox) rather than pixels. */
const LINE_PIXELS = 16;

export interface PanelWheelState {
  /** The pointer is locked, which is when the browser will not scroll anything natively. */
  readonly locked: boolean;
  readonly panelOpen: boolean;
  /** The panel has more content than fits (scrollHeight beyond clientHeight). */
  readonly overflows: boolean;
}

/** Whether a wheel event should scroll the debug panel (and be kept from the game). */
export const wheelScrollsPanel = ({ locked, panelOpen, overflows }: PanelWheelState): boolean =>
  locked && panelOpen && overflows;

/** The wheel's vertical movement in pixels; `deltaMode` is 0 pixels, 1 lines, 2 pages. */
export const wheelPixels = (deltaY: number, deltaMode: number, pageHeight: number): number => {
  if (deltaMode === 1) {
    return deltaY * LINE_PIXELS;
  }
  return deltaMode === 2 ? deltaY * pageHeight : deltaY;
};

export interface ScrollablePanel {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** Handles one wheel event for the panel; returns true when it scrolled the panel and the event is consumed. */
export const scrollPanelByWheel = (
  panel: ScrollablePanel | null,
  panelOpen: boolean,
  locked: boolean,
  event: { readonly deltaY: number; readonly deltaMode: number },
): boolean => {
  if (!(panel && wheelScrollsPanel({ locked, panelOpen, overflows: panel.scrollHeight > panel.clientHeight }))) {
    return false;
  }
  panel.scrollTop += wheelPixels(event.deltaY, event.deltaMode, panel.clientHeight);
  return true;
};
