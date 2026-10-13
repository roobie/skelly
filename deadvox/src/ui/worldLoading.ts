import { html, render } from 'lit-html';
import type { WorldLoading } from '../game/worldLoading.ts';

export function mountWorldLoading(loading: WorldLoading): () => void {
  const mask = document.getElementById('world-loading')!;
  const errors = new AbortController();
  const draw = () => {
    mask.hidden = loading.ready;
    mask.dataset.state = loading.state;
    if (loading.state !== 'loading') {
      errors.abort();
    }
    render(
      html`
      <div class="loading-spinner" aria-hidden="true"></div>
      <span id="world-loading-message">${loading.state === 'failed' ? `Unable to load the world: ${loading.error}` : 'Building the world around you…'}</span>
      <button id="world-loading-reload" type="button" ?hidden=${loading.state !== 'failed'} @click=${() => location.reload()}>Reload game</button>
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
