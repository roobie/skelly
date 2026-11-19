// biome-ignore-all lint/correctness/noNodejsModules: dev tool; drives the game page in headless Chromium and writes PNGs
// biome-ignore-all lint/suspicious/noConsole: CLI report goes to stdout/stderr
//
// Building contact sheet: elevations, a street view, a roofline view and per-storey plans of one authored
// building, drawn by the game's own page and renderer.
//
//   node tools/building-sheet.mjs <template|assembly> <id> [--start <start mod id>] [--out <dir>] [--size WxH]
//
// Without --start a template stands alone on flat ground at noon; with it, the building is drawn where that
// start's site first places it. An assembly needs --start. The default --out is
// test-results/building-sheets/<id>. Why the views are what they are: `docs/building-sheet.md`.
//
// One-time per host: `npx playwright install chromium`.

import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderBuildingSheet, STAGE } from '../test/browser/buildingSheet.mjs';
import { launchChromium } from '../test/browser/chromium.mjs';
import { createStageServer, listeningPort } from '../test/browser/stageServer.mjs';

const USAGE =
  'usage: node tools/building-sheet.mjs <template|assembly> <id> [--start <start mod id>] [--out <dir>] [--size WxH]';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

/** @type {(message: string) => never} */
const usage = (message) => {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    start: { type: 'string' },
    out: { type: 'string' },
    size: { type: 'string', default: '1280x720' },
  },
});
const [kind, id, ...extra] = positionals;
if (!((kind === 'template' || kind === 'assembly') && id) || extra.length > 0) {
  usage('expected a kind (template or assembly) and one id');
}
const size = /^(\d+)x(\d+)$/.exec(values.size);
if (!size) {
  usage(`--size expects WxH, got "${values.size}"`);
}
const viewport = { width: Number(size[1]), height: Number(size[2]) };
const out = resolve(values.out ?? resolve(projectRoot, 'test-results/building-sheets', id));

const vite = await createStageServer({
  root: projectRoot,
  configFile: resolve(projectRoot, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  browser = await launchChromium(STAGE, { headless: true, args: ['--enable-webgl'] });
  const files = await renderBuildingSheet(browser, `http://127.0.0.1:${listeningPort(vite)}`, {
    kind,
    id,
    ...(values.start ? { start: values.start } : {}),
    out,
    viewport,
    log: (line) => console.error(`building-sheet: ${line}`),
  });
  console.log(files.join('\n'));
} finally {
  await browser?.close();
  await vite.close();
}
