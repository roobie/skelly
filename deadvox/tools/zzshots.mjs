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
    await page.waitForFunction(
      () => {
        const m = /(\d+) pending/.exec(document.body.innerText);
        return m !== null && Number(m[1]) <= 2;
      },
      null,
      { timeout: 400_000, polling: 2000 },
    );
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${prefix}${i}.png`, timeout: 90_000 });
    console.log(`shot ${prefix}${i} cam=${cam}`);
    await page.close();
  }
} finally {
  await browser.close();
}
