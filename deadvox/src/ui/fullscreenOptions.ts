import { html, render } from 'lit-html';
import { factDetail } from './factDetail.ts';

// Escape is left out so a tap still frees the pointer and the browser's own fullscreen exit stays.
const KEYBOARD_LOCK_CODES = ['KeyW', 'KeyT', 'KeyN', 'Tab'];

interface KeyboardLockApi {
  lock?: (codes: string[]) => Promise<void>;
  unlock?: () => void;
}

export const syncKeyboardLock = (
  doc: Pick<Document, 'fullscreenElement'>,
  keyboard: KeyboardLockApi | undefined = (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard,
): void => {
  if (typeof keyboard?.lock !== 'function') {
    return;
  }
  if (doc.fullscreenElement) {
    keyboard.lock(KEYBOARD_LOCK_CODES).catch(() => undefined);
  } else {
    keyboard.unlock?.();
  }
};

export const mountFullscreenOptions = (root: HTMLElement): void => {
  if (!document.fullscreenEnabled) {
    return;
  }
  const draw = (): void => {
    const on = Boolean(document.fullscreenElement);
    render(
      html`<section class="fullscreen-options">
        <button type="button" @click=${() => {
          const change = on ? document.exitFullscreen() : document.documentElement.requestFullscreen();
          change.catch(() => undefined);
        }}>${on ? 'Leave fullscreen' : 'Fullscreen'}</button>
        ${factDetail('Browser shortcuts', 'In fullscreen, Chromium browsers let the game take Ctrl+W, Ctrl+T, Ctrl+N and Ctrl+Tab during play.')}
      </section>`,
      root,
    );
  };
  document.addEventListener('fullscreenchange', () => {
    syncKeyboardLock(document);
    draw();
  });
  draw();
};
