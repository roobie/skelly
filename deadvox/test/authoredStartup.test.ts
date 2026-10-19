import { readdirSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

it('starts normal sites when a malformed bundled layout file is rejected whole', async () => {
  // Mocks rather than a second Vite server (#557): that server re-transformed the content graph Vitest has
  // already transformed for other files, and its client dependency optimizer re-bundled the app whenever the
  // checkout's shared cache was stale, enough CPU to cross the default timeout on a loaded host.
  for (const file of readdirSync(new URL('../src/content/base/', import.meta.url))) {
    // The binding registry reads the default keys at import, so the real file stays.
    if (file.endsWith('.json') && file !== 'dayCycle.json' && file !== 'controls.json') {
      vi.doMock(`../src/content/base/${file}`, () => ({ default: file === 'layouts.json' ? { layouts: {} } : {} }));
    }
  }
  const { buildBundledContent } = await import('../src/game/bundledContent.ts');
  const { configFromUrl } = await import('../src/game/config.ts');
  const content = buildBundledContent();
  expect(configFromUrl(new URLSearchParams(), content).site).toBe('hamlet');
  expect(configFromUrl(new URLSearchParams('site=city'), content).site).toBe('city');
  expect(configFromUrl(new URLSearchParams('site=lone_house'), content).site).toBe('hamlet');
});
