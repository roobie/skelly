import { readdirSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

it('refuses startup rather than inventing a run when rejected content removes the declared entry start', async () => {
  // Mocks rather than a second Vite server (#557): that server re-transformed the content graph Vitest has
  // already transformed for other files, and its client dependency optimizer re-bundled the app whenever the
  // checkout's shared cache was stale, enough CPU to cross the default timeout on a loaded host.
  for (const file of readdirSync(new URL('../mods/skelly.deadvox.residual/', import.meta.url))) {
    // Keep the content needed by config and the binding registry while isolating layout rejection.
    if (
      file.endsWith('.json') &&
      !['dayCycle.json', 'controls.json', 'graphics.json', 'weathering.json'].includes(file)
    ) {
      vi.doMock(`../mods/skelly.deadvox.residual/${file}`, () => ({ default: file === 'layouts.json' ? { layouts: {} } : {} }));
    }
  }
  const { buildBundledContent } = await import('../src/game/bundledContent.ts');
  const { configFromUrl } = await import('../src/game/config.ts');
  const content = buildBundledContent();
  expect(content.issues.some(({ path }) => path === 'defaultStart')).toBe(true);
  expect(() => configFromUrl(new URLSearchParams(), content)).toThrow(
    `No admitted playable start "${content.defaultStart}"`,
  );
});
