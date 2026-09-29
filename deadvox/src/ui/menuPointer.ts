// While the pointer is locked, menus are driven by a drawn cursor. This module moves that
// cursor and forwards the browser's locked-pointer events to whatever is under it, so
// the inventory and the pause card work as if the mouse were free. It reads only the
// input's lock and cursor state and the DOM, never simulation state (ADR 0002: it is
// excluded from the save fingerprint, so pointer fixes don't invalidate saves).

/** The input state the cursor needs; `Input` satisfies it. */
export interface MenuPointerInput {
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
  let forwardingPointer = false;
  const releasePointerTarget = (event: PointerEvent) => {
    if (event.type === 'pointerup' || event.type === 'pointercancel') {
      capturedPointers.delete(event.pointerId);
    }
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
  const forwardMenuPointer = (event: PointerEvent) => {
    if (forwardingPointer) {
      return;
    }
    if (!(input.locked && input.menuPointer)) {
      releasePointerTarget(event);
      return;
    }
    event.stopPropagation();
    if (event.type === 'pointermove') {
      input.moveMenuCursor(event.movementX, event.movementY);
    }
    const captured = capturedPointers.has(event.pointerId);
    const target = captured ? document : document.elementFromPoint(input.cursorX, input.cursorY);
    if (target && isForwardableMenuTarget(target)) {
      if (event.type === 'pointerdown') {
        capturedPointers.add(event.pointerId);
      }
      dispatchMenuPointer(target, event);
    }
    releasePointerTarget(event);
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
    document.addEventListener(type, forwardMenuPointer, true);
  }

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
          if (target instanceof HTMLInputElement) {
            target.focus();
          }
          target.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: input.cursorX,
              clientY: input.cursorY,
              button: (e as MouseEvent).button,
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
      const clickable = underCursor?.closest('button, a, input, select, textarea, [role="button"]') ?? null;
      cursor.classList.toggle('hand', clickable !== null);
      hoveredElement?.classList.remove('game-cursor-hover');
      hoveredElement = clickable;
      hoveredElement?.classList.add('game-cursor-hover');
    },
    releaseCaptures: () => capturedPointers.clear(),
  };
};
