// biome-ignore-all lint/correctness/noNodejsModules: standalone browser regression contract

import test from 'node:test';
import { launchChromium } from './chromium.mjs';
import { gauntletFlow } from './gauntlet-flow.mjs';
import { saveControllerServer } from './save-controller-fixture.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const { server, address } = await saveControllerServer();
const browser = await launchChromium('gauntlet-save-regressions', { headless: true });
const url = browserStageUrl('gauntlet-save-regressions', address);

try {
  await test('gauntlet discovery, resources and ordinary traversal preserve running, won and dead save boundaries', async () => {
    await gauntletFlow(browser, url);
  });
} finally {
  await browser.close();
  await server.close();
}
