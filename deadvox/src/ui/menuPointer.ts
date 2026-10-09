// While the pointer is locked, menus are driven by a drawn cursor. This module moves that
// cursor and forwards the browser's locked-pointer events to whatever is under it, so
// the inventory and the pause card work as if the mouse were free. It reads only the
// input's lock and cursor state and the DOM, never simulation state (ADR 0002: it is
// excluded from the save fingerprint, so pointer fixes don't invalidate saves).

import { wheelPane, wheelPixels } from './wheel.ts';

/** The input state the cursor needs; `Input` satisfies it. */
interface MenuPointerInput {
  readonly locked: boolean;
  readonly menuPointer: boolean;
  readonly cursorX: number;
  readonly cursorY: number;
  moveMenuCursor: (movementX: number, movementY: number) => void;
}

export interface MenuPointerOptions {
  input: MenuPointerInput;
  /** The game canvas: never a forwarding target, since it owns the lock. */
  canvas: HTMLElement;
  /** The drawn cursor element. */
  cursor: HTMLElement;
}

export interface MenuPointer {
  /** Places the drawn cursor and its hover styling; call once per frame. */
  update: () => void;
  /** Forgets pointers captured by a press; call when the lock is lost. */
  releaseCaptures: () => void;
}

/** Installs the capturing forwarders on `document`. */
export const mountMenuPointer = ({ input, canvas, cursor }: MenuPointerOptions): MenuPointer => {
  // Inventory redraws after pointerdown, so captured move/up events go to document rather than a soon-detached item node.
  const capturedPointers = new Set<number>();
  const capturedRanges = new Map<number, { input: HTMLInputElement; initialValue: string }>();
  let forwardingPointer = false;
  const isInputElement = (element: Element): element is HTMLInputElement => element.tagName === 'INPUT';
  const liveRangeInput = (rangeInput: HTMLInputElement): HTMLInputElement => {
    const current = rangeInput.id ? document.getElementById(rangeInput.id) : null;
    return current && isInputElement(current) && current.type === 'range' ? current : rangeInput;
  };
  const setRangeValue = (rangeInput: HTMLInputElement, x: number) => {
    const bounds = rangeInput.getBoundingClientRect();
    const min = rangeInput.min === '' ? 0 : Number(rangeInput.min);
    const max = rangeInput.max === '' ? 100 : Number(rangeInput.max);
    if (
      rangeInput.matches(':disabled') ||
      bounds.width <= 0 ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      max <= min
    ) {
      return;
    }
    const fraction = Math.max(0, Math.min(1, (x - bounds.left) / bounds.width));
    const before = rangeInput.value;
    rangeInput.value = String(min + fraction * (max - min));
    if (rangeInput.value !== before) {
      rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const captureRangeInput = (event: PointerEvent, target: EventTarget): HTMLInputElement | undefined => {
    if (event.type !== 'pointerdown') {
      return undefined;
    }
    capturedPointers.add(event.pointerId);
    if (!(target instanceof Element && isInputElement(target)) || target.type !== 'range') {
      return undefined;
    }
    capturedRanges.set(event.pointerId, { input: target, initialValue: target.value });
    return target;
  };
  const updateCapturedRange = (event: PointerEvent) => {
    const capturedRange = capturedRanges.get(event.pointerId);
    if (capturedRange) {
      setRangeValue(liveRangeInput(capturedRange.input), input.cursorX);
    }
  };
  const releasePointerTarget = (event: PointerEvent) => {
    if (event.type !== 'pointerup' && event.type !== 'pointercancel') {
      return;
    }
    capturedPointers.delete(event.pointerId);
    const capturedRange = capturedRanges.get(event.pointerId);
    if (capturedRange && event.type === 'pointerup') {
      const rangeInput = liveRangeInput(capturedRange.input);
      if (rangeInput.value !== capturedRange.initialValue) {
        rangeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    capturedRanges.delete(event.pointerId);
  };
  const isForwardableMenuTarget = (target: EventTarget | null): boolean =>
    target === document || (target instanceof Element && target !== canvas && target.id !== 'game-cursor');
  const dispatchMenuPointer = (target: EventTarget, event: PointerEvent) => {
    forwardingPointer = true;
    try {
      const forwarded = new PointerEvent(event.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        button: event.button,
        buttons: event.buttons,
        clientX: input.cursorX,
        clientY: input.cursorY,
        screenX: input.cursorX,
        screenY: input.cursorY,
        width: event.width,
        height: event.height,
        pressure: event.pressure,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
        twist: event.twist,
      });
      // Firefox pins even synthetic PointerEvent.clientX/Y to the pointer-lock center.
      // Override those read-only properties so the inventory receives the game cursor position.
      Object.defineProperties(forwarded, {
        clientX: { value: input.cursorX },
        clientY: { value: input.cursorY },
        screenX: { value: input.cursorX },
        screenY: { value: input.cursorY },
      });
      target.dispatchEvent(forwarded);
    } finally {
      forwardingPointer = false;
    }
  };
  const forwardLockedMenuPointer = (event: PointerEvent) => {
    event.stopPropagation();
    if (event.type === 'pointermove') {
      input.moveMenuCursor(event.movementX, event.movementY);
      updateCapturedRange(event);
    }
    const target = capturedPointers.has(event.pointerId)
      ? document
      : document.elementFromPoint(input.cursorX, input.cursorY);
    if (!(target && isForwardableMenuTarget(target))) {
      return;
    }
    const rangeInput = captureRangeInput(event, target);
    dispatchMenuPointer(target, event);
    if (rangeInput) {
      // Pointer-lock forwarding is synthetic, so the browser does not run a range input's native drag action.
      setRangeValue(liveRangeInput(rangeInput), input.cursorX);
    }
  };
  const forwardMenuPointer = (event: PointerEvent) => {
    if (forwardingPointer) {
      return;
    }
    if (!(input.locked && input.menuPointer)) {
      releasePointerTarget(event);
      return;
    }
    forwardLockedMenuPointer(event);
    releasePointerTarget(event);
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
    document.addEventListener(type, forwardMenuPointer, true);
  }

  // The main card already owns its locked wheel route, independent of cursor position.
  const gameOwnsWheel = () =>
    input.locked && (!input.menuPointer || document.getElementById('overlay')?.hidden === false);
  document.addEventListener(
    'wheel',
    (event) => {
      if (event.defaultPrevented || !(event.deltaX || event.deltaY) || gameOwnsWheel()) {
        return;
      }
      const target = input.locked ? document.elementFromPoint(input.cursorX, input.cursorY) : event.target;
      const pane = wheelPane(target, { x: event.deltaX, y: event.deltaY });
      if (pane) {
        pane.scrollTop += wheelPixels(event.deltaY, event.deltaMode, pane.clientHeight);
        pane.scrollLeft += wheelPixels(event.deltaX, event.deltaMode, pane.clientWidth);
      } else if (!input.locked) {
        return;
      }
      // Consume even at a pane's edge: neither page scroll nor the build wheel should leak through.
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true, passive: false },
  );

  // A real press lands on the locked canvas, and its default focus handling would blur the field the drawn
  // cursor is using, such as an open combo box, before the forwarded click reaches the option under it.
  // Focus follows forwarded clicks instead.
  document.addEventListener(
    'mousedown',
    (event) => {
      if (input.locked && input.menuPointer) {
        event.preventDefault();
      }
    },
    true,
  );

  let forwardingClick = false;
  let hoveredElement: Element | null = null;
  document.addEventListener(
    'click',
    (e) => {
      if (forwardingClick || !input.locked || !input.menuPointer) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const target = document.elementFromPoint(input.cursorX, input.cursorY);
      if (target && target !== canvas && target.id !== 'game-cursor') {
        forwardingClick = true;
        try {
          if (isInputElement(target)) {
            target.focus();
          }
          target.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: input.cursorX,
              clientY: input.cursorY,
              button: (e as MouseEvent).button,
              shiftKey: (e as MouseEvent).shiftKey,
              altKey: (e as MouseEvent).altKey,
            }),
          );
        } finally {
          forwardingClick = false;
        }
      }
    },
    true,
  );

  return {
    update: () => {
      cursor.hidden = !(input.locked && input.menuPointer);
      cursor.style.transform = `translate(${input.cursorX}px, ${input.cursorY}px)`;
      const underCursor = document.elementFromPoint(input.cursorX, input.cursorY);
      const clickable =
        underCursor?.closest('button, a, input, select, textarea, [role="button"], [role="option"]') ?? null;
      cursor.classList.toggle('hand', clickable !== null);
      hoveredElement?.classList.remove('game-cursor-hover');
      hoveredElement = clickable;
      hoveredElement?.classList.add('game-cursor-hover');
    },
    releaseCaptures: () => {
      capturedPointers.clear();
      capturedRanges.clear();
    },
  };
};
