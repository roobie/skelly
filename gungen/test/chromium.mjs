import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gungen = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(resolve(gungen, '../deadvox/node_modules/playwright/index.mjs'));

export function launchChromium(args = []) {
  return chromium.launch({ headless: true, args });
}
