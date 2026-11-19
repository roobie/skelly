// biome-ignore-all lint/correctness/noNodejsModules: dev tool; drives the game page in headless Chromium and writes PNGs
// biome-ignore-all lint/suspicious/noConsole: CLI report goes to stdout/stderr
// biome-ignore-all lint/performance/noAwaitInLoops: one browser draws the sheets, one after another
//
// Building contact sheets: elevations, a street view, a roofline view and per-storey plans of authored
// buildings and sites, drawn by the game's own page and renderer.
//
//   node tools/building-sheet.mjs <id>... [--start <start id>] [--variant <slot>=<choice>]... [--out <dir>]
//     [--size WxH] [--gpu]
//
// An id names a template, an assembly or a layout. A template or assembly stands alone on flat ground at noon, or
// with --start is drawn at every placement of it on that start's site. A layout is drawn whole and then placement
// by placement. --variant draws the named alternative in that slot, a nested slot named by its path such as
// house/roof, by drawing at a seed that draws it. Each id's sheets land in <out>/<id>; the default --out is
// test-results/building-sheets. Several ids share one browser. --gpu draws on the host's GPU instead of
// SwiftShader. Why: `docs/building-sheet.md`.
//
// One-time per host: `npx playwright install chromium`.

import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkSheetRequest, parseVariants, renderBuildingSheet, STAGE } from '../test/browser/buildingSheet.mjs';
import { launchChromium } from '../test/browser/chromium.mjs';
import { hostGpuArgs } from '../test/browser/stage-mode.mjs';
import { createStageServer, listeningPort } from '../test/browser/stageServer.mjs';

const USAGE =
  'usage: node tools/building-sheet.mjs <id>... [--start <start id>] [--variant <slot>=<choice>]... [--out <dir>] [--size WxH] [--gpu]';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

/** @type {(message: string) => never} */
const usage = (message) => {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
};

const { values, positionals: ids } = parseArgs({
  allowPositionals: true,
  options: {
    start: { type: 'string' },
    variant: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: resolve(projectRoot, 'test-results/building-sheets') },
    size: { type: 'string', default: '1280x720' },
    gpu: { type: 'boolean', default: false },
  },
});
if (ids.length === 0) {
  usage('expected at least one template, assembly or layout id');
}
const size = /^(\d+)x(\d+)$/.exec(values.size);
if (!size) {
  usage(`--size expects WxH, got "${values.size}"`);
}
const viewport = { width: Number(size[1]), height: Number(size[2]) };
/** @type {ReturnType<typeof parseVariants>} */
let variants = {};
try {
  variants = parseVariants(values.variant);
  for (const id of ids) {
    checkSheetRequest({ id, ...(values.start ? { start: values.start } : {}) });
  }
} catch (error) {
  usage(error instanceof Error ? error.message : String(error));
}

const begun = performance.now();
const vite = await createStageServer({
  root: projectRoot,
  configFile: resolve(projectRoot, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  browser = await launchChromium(STAGE, {
    headless: true,
    args: ['--enable-webgl', ...(values.gpu ? hostGpuArgs : [])],
  });
  const origin = `http://127.0.0.1:${listeningPort(vite)}`;
  for (const id of ids) {
    const files = await renderBuildingSheet(browser, origin, {
      id,
      ...(values.start ? { start: values.start } : {}),
      ...(Object.keys(variants).length > 0 ? { variants } : {}),
      out: resolve(values.out, id),
      viewport,
      log: (line) =>
        console.error(`building-sheet: ${((performance.now() - begun) / 1000).toFixed(1)} s ${id} ${line}`),
    });
    console.log(files.join('\n'));
  }
} finally {
  await browser?.close();
  await vite.close();
}
