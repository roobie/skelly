// The copy is clipped by the nearest ancestor that scrolls or hides overflow, scroll bar included, so it is moved
// along the row from its anchor until it fits there. Hover is a CSS state, so placement runs when a fact is entered
// and when the viewport changes. Kept free of templating so menu code can import it before any DOM exists.

const clippingHost = (owner: HTMLElement): HTMLElement => {
  for (let host = owner.parentElement; host; host = host.parentElement) {
    if (getComputedStyle(host).overflowX !== 'visible') {
      return host;
    }
  }
  return document.documentElement;
};

export const placeFactDetail = (owner: Element): void => {
  const copy = owner instanceof HTMLElement ? owner.querySelector<HTMLElement>(':scope > .fact-detail-copy') : null;
  if (!(owner instanceof HTMLElement && copy)) {
    return;
  }
  copy.style.maxWidth = '';
  copy.style.setProperty('--fact-detail-shift', '0px');
  const { width } = copy.getBoundingClientRect();
  if (width === 0) {
    return;
  }
  const host = clippingHost(owner);
  const scrollportLeft = host.getBoundingClientRect().left + host.clientLeft;
  const scrollportRight = scrollportLeft + host.clientWidth;
  const fitted = Math.min(width, scrollportRight - scrollportLeft);
  const anchorLeft = owner.getBoundingClientRect().left;
  const left = Math.max(scrollportLeft, Math.min(anchorLeft, scrollportRight - fitted));
  copy.style.maxWidth = `${fitted}px`;
  copy.style.setProperty('--fact-detail-shift', `${left - anchorLeft}px`);
};

const ownerOf = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target.closest('.fact-detail') : null;

let listening = false;

// One shared set of listeners, registered by the first fact rendered in a real window.
export const listenForFactDetailPlacement = (): void => {
  if (listening || typeof globalThis.window === 'undefined') {
    return;
  }
  listening = true;
  document.addEventListener('pointerover', (event) => {
    const owner = ownerOf(event.target);
    if (owner) {
      placeFactDetail(owner);
    }
  });
  document.addEventListener('focusin', (event) => {
    const owner = ownerOf(event.target);
    if (owner) {
      placeFactDetail(owner);
    }
  });
  // A shown copy was fitted to the geometry it was entered in, so a resize re-fits the facts still shown.
  window.addEventListener('resize', () => {
    for (const owner of document.querySelectorAll('.fact-detail:is(:hover, :focus-within, .game-cursor-hover)')) {
      placeFactDetail(owner);
    }
  });
};
