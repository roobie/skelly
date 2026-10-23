// A held-paper/sign reading surface. Authored text remains escaped Lit text nodes.
import { html, render } from 'lit-html';
import type { Readable } from '../core/readable.ts';
import type { ScreenText } from '../core/schema.ts';
import { inputBindings } from '../game/inputBindings.ts';

/** Meta progress embedded in the paper, because the optional HUD cannot explain a compressed reading action. */
export interface ReadingProgress {
  readonly value: number;
  readonly max: number;
}

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
    default:
      break;
  }
};
export const mountReading = (
  host: HTMLElement,
  text: ScreenText['reading'],
  changed: () => void,
  closing: () => void = () => undefined,
) => {
  let current: Readonly<Readable> | undefined;
  let currentBookUid: number | undefined;
  let progress: ReadingProgress | undefined;
  let previousFocus: HTMLElement | undefined;
  const close = () => {
    if (!current) {
      return;
    }
    closing();
    current = undefined;
    currentBookUid = undefined;
    progress = undefined;
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
        <header><h1 class="reading-title" id="reading-title">${current.title}</h1><button class="reading-dismiss" type="button" @click=${close} aria-label=${text.putAwayLabel}>${text.putAway}</button></header>
        ${progress ? html`<progress class="reading-progress" max=${progress.max} value=${progress.value} aria-label=${text.progress}></progress>` : ''}
        <div class="reading-text" tabindex="0" aria-label=${text.text}>${current.text}</div>
      </article>`,
      host,
    );
  };
  inputBindings.subscribe(draw);
  return {
    get isOpen() {
      return current !== undefined;
    },
    get bookUid() {
      return currentBookUid;
    },
    setProgress(next: ReadingProgress | undefined) {
      if (!current || (progress?.value === next?.value && progress?.max === next?.max)) {
        return;
      }
      progress = next;
      draw();
    },
    open(readable: Readonly<Readable>, bookUid?: number) {
      if (!current) {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      }
      current = readable;
      currentBookUid = bookUid;
      progress = undefined;
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
