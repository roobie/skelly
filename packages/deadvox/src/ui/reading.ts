// A held-paper/sign reading surface. Authored text remains escaped Lit text nodes.
import { html, render } from 'lit-html';
import type { ReadRequest } from '../core/readable.ts';
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
  let current: ReadRequest | undefined;
  let progress: ReadingProgress | undefined;
  let mapReady = false;
  let previousFocus: HTMLElement | undefined;
  let generation = 0;
  const close = () => {
    if (!current) {
      return;
    }
    closing();
    current = undefined;
    progress = undefined;
    mapReady = false;
    generation += 1;
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
        <header><h1 class="reading-title" id="reading-title">${current.kind === 'text' ? current.readable.title : current.title}</h1><button class="reading-dismiss" type="button" @click=${close} aria-label=${text.putAwayLabel}>${text.putAway}</button></header>
        ${
          current.kind === 'text'
            ? html`${progress ? html`<progress class="reading-progress" max=${progress.max} value=${progress.value} aria-label=${text.progress}></progress>` : ''}
              <div class="reading-text" tabindex="0" aria-label=${text.text}>${current.readable.text}</div>`
            : html`<section class="reading-map" data-coverage="${current.coverage.x},${current.coverage.z}" aria-busy=${mapReady ? 'false' : 'true'}></section>`
        }
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
      return current?.kind === 'text' ? current.bookUid : undefined;
    },
    get ownerUid() {
      return current?.kind === 'paperMap' ? current.ownerUid : undefined;
    },
    get lightAt() {
      return current?.kind === 'text' ? current.lightAt : undefined;
    },
    setProgress(next: ReadingProgress | undefined) {
      if (!current || (progress?.value === next?.value && progress?.max === next?.max)) {
        return;
      }
      progress = next;
      draw();
    },
    open(request: ReadRequest, ready: Promise<unknown> = Promise.resolve()) {
      if (!current) {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      }
      current = request;
      progress = undefined;
      mapReady = request.kind !== 'paperMap';
      generation += 1;
      const opened = generation;
      host.hidden = false;
      draw();
      host.querySelector<HTMLElement>('article')!.focus({ preventScroll: true });
      changed();
      if (request.kind === 'paperMap') {
        ready.then(() => {
          if (generation === opened && current === request) {
            mapReady = true;
            draw();
          }
        });
      }
    },
    revalidate(ownsMap: (ownerUid: number) => boolean) {
      if (current?.kind === 'paperMap' && !ownsMap(current.ownerUid)) {
        close();
      }
    },
    close,
    onAction(action: string) {
      if (!current) {
        return false;
      }
      if (action === 'reading.close') {
        close();
      } else if (current.kind === 'text') {
        scrollText(host.querySelector<HTMLElement>('.reading-text')!, action);
      }
      return true;
    },
  };
};
