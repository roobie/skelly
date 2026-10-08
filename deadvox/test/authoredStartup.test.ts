import { createServer } from 'vite';
import { expect, it } from 'vitest';
import type * as Config from '../src/game/config.ts';

it('starts normal sites when a malformed bundled layout file is rejected whole', async () => {
  const server = await createServer({
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [
      {
        name: 'malformed-layout-startup-control',
        enforce: 'pre',
        load(id) {
          if (id.endsWith('/src/content/base/layouts.json')) {
            return JSON.stringify({ layouts: {} });
          }
          return null;
        },
      },
    ],
  });
  try {
    const config = (await server.ssrLoadModule('/src/game/config.ts')) as typeof Config;
    expect(config.configFromUrl(new URLSearchParams()).site).toBe('hamlet');
    expect(config.configFromUrl(new URLSearchParams('site=city')).site).toBe('city');
    expect(config.configFromUrl(new URLSearchParams('site=lone_house')).site).toBe('hamlet');
  } finally {
    await server.close();
  }
});
