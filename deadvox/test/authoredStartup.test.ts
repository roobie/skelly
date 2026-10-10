import { readdirSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

it('starts normal sites when a malformed bundled layout file is rejected whole', async () => {
  // Mocks rather than a second Vite server (#557): that server re-transformed the content graph Vitest has
  // already transformed for other files, and its client dependency optimizer re-bundled the app whenever the
  // checkout's shared cache was stale, enough CPU to cross the default timeout on a loaded host.
  for (const file of readdirSync(new URL('../src/content/base/', import.meta.url))) {
    if (file.endsWith('.json') && file !== 'dayCycle.json') {
      vi.doMock(`../src/content/base/${file}`, () => ({ default: file === 'layouts.json' ? { layouts: {} } : {} }));
    }
  }
  const config = await import('../src/game/config.ts');
  expect(config.configFromUrl(new URLSearchParams()).site).toBe('hamlet');
  expect(config.configFromUrl(new URLSearchParams('site=city')).site).toBe('city');
  expect(config.configFromUrl(new URLSearchParams('site=lone_house')).site).toBe('hamlet');
});
