import { createServer } from 'vite';
import { expect, it } from 'vitest';
import type * as Config from '../src/game/config.ts';

it('starts normal sites when a malformed bundled layout file is rejected whole', async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [
      {
        name: 'malformed-layout-startup-control',
        enforce: 'pre',
        load(id) {
          if (id.endsWith('/src/game/bundledContent.ts')) {
            return `import { buildRegistry } from '../core/content.ts';\nexport const BUNDLED_CONTENT = buildRegistry([{ source: 'layouts.json', data: { layouts: {} } }]);`;
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
