/** Pixels per line, including Firefox's line-mode wheel events. */
const LINE_PIXELS = 16;
const SCROLLABLE_OVERFLOW = /^(auto|scroll)$/;

/** Normalizes a wheel axis: deltaMode is 0 pixels, 1 lines, 2 pages. */
export const wheelPixels = (delta: number, deltaMode: number, pageSize: number): number => {
  if (deltaMode === 1) {
    return delta * LINE_PIXELS;
  }
  return deltaMode === 2 ? delta * pageSize : delta;
};

/** Finds the nearest pane, including one already at its edge, but never the page. */
export const wheelPane = (target: EventTarget | null): HTMLElement | null => {
  for (
    let element = target instanceof Element ? target : null;
    element && element !== document.body && element !== document.documentElement;
    element = element.parentElement
  ) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    const style = getComputedStyle(element);
    if (
      (SCROLLABLE_OVERFLOW.test(style.overflowY) && element.clientHeight > 0) ||
      (SCROLLABLE_OVERFLOW.test(style.overflowX) && element.clientWidth > 0)
    ) {
      return element;
    }
  }
  return null;
};
