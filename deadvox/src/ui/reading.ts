// A held-paper/sign reading surface. Authored text remains escaped Lit text nodes.
import { html, render } from 'lit-html';
import type { Readable } from '../core/readable.ts';
import { inputBindings, labelForAction } from '../game/inputBindings.ts';

const scrollText = (text: HTMLElement, action: string): void => {
  switch (action) {
    case 'reading.first':
      text.scrollTop = 0;
      break;
    case 'reading.last':
      text.scrollTop = text.scrollHeight;
      break;
    case 'reading.line-up':
      text.scrollTop -= 40;
      break;
    case 'reading.line-down':
      text.scrollTop += 40;
      break;
    case 'reading.page-up':
      text.scrollTop -= text.clientHeight * 0.8;
      break;
    case 'reading.page-down':
      text.scrollTop += text.clientHeight * 0.8;
      break;
  }
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
  const draw = () => {
    if (!current) {
      return;
    }
    render(
      html`
      <article class="reading-paper" role="dialog" aria-modal="true" aria-labelledby="reading-title" tabindex="-1">
        <header><h1 class="reading-title" id="reading-title">${current.title}</h1><button class="reading-dismiss" type="button" @click=${close} aria-label="Put away reading">Put away</button></header>
        <div class="reading-text" tabindex="0" aria-label="Text">${current.text}</div>
        <footer>${labelForAction('reading.close')} to put away · The world keeps moving</footer>
      </article>`,
      host,
    );
  };
  inputBindings.subscribe(draw);
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
      draw();
      host.querySelector<HTMLElement>('article')!.focus({ preventScroll: true });
      changed();
    },
    close,
    onAction(action: string) {
      if (!current) {
        return false;
      }
      if (action === 'reading.close') {
        close();
      } else {
        scrollText(host.querySelector<HTMLElement>('.reading-text')!, action);
      }
      return true;
    },
  };
};
