// biome-ignore-all lint/correctness/noNodejsModules: standalone native-input browser contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative end-to-end assertions
// biome-ignore-all lint/style/noProcessEnv: executable and optional artifact directory are runner configuration
// biome-ignore-all lint/performance/noAwaitInLoops: native arrow navigation is sequential
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import('playwright');

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const marker = '  const onForwardPress = (e: MouseEvent) => {';
const observation = {
  name: 'pump-handling-readonly-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    assert(code.includes(marker), 'pump observation anchor exists');
    return code.replace(
      marker,
      `
  Object.assign(globalThis, { pumpHandlingTest: { session, input, camera, audio } });
  const observeStartSource = audio.startSource.bind(audio);
  audio.startSource = (source) => {
    globalThis.pumpCurrentAudioEvent = source.event;
    try { return observeStartSource(source); }
    finally { globalThis.pumpCurrentAudioEvent = undefined; }
  };
${marker}`,
    );
  },
};
const vite = await createServer({
  root: projectRoot,
  configFile: resolve(projectRoot, 'vite.config.ts'),
  logLevel: 'error',
  plugins: [observation],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--password-store=basic',
      '--enable-webgl',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.pumpDecoded = [];
    globalThis.pumpRDownAt = 0;
    addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && !event.repeat) {
        globalThis.pumpRDownAt = event.timeStamp;
      }
    });
    const { start } = AudioBufferSourceNode.prototype;
    AudioBufferSourceNode.prototype.start = function (...args) {
      globalThis.pumpDecoded.push({
        event: globalThis.pumpCurrentAudioEvent,
        rate: this.buffer?.sampleRate,
        contextRate: this.context.sampleRate,
        channels: this.buffer?.numberOfChannels,
        duration: this.buffer?.duration,
      });
      return start.apply(this, args);
    };
  });
  await page.goto(
    `http://127.0.0.1:${address.port}/?debug=1&loadout=pump&site=testHouse&time=12%3A00&seed=7&radius=64`,
  );
  await page.waitForFunction(() => globalThis.pumpHandlingTest && document.querySelector('#debug-ui-root'));
  await page.locator('#go').click();
  await page.waitForFunction(() => document.pointerLockElement && document.querySelector('#overlay').hidden);
  await page.keyboard.press('KeyH');
  assert.equal(
    await page.evaluate(() => globalThis.pumpHandlingTest.session.sim.godMode),
    true,
    'native God key isolates mortality',
  );
  const ids = await page.evaluate(() => {
    const inv = globalThis.pumpHandlingTest.session.inventory;
    return { gun: inv.hands.right.uid, box: [...inv.items()].find((item) => item.type === 'shotshell_box').uid };
  });
  const select = async (uid) => {
    const count = await page.locator('#inventory [data-uid]').count();
    for (let i = 0; i <= count; i++) {
      if (await page.locator(`#inventory [data-uid="${uid}"].selected`).count()) {
        return;
      }
      await page.keyboard.press('ArrowDown');
    }
    throw new Error(`Native arrows cannot select ${uid}`);
  };
  const observe = () =>
    page.evaluate((selectedIds) => {
      const { session, camera } = globalThis.pumpHandlingTest;
      const inv = session.inventory;
      return {
        hand: inv.hands.right?.uid ?? null,
        box: Boolean(inv.itemByUid(selectedIds.box)),
        loose: [...inv.items()]
          .filter((item) => item.type === 'shell_12_gauge_00_buck')
          .reduce((sum, item) => sum + item.count, 0),
        gun: structuredClone(inv.itemByUid(selectedIds.gun)?.firearm),
        jobs: session.queue.jobs.length,
        rest: session.rest.action?.kind ?? null,
        fov: camera.fov,
        paused: session.sim.paused,
        dead: session.sim.dead ?? null,
        sounds: globalThis.pumpHandlingTest.audio.heardSounds,
      };
    }, ids);
  await page.keyboard.press('Tab');
  await select(ids.box);
  await page.keyboard.press('KeyH');
  await page.waitForFunction((uid) => {
    const s = globalThis.pumpHandlingTest.session;
    return !s.queue.busy && s.inventory.hands.right?.uid === uid;
  }, ids.box);
  await page.keyboard.press('Tab');
  await page.mouse.click(640, 450);
  await page.waitForFunction(() =>
    globalThis.pumpHandlingTest.session.queue.jobs.some((job) => job.jobType === 'item.unpack'),
  );
  await page.keyboard.press('KeyX');
  const cancelled = await observe();
  assert.equal(cancelled.box, true);
  assert.equal(cancelled.loose, 0);
  assert.equal(cancelled.jobs, 0);
  await page.mouse.click(640, 450);
  await page.waitForFunction((uid) => !globalThis.pumpHandlingTest.session.inventory.itemByUid(uid), ids.box);
  const unpacked = await observe();
  assert.equal(unpacked.loose, 20);
  assert.equal(unpacked.hand, null);
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => performance.now() - globalThis.pumpRDownAt >= 250);
  assert.equal((await observe()).rest, null, 'R with no reloadable item does not rest');
  await page.keyboard.press('Tab');
  await select(ids.gun);
  await page.keyboard.press('KeyH');
  await page.waitForFunction((uid) => {
    const s = globalThis.pumpHandlingTest.session;
    return !s.queue.busy && s.inventory.hands.right?.uid === uid;
  }, ids.gun);
  await page.keyboard.press('Tab');
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => performance.now() - globalThis.pumpRDownAt >= 250);
  const tapped = await observe();
  assert.equal(tapped.jobs, 0);
  assert.equal(tapped.loose, 20);
  assert.deepEqual(tapped.gun.tube, []);
  assert.equal(tapped.rest, null);
  await page.keyboard.down('KeyR');
  await page.waitForFunction(() =>
    globalThis.pumpHandlingTest.session.queue.jobs.some((job) => job.jobType === 'firearm.load'),
  );
  await page.keyboard.up('KeyR');
  const released = await observe();
  assert.equal(released.loose, 20);
  assert.equal(released.jobs, 0);
  assert.deepEqual(released.gun.tube, []);
  await page.keyboard.down('KeyR');
  await page.waitForFunction(
    (uid) => globalThis.pumpHandlingTest.session.inventory.itemByUid(uid).firearm.tube.length === 4,
    ids.gun,
  );
  await page.keyboard.up('KeyR');
  const loaded = await observe();
  assert.equal(loaded.loose, 16);
  assert.equal(loaded.jobs, 0);
  assert.equal(loaded.rest, null);
  if (process.env.PUMP_ARTIFACT_DIR) {
    await mkdir(process.env.PUMP_ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: resolve(process.env.PUMP_ARTIFACT_DIR, 'loaded.png') });
  }
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyR');
  await page.waitForFunction(
    (uid) => globalThis.pumpHandlingTest.session.inventory.itemByUid(uid).firearm.cycle?.mode === 'hand',
    ids.gun,
  );
  await page.waitForFunction((uid) => {
    const s = globalThis.pumpHandlingTest.session;
    return !s.queue.busy && s.inventory.itemByUid(uid).firearm.chamber === 'round';
  }, ids.gun);
  const racked = await observe();
  assert.equal(racked.loose, 16);
  assert.equal(racked.gun.tube.length, 3);
  assert.equal(racked.rest, null);
  await page.mouse.click(640, 450);
  await page.waitForFunction(
    (uid) => globalThis.pumpHandlingTest.session.inventory.itemByUid(uid).firearm.chamber === 'case',
    ids.gun,
  );
  const fired = await observe();
  assert.equal(fired.gun.cycle, undefined);
  assert.equal(fired.gun.tube.length, 3);
  assert.equal(fired.loose, 16);
  assert.equal(fired.dead, null);
  assert.equal(fired.fov, 75);
  assert.deepEqual(errors, []);
  await page.waitForFunction(() => globalThis.pumpDecoded.some((source) => source.event === 'shotgun_blast'));
  const decoded = await page.evaluate(() =>
    globalThis.pumpDecoded.filter((source) => source.event === 'shotgun_insert' || source.event === 'shotgun_blast'),
  );
  assert.ok(decoded.some((source) => source.event === 'shotgun_insert'));
  assert.ok(decoded.some((source) => source.event === 'shotgun_blast'));
  for (const source of decoded) {
    assert.equal(source.rate, source.contextRate, 'WebAudio resamples the encoded 48kHz asset to the actual context');
    assert.equal(source.channels, 1);
    assert.ok(source.duration > 0);
  }
  process.stdout.write(
    `${JSON.stringify({ cancelled, unpacked, tapped, released, loaded, racked, fired, decoded, errors })}\n`,
  );
} finally {
  await browser?.close();
  await vite.close();
}
