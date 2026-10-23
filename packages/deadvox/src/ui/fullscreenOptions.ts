import { html, render } from 'lit-html';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { BROWSER_CHORD_LOCK_CODES } from '../game/inputBindings.ts';
import { factDetail } from './factDetail.ts';

const KEY_PREFIX = /^Key/;

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
    keyboard.lock(BROWSER_CHORD_LOCK_CODES).catch(() => undefined);
  } else {
    keyboard.unlock?.();
  }
};

// The keys the game takes are the lock codes it asks for, so the fact cannot name a stale list.
const takenShortcuts = BROWSER_CHORD_LOCK_CODES.map((code) => `Ctrl+${code.replace(KEY_PREFIX, '')}`).join(', ');

export const mountFullscreenOptions = (root: HTMLElement, text: ScreenText['options']): void => {
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
        }}>${on ? text.leaveFullscreen : text.fullscreen}</button>
        ${factDetail(text.browserShortcutsLabel, fillText(text.browserShortcuts, { shortcuts: takenShortcuts }))}
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
