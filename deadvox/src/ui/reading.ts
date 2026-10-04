// A held-paper/sign reading surface, not a HUD readout. Lit renders authored text as text nodes.
import { html, render } from 'lit-html';
import type { Readable } from '../core/readable.ts';

export const mountReading = (host: HTMLElement, changed: () => void) => {
  let current: Readonly<Readable> | undefined;
  let previousFocus: HTMLElement | undefined;
  const close = () => {
    if (!current) return;
    current = undefined;
    host.hidden = true;
    render(html``, host);
    previousFocus?.focus({ preventScroll: true });
    previousFocus = undefined;
    changed();
  };
  return {
    get isOpen() { return current !== undefined; },
    open(readable: Readonly<Readable>) {
      if (!current) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      current = readable;
      host.hidden = false;
      render(html`
        <article class="reading-paper" role="dialog" aria-modal="true" aria-labelledby="reading-title" tabindex="-1">
          <header><h1 id="reading-title">${readable.title}</h1><button type="button" @click=${close} aria-label="Put away reading">Put away</button></header>
          <div class="reading-text" tabindex="0" aria-label="Text">${readable.text}</div>
          <footer>Esc or Tab to put away · The world keeps moving</footer>
        </article>`, host);
      host.querySelector<HTMLElement>('article')!.focus({ preventScroll: true });
      changed();
    },
    close,
    /** Own all keys while open: gameplay/quickbar/inventory must not also receive them. */
    onKey(event: KeyboardEvent) {
      if (!current) return false;
      if (event.code === 'Escape' || event.code === 'Tab') {
        event.preventDefault();
        if (!event.repeat) close();
      } else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Space'].includes(event.code)) {
        const text = host.querySelector<HTMLElement>('.reading-text')!;
        const delta = event.code === 'ArrowUp' ? -40 : event.code === 'ArrowDown' ? 40 : event.code === 'PageUp' ? -text.clientHeight * 0.8 : text.clientHeight * 0.8;
        text.scrollTop = event.code === 'Home' ? 0 : event.code === 'End' ? text.scrollHeight : text.scrollTop + delta;
        event.preventDefault();
      }
      return true;
    },
  };
};
