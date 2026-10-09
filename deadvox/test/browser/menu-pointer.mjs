// Events that exercise the production virtual-menu-pointer handlers: browser-side dispatchers, and a real press
// driven from Playwright.
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

/**
 * Presses for real with the drawn cursor on `selector`, as a player does under pointer lock: the trusted press
 * lands on bare locked surface, where the browser runs its own mousedown handling, and the game forwards it to
 * whatever the drawn cursor points at. Synthetic canvas events skip that browser handling.
 */
export const pressWithDrawnCursor = async (page, selector) => {
  const surface = await page.evaluate(() => {
    const locked = document.pointerLockElement;
    for (let y = innerHeight - 8; y > innerHeight / 2; y -= 16) {
      for (let x = 8; x < innerWidth / 2; x += 16) {
        if (locked && document.elementFromPoint(x, y) === locked) {
          return { x, y, selector: locked.id ? `#${locked.id}` : locked.tagName.toLowerCase() };
        }
      }
    }
    return null;
  });
  if (!surface) {
    throw new Error('No bare locked surface is exposed for a real press');
  }
  await page.mouse.move(surface.x, surface.y);
  const gap = await page.evaluate(async (target) => {
    // The real move shifts the drawn cursor at once, but its element follows on the game's next frame.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const drawnCursor = document.querySelector('#game-cursor');
    const tip = drawnCursor.getBoundingClientRect();
    const rect = document.querySelector(target).getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - (tip.left + (drawnCursor.classList.contains('hand') ? 4 : 0)),
      y: rect.top + rect.height / 2 - tip.top,
    };
  }, selector);
  await page.evaluate(dispatchMenuPointerMove, {
    canvasSelector: surface.selector,
    movementX: gap.x,
    movementY: gap.y,
  });
  await page.mouse.down();
  await page.mouse.up();
};

export const dispatchMenuPointerMoveExpression = (options) =>
  `(${dispatchMenuPointerMove.toString()})(${JSON.stringify(options)})`;
export const dispatchMenuPointerClickExpression = (options) =>
  `(${dispatchMenuPointerClick.toString()})(${JSON.stringify(options)})`;
