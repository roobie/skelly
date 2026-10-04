// Browser-side events that exercise the production virtual-menu-pointer handlers.
export function dispatchMenuPointerMove({
  canvasSelector = 'canvas',
  movementX,
  movementY,
  centerClient = false,
  alsoDispatchMouseMove = false,
}) {
  const canvas = document.querySelector(canvasSelector);
  if (!canvas) {
    throw new Error(`No menu-pointer canvas matches ${canvasSelector}`);
  }
  const event = new PointerEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: -1,
    buttons: 0,
    ...(centerClient ? { clientX: innerWidth / 2, clientY: innerHeight / 2 } : {}),
  });
  Object.defineProperties(event, {
    movementX: { value: movementX },
    movementY: { value: movementY },
  });
  canvas.dispatchEvent(event);
  if (alsoDispatchMouseMove) {
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX: innerWidth / 2,
        clientY: innerHeight / 2,
        movementX,
        movementY,
      }),
    );
  }
}

export function dispatchMenuPointerClick({ canvasSelector = 'canvas' } = {}) {
  const canvas = document.querySelector(canvasSelector);
  if (!canvas) {
    throw new Error(`No menu-pointer canvas matches ${canvasSelector}`);
  }
  canvas.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
    }),
  );
  canvas.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: -1,
      buttons: 0,
    }),
  );
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

export const dispatchMenuPointerMoveExpression = (options) =>
  `(${dispatchMenuPointerMove.toString()})(${JSON.stringify(options)})`;
export const dispatchMenuPointerClickExpression = (options) =>
  `(${dispatchMenuPointerClick.toString()})(${JSON.stringify(options)})`;
