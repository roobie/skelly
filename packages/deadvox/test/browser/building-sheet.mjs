// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/suspicious/noMisplacedAssertion: Node's test runner owns these assertions
// biome-ignore-all lint/performance/noAwaitInLoops: one decoder page checks the pictures in turn
// The building sheet tool end to end on a small template: every view it plans lands as a drawn picture.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderBuildingSheet, SHEET_INDEX, STAGE } from './buildingSheet.mjs';
import { launchChromium } from './chromium.mjs';
import { minimumViewRadiusM, stageLookBaseline } from './gameUrl.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const TEMPLATE = 'shed';

/**
 * Whether a PNG holds more than one colour, decoded by the browser so the stage needs no image library.
 * @param {string} base64
 */
const varied = async (base64) => {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The canvas has no 2D context');
  }
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let at = 4; at < data.length; at += 4) {
    if (data[at] !== data[0] || data[at + 1] !== data[1] || data[at + 2] !== data[2]) {
      return true;
    }
  }
  return false;
};

const vite = await createStageServer({
  root: projectRoot,
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  browser = await launchChromium(STAGE, { headless: true, args: ['--enable-webgl'] });
  const results = resolve(projectRoot, 'test-results');
  await mkdir(results, { recursive: true });
  const out = await mkdtemp(resolve(results, 'building-sheet-'));
  const files = await renderBuildingSheet(browser, `http://127.0.0.1:${listeningPort(vite)}`, {
    kind: 'template',
    id: TEMPLATE,
    out,
    viewport: { width: 320, height: 200 },
    hash: { ...stageLookBaseline, radius: minimumViewRadiusM },
    // A hung wait ends at the CI step's timeout; the last phase line names the stuck wait.
    log: (line) => process.stdout.write(`BUILDING_SHEET_PHASE ${line}\n`),
  });
  const pictures = files.filter((file) => file.endsWith('.png'));
  const sheet = await readFile(resolve(out, SHEET_INDEX), 'utf8');
  const decoder = await browser.newPage();
  await test('The building sheet writes every planned view as a drawn picture', async () => {
    const names = pictures.map((file) => basename(file));
    for (const view of ['front.png', 'side.png', 'back.png', 'street.png', 'roofline.png']) {
      assert.ok(names.includes(view), `the sheet has ${view}`);
    }
    assert.ok(
      names.some((name) => name.startsWith('plan-')),
      'the sheet has a plan',
    );
    for (const file of pictures) {
      assert.ok((await stat(file)).size > 0, `${basename(file)} is not empty`);
      const base64 = (await readFile(file)).toString('base64');
      assert.ok(await decoder.evaluate(varied, base64), `${basename(file)} is not one flat colour`);
      assert.ok(sheet.includes(`](${basename(file)})`), `the index shows ${basename(file)}`);
    }
  });
} finally {
  await browser?.close();
  await vite.close();
}
