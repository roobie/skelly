import { html, render } from 'lit-html';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import type { WorldLoading } from '../game/worldLoading.ts';

export function mountWorldLoading(loading: WorldLoading, text: ScreenText['worldLoading']): () => void {
  const mask = document.getElementById('world-loading')!;
  const startupProgress = document.getElementById('startup-progress')!;
  const errors = new AbortController();
  const draw = () => {
    mask.hidden = loading.ready;
    startupProgress.hidden = loading.state === 'failed';
    mask.dataset.state = loading.state;
    if (loading.state !== 'loading') {
      errors.abort();
    }
    render(
      html`
      ${startupProgress}
      <span id="world-loading-message">${loading.state === 'failed' ? fillText(text.failed, { error: loading.error }) : text.loading}</span>
      <button id="world-loading-reload" type="button" ?hidden=${loading.state !== 'failed'} @click=${() => location.reload()}>${text.reload}</button>
    `,
      mask,
    );
  };
  const fail = (error: unknown) => {
    loading.fail(error);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    draw();
  };
  globalThis.addEventListener('error', (event) => fail(event.error ?? event.message), { signal: errors.signal });
  globalThis.addEventListener('unhandledrejection', (event) => fail(event.reason), { signal: errors.signal });
  draw();
  return draw;
}
