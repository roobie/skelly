// biome-ignore-all lint/correctness/noNodejsModules: standalone maintained browser test starts Chrome.
// biome-ignore-all lint/style/noProcessEnv: evidence destination and event base are runner configuration.
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './chromium.mjs';
import { measureMainFirstMesh } from './sky-main-arrival.mjs';
import { addCamoWitnessTemplate, CAMO_WITNESS, injectSiteFixture } from './stairs-fixture.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = resolve(process.env.STAIRS_ARTIFACT_DIR ?? 'test-results/stairs');
await mkdir(artifacts, { recursive: true });
const browser = await launchChromium('main-first-mesh', { headless: process.env.BROWSER_HEADED !== '1' });
try {
  // The reference lands on the camo fixture scene, so its arrival evidence describes the same geometry the
  // camo stage captures. The manufactured-blocks rewrite stays camo-only: nothing reads pixels here.
  const fixtureTransform = (code, id) => {
    if (id.endsWith('/mods/skelly.deadvox.scenario.stairs/templates-stairs.json')) {
      return addCamoWitnessTemplate(code);
    }
    return id.endsWith('/engine/src/core/authoredSite.ts') ? injectSiteFixture(code, CAMO_WITNESS) : null;
  };
  await measureMainFirstMesh(browser, {
    root,
    artifacts,
    viewport: { width: 640, height: 400 },
    fixtureTransform,
    eventPath: process.env.GITHUB_EVENT_PATH,
  });
} finally {
  await browser.close();
}
