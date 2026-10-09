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

interface WheelDelta {
  readonly x: number;
  readonly y: number;
}

/** Whether the element scrolls on an axis, and whether it has anything to scroll there along the wheel. */
const scrollAxes = (element: HTMLElement, delta: WheelDelta): { scrolls: boolean; overflows: boolean } => {
  const style = getComputedStyle(element);
  const scrollsY = SCROLLABLE_OVERFLOW.test(style.overflowY) && element.clientHeight > 0;
  const scrollsX = SCROLLABLE_OVERFLOW.test(style.overflowX) && element.clientWidth > 0;
  return {
    scrolls: scrollsY || scrollsX,
    overflows:
      (delta.y !== 0 && scrollsY && element.scrollHeight > element.clientHeight) ||
      (delta.x !== 0 && scrollsX && element.scrollWidth > element.clientWidth),
  };
};

/**
 * Finds the pane a wheel scrolls, but never the page: the nearest one with something to scroll along the
 * wheel, even if it is already at its edge, so a pocket grid that fits doesn't swallow the wheel meant for
 * the pane around it. When none has, the nearest pane still takes the wheel, so it reaches neither the page
 * nor the game.
 */
export const wheelPane = (target: EventTarget | null, delta: WheelDelta): HTMLElement | null => {
  let nearest: HTMLElement | null = null;
  for (
    let element = target instanceof Element ? target : null;
    element && element !== document.body && element !== document.documentElement;
    element = element.parentElement
  ) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    const { scrolls, overflows } = scrollAxes(element, delta);
    if (overflows) {
      return element;
    }
    if (scrolls) {
      nearest ??= element;
    }
  }
  return nearest;
};
