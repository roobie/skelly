// biome-ignore-all lint/correctness/noNodejsModules: throwaway dev tool
// biome-ignore-all lint/suspicious/noConsole: throwaway dev tool
// biome-ignore-all lint/performance/noAwaitInLoops: throwaway dev tool
import process from 'node:process';
import { launchChromium } from '../test/browser/chromium.mjs';

const [base, prefix, ...cams] = process.argv.slice(2);
const browser = await launchChromium('render-probe', {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
try {
  for (const [i, cam] of cams.entries()) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const url = new URL(base);
    url.searchParams.set('cam', cam);
    await page.goto(url.href, { timeout: 60_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false', null, {
      timeout: 120_000,
    });
    await page.click('#go');
    await page.waitForFunction(() => document.querySelector('#world-loading')?.checkVisibility?.() !== true, null, {
      timeout: 180_000,
    });
    for (let t = 0; t < 1; t++) {
      await page.waitForTimeout(20_000);
      const text = await page.evaluate(() => {
        const g = globalThis;
        const w = g.gauntletWitness ?? g.worldLoadWitness;
        const el = document.querySelector('#world-loading');
        return JSON.stringify({
          chunks: /chunks[^\n]*/.exec(document.body.innerText)?.[0],
          witness: Object.keys(g).filter((k) => /witness/i.test(k)),
          loadingEl: el ? [el.className, el.hidden, el.checkVisibility?.()] : null,
          ready: w?.worldLoading?.ready,
          paused: w?.session?.sim?.paused,
          locked: w?.input?.locked,
          unmeshed: w?.engine?.streamer?.unmeshedColumns?.(w.session.body.pos[0], w.session.body.pos[2], w.engine.config.radiusChunks),
          lockEl: document.pointerLockElement !== null,
        });
      });
      console.log(`t=${(t + 1) * 20}s ${text}`);
    }
    await page.screenshot({ path: `${prefix}${i}.png`, timeout: 90_000 });
    console.log(`shot ${prefix}${i} cam=${cam}`);
    await page.close();
  }
} finally {
  await browser.close();
}
