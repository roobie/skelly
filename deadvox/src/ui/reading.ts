// A held-paper/sign reading surface, not a HUD readout. Lit renders authored text as text nodes.
import { html, render } from 'lit-html';
import type { Readable } from '../core/readable.ts';

const scrollText = (text: HTMLElement, code: string): boolean => {
  switch (code) {
    case 'Home':
      text.scrollTop = 0;
      break;
    case 'End':
      text.scrollTop = text.scrollHeight;
      break;
    case 'ArrowUp':
      text.scrollTop -= 40;
      break;
    case 'ArrowDown':
      text.scrollTop += 40;
      break;
    case 'PageUp':
      text.scrollTop -= text.clientHeight * 0.8;
      break;
    case 'PageDown':
    case 'Space':
      text.scrollTop += text.clientHeight * 0.8;
      break;
    default:
      return false;
  }
  return true;
};

export const mountReading = (host: HTMLElement, changed: () => void) => {
  let current: Readonly<Readable> | undefined;
  let previousFocus: HTMLElement | undefined;
  const close = () => {
    if (!current) {
      return;
    }
    current = undefined;
    host.hidden = true;
    render(html``, host);
    previousFocus?.focus({ preventScroll: true });
    previousFocus = undefined;
    changed();
  };
  return {
    get isOpen() {
      return current !== undefined;
    },
    open(readable: Readonly<Readable>) {
      if (!current) {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      }
      current = readable;
      host.hidden = false;
      render(
        html`
        <article class="reading-paper" role="dialog" aria-modal="true" aria-labelledby="reading-title" tabindex="-1">
          <header><h1 class="reading-title" id="reading-title">${readable.title}</h1><button class="reading-dismiss" type="button" @click=${close} aria-label="Put away reading">Put away</button></header>
          <div class="reading-text" tabindex="0" aria-label="Text">${readable.text}</div>
          <footer>Esc or Tab to put away · The world keeps moving</footer>
        </article>`,
        host,
      );
      host.querySelector<HTMLElement>('article')!.focus({ preventScroll: true });
      changed();
    },
    close,
    /** Own all keys while open: gameplay/quickbar/inventory must not also receive them. */
    onKey(event: KeyboardEvent) {
      if (!current) {
        return false;
      }
      if (event.code === 'Escape' || event.code === 'Tab') {
        event.preventDefault();
        if (!event.repeat) {
          close();
        }
      } else if (scrollText(host.querySelector<HTMLElement>('.reading-text')!, event.code)) {
        event.preventDefault();
      }
      return true;
    },
  };
};
