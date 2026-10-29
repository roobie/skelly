// biome-ignore-all lint: temporary probe
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from '../test/browser/chromium.mjs';
import { observationPlugin } from '../test/browser/primary-action-observation.mjs';
import { browserStageUrl } from '../test/browser/stage-mode.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(projectRoot, 'test-results/zz-drift');
await mkdir(out, { recursive: true });
const optic = process.argv[2] ?? 'optic_holographic';
const skill = process.argv[3];
const tag = `${optic}-s${skill ?? 'default'}`;
const vite = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'error',
  plugins: [observationPlugin],
  server: { host: '127.0.0.1', port: 0 },
});
await vite.listen();
const port = vite.httpServer.address().port;
const browser = await launchChromium('primary-action-pixel', {
  headless: !process.env.DISPLAY || process.env.ZZ_HEADLESS === '1',
  args: ['--enable-webgl'],
  renderMode: 'pixel',
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => process.stdout.write(`PAGE_ERROR ${e.stack}\n`));
  await page.addInitScript(() => {
    let locked = false;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => (locked ? document.querySelector('#view canvas') : null),
    });
    Element.prototype.requestPointerLock = () => {
      locked = true;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
  });
  await page.goto(
    browserStageUrl(
      'primary-action-pixel',
      `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=32&time=12:00&at=-4,-0.5,-90&loadout=ar&optic=${optic}${skill === undefined ? '' : `&firearmsCombat=${skill}`}`,
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await page.waitForFunction(() => globalThis.primaryActionTest && document.querySelector('#overlay')?.hidden);
  await page.waitForFunction(() => document.querySelector('#world-loading')?.dataset.state === 'ready');
  const info = await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    return {
      hands: Object.keys(r.inventory.hands).map((k) => [k, r.inventory.hands[k]?.type]),
      ads: r.input.aimingDownSights,
    };
  });
  process.stdout.write(`INFO ${JSON.stringify(info)}\n`);
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => {
    const r = globalThis.primaryActionTest;
    return r.session.firearms.isReady(r.inventory.hands.right.uid);
  });
  await page.mouse.click(640, 450, { button: 'middle' });
  await page.waitForFunction(() => globalThis.primaryActionTest.input.aimingDownSights);
  await page.waitForTimeout(1500);
  process.stdout.write(`ADS ${await page.evaluate(() => globalThis.primaryActionTest.input.aimingDownSights)}\n`);
  const clip = await page.locator('#view canvas').boundingBox();
  for (const phase of ['rest', 'walk']) {
    if (phase === 'walk') {
      await page.keyboard.down('w');
    }
    const samples = [];
    for (let i = 0; i < 12; i++) {
      const s = await page.evaluate(() => {
        const f = globalThis.primaryActionTest.view.held.opticLensFrame;
        return f
          ? { c: f.center, r: f.radius, d: f.reticleCenter, ads: globalThis.primaryActionTest.input.aimingDownSights }
          : null;
      });
      samples.push(s);
      if (i % 4 === 0) {
        await writeFile(resolve(out, `${tag}-${phase}-${i}.png`), await page.screenshot({ clip }));
      }
      await page.waitForTimeout(330);
    }
    if (phase === 'walk') {
      await page.keyboard.up('w');
    }
    const px = samples.filter(Boolean).map((s) => ({
      dx: +((s.d[0] - s.c[0]) * clip.width).toFixed(2),
      dy: +((s.d[1] - s.c[1]) * clip.height).toFixed(2),
      rx: +(s.r[0] * clip.width).toFixed(1),
      ry: +(s.r[1] * clip.height).toFixed(1),
    }));
    process.stdout.write(`DRIFT ${tag} ${phase} ${JSON.stringify(px)}\n`);
  }
} finally {
  await browser.close();
  await vite.close();
}
