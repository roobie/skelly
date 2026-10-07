// biome-ignore-all lint/correctness/noNodejsModules: standalone native-input browser contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative end-to-end assertions
// biome-ignore-all lint/style/noProcessEnv: browser executable path is runner configuration
// biome-ignore-all lint/performance/noAwaitInLoops: native arrow navigation is sequential
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { RELOAD_GESTURE_MS } from '../../src/game/reloadInput.ts';
import { launchChromium } from './chromium.mjs';
import { holdAction, pressAction, pressCdpActionBurst } from './input-actions.mjs';
import { browserStageUrl } from './stage-mode.mjs';

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
  Object.assign(globalThis, { pumpHandlingTest: { session, input, camera, audio, screen,
    getNotice: () => notice, getFramePacing: () => frameInterval.summary() } });
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
  browser = await launchChromium('pump-handling', {
    headless: true,
    args: ['--password-store=basic'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.pumpDecoded = [];
    globalThis.pumpRDownAt = 0;
    globalThis.pumpRDowns = [];
    globalThis.pumpWebGLRequests = [];
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        globalThis.pumpWebGLRequests.push(type);
      }
      return Reflect.apply(nativeGetContext, this, [type, ...args]);
    };
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
    browserStageUrl(
      'pump-handling',
      `http://127.0.0.1:${address.port}/?debug=1&loadout=pump&site=testHouse&time=12%3A00&seed=7&radius=64`,
    ),
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await page.waitForFunction(() => globalThis.pumpHandlingTest && document.querySelector('#debug-ui-root'));
  await page.waitForFunction(() => document.pointerLockElement && document.querySelector('#overlay').hidden);
  const reloadCode = await page.evaluate(
    `import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.chords('firearm.reload')[0].code)`,
  );
  await page.evaluate((code) => {
    addEventListener('keydown', (event) => {
      if (event.code === code && !event.repeat) {
        globalThis.pumpRDownAt = event.timeStamp;
        globalThis.pumpRDowns.push(event.timeStamp);
      }
    });
  }, reloadCode);
  assert.deepEqual(
    await page.evaluate(() => globalThis.pumpWebGLRequests),
    [],
    'render-free pump handling must not request a WebGL context',
  );
  await pressAction(page, 'debug.god-toggle');
  assert.equal(
    await page.evaluate(() => globalThis.pumpHandlingTest.session.sim.godMode),
    true,
    'native God key isolates mortality',
  );
  const ids = await page.evaluate(() => {
    const inv = globalThis.pumpHandlingTest.session.inventory;
    const gun = inv.hands.right;
    const backpackUid = inv.worn.back?.uid;
    const box = [...inv.items()].find(
      ({ item, location }) =>
        location.kind === 'pocket' && location.owner.uid === backpackUid && inv.registry.items.get(item.type)?.unpack,
    )?.item;
    if (!box) {
      throw new Error('Native pump loadout has no sealed box');
    }
    const { count: payload, item: payloadType } = inv.registry.items.get(box.type).unpack;
    const { capacity } = inv.registry.models.get(inv.registry.items.get(gun.type).model).tube;
    // The loadout's own loose shells (BR, 2026-10-07 15:54), before the box adds its payload.
    const carried = [...inv.items()]
      .filter(
        ({ item, location }) => item.type === payloadType && location.kind !== 'furniture' && location.kind !== 'pile',
      )
      .reduce((sum, { item }) => sum + item.count, 0);
    return {
      gun: gun.uid,
      box: box.uid,
      payload,
      payloadType,
      carried,
      capacity,
      fov: globalThis.pumpHandlingTest.camera.fov,
    };
  });
  await page.waitForFunction(() =>
    [...globalThis.pumpHandlingTest.session.entities.all].some(
      (entity) => entity.type === 'range_rack' && entity.pockets,
    ),
  );
  const rangeStock = await page.evaluate((gunUid) => {
    const { session } = globalThis.pumpHandlingTest;
    const { registry } = session.inventory;
    const gun = session.inventory.itemByUid(gunUid);
    const model = registry.models.get(registry.items.get(gun.type)?.model);
    const calibre = model?.calibre;
    const rack = [...session.entities.all].find((entity) => entity.type === 'range_rack');
    const stocked = new Set(rack.pockets.flat().map(({ item }) => item.type));
    return {
      firearm: stocked.has(gun.type),
      compatibleRound: [...registry.items.values()].some(
        (item) => item.ammo?.calibre === calibre && stocked.has(item.id),
      ),
      compatibleBox: [...registry.items.values()].some(
        (item) =>
          item.unpack && registry.items.get(item.unpack.item)?.ammo?.calibre === calibre && stocked.has(item.id),
      ),
    };
  }, ids.gun);
  assert.deepEqual(rangeStock, { firearm: true, compatibleRound: true, compatibleBox: true });
  const select = async (uid) => {
    const rows = await page
      .locator('#inventory [data-uid]')
      .evaluateAll((items) => items.map((item) => item.dataset.uid));
    await page.evaluate((wanted) => {
      const { screen } = globalThis.pumpHandlingTest;
      for (let step = 0; step <= screen.order.length; step += 1) {
        if (screen.selected?.uid === Number(wanted)) {
          return;
        }
        screen.onAction('inventory.next');
      }
      throw new Error(`Inventory screen cannot select ${wanted}`);
    }, uid);
    assert.ok(rows.includes(String(uid)), `selected ${uid} from visible inventory rows: ${rows.join(',')}`);
  };
  const handlingWaits = [];
  const waitForWork = async (wantedCondition, wantedUid, extraSeconds = 0) => {
    const result = await page.evaluate(
      ({ condition, uid, futureSeconds }) => {
        const { session } = globalThis.pumpHandlingTest;
        const complete = () => {
          const item = session.inventory.itemByUid(uid);
          switch (condition) {
            case 'rightHand':
              return !session.queue.busy && session.inventory.hands.right?.uid === uid;
            case 'itemGone':
              return item === undefined;
            case 'tubeLoaded':
              return (item?.firearm?.tube?.length ?? 0) > 0;
            case 'chamberRound':
              return !session.queue.busy && item?.firearm?.chamber === 'round';
            default:
              throw new Error(`Unknown simulation-work condition: ${condition}`);
          }
        };
        const seconds = session.queue.remaining + futureSeconds;
        const frameLimit = Math.max(1, Math.ceil(seconds / 0.1) + 2);
        let frames = 0;
        while (!complete() && frames < frameLimit) {
          session.frame(0.1);
          frames += 1;
        }
        return { complete: complete(), seconds, frames, queueBusy: session.queue.busy };
      },
      { condition: wantedCondition, uid: wantedUid, futureSeconds: extraSeconds },
    );
    handlingWaits.push(result);
    assert.equal(result.complete, true, `simulation work did not finish deterministically: ${JSON.stringify(result)}`);
  };
  const waitForHands = async (uid) => {
    const admission = await page.evaluate((wanted) => {
      const test = globalThis.pumpHandlingTest;
      const admitted = () =>
        test.session.inventory.hands.right?.uid === wanted ||
        test.session.queue.jobs.some(
          (job) =>
            job.kind === 'move' && job.itemUid === wanted && job.target.kind === 'hand' && job.target.side === 'right',
        );
      if (!admitted()) {
        test.session.frame(1 / 60);
      }
      return {
        right: test.session.inventory.hands.right?.uid,
        left: test.session.inventory.hands.left?.uid,
        godMode: test.session.sim.godMode,
        queued: test.session.queue.jobs.some(
          (job) =>
            job.kind === 'move' && job.itemUid === wanted && job.target.kind === 'hand' && job.target.side === 'right',
        ),
        notice: test.getNotice(),
      };
    }, uid);
    assert.equal(admission.godMode, true, 'inventory H must not toggle debug God mode');
    assert.ok(
      admission.right === uid || admission.queued,
      `H must admit the intended right-hand move: ${JSON.stringify(admission)}`,
    );
    await waitForWork('rightHand', uid);
  };
  const observe = () =>
    page.evaluate((selectedIds) => {
      const { session, camera } = globalThis.pumpHandlingTest;
      const inv = session.inventory;
      return {
        hand: inv.hands.right?.uid ?? null,
        box: Boolean(inv.itemByUid(selectedIds.box)),
        loose: [...inv.items()]
          .filter(
            ({ item, location }) =>
              item.type === selectedIds.payloadType && location.kind !== 'furniture' && location.kind !== 'pile',
          )
          .reduce((sum, { item }) => sum + item.count, 0),
        gun: structuredClone(inv.itemByUid(selectedIds.gun)?.firearm),
        jobs: session.queue.jobs.length,
        rest: session.rest.action?.kind ?? null,
        fov: camera.fov,
        ads: globalThis.pumpHandlingTest.input.aimingDownSights,
        paused: session.sim.paused,
        dead: session.sim.dead ?? null,
        sounds: globalThis.pumpHandlingTest.audio.heardSounds,
      };
    }, ids);
  await pressAction(page, 'ui.inventory-toggle');
  await select(ids.box);
  await pressAction(page, 'inventory.hands');
  await waitForHands(ids.box);
  await pressAction(page, 'ui.inventory-toggle');
  await page.mouse.click(640, 450);
  await page.waitForFunction(() =>
    globalThis.pumpHandlingTest.session.queue.jobs.some((job) => job.jobType === 'item.unpack'),
  );
  await pressAction(page, 'handling.stop');
  const cancelled = await observe();
  assert.equal(cancelled.box, true);
  assert.equal(cancelled.loose, ids.carried);
  assert.equal(cancelled.jobs, 0);
  await page.mouse.click(640, 450);
  await page.waitForFunction((uid) => {
    const s = globalThis.pumpHandlingTest.session;
    return !s.inventory.itemByUid(uid) || s.queue.jobs.some((job) => job.jobType === 'item.unpack');
  }, ids.box);
  await waitForWork('itemGone', ids.box);
  const unpacked = await observe();
  assert.equal(unpacked.loose, ids.carried + ids.payload);
  assert.equal(unpacked.hand, null);
  await pressAction(page, 'firearm.reload');
  await page.waitForFunction(
    (window) => performance.now() - globalThis.pumpRDownAt >= window,
    RELOAD_GESTURE_MS.doublePress,
  );
  assert.equal((await observe()).rest, null, 'tapping reload with no reloadable item does not rest');
  await pressAction(page, 'ui.inventory-toggle');
  await select(ids.gun);
  await pressAction(page, 'inventory.hands');
  await waitForHands(ids.gun);
  await pressAction(page, 'ui.inventory-toggle');
  await pressAction(page, 'firearm.reload');
  await page.waitForFunction(
    (window) => performance.now() - globalThis.pumpRDownAt >= window,
    RELOAD_GESTURE_MS.doublePress,
  );
  const tapped = await observe();
  assert.equal(tapped.jobs, 0);
  assert.equal(tapped.loose, ids.carried + ids.payload);
  assert.deepEqual(tapped.gun.tube, []);
  assert.equal(tapped.rest, null);
  const releaseReloadWithoutAmmo = await holdAction(page, 'firearm.reload');
  try {
    await page.waitForFunction(() =>
      globalThis.pumpHandlingTest.session.queue.jobs.some((job) => job.jobType === 'firearm.load'),
    );
  } finally {
    await releaseReloadWithoutAmmo();
  }
  const released = await observe();
  assert.equal(released.loose, ids.carried + ids.payload);
  assert.equal(released.jobs, 0);
  assert.deepEqual(released.gun.tube, []);
  const releaseReload = await holdAction(page, 'firearm.reload');
  try {
    await page.waitForFunction((uid) => {
      const s = globalThis.pumpHandlingTest.session;
      return (
        s.inventory.itemByUid(uid).firearm.tube.length > 0 || s.queue.jobs.some((job) => job.jobType === 'firearm.load')
      );
    }, ids.gun);
    // One completed insertion is enough for native gesture/rack/fire integration.
    // Full-tube repeat/conservation stays in pumpShotgun.test.ts and reloadInput.test.ts;
    // do not spend a tuning-derived full magazine of simulation work in the smoke.
    await waitForWork('tubeLoaded', ids.gun);
  } finally {
    await releaseReload();
  }
  const loaded = await observe();
  assert.ok(loaded.gun.tube.length > 0 && loaded.gun.tube.length <= ids.capacity);
  assert.equal(loaded.loose, ids.carried + ids.payload - loaded.gun.tube.length);
  assert.equal(loaded.jobs, 0);
  assert.equal(loaded.rest, null);
  // Submit the effective reload binding in one protocol burst so renderer pacing cannot split the double tap.
  // No timestamp is supplied or fabricated; verify Chrome's actual event timestamps.
  const keys = await page.context().newCDPSession(page);
  await pressCdpActionBurst(
    (expression) => page.evaluate(expression),
    (method, params) => keys.send(method, params),
    'firearm.reload',
    2,
  );
  await keys.detach();
  const doublePress = await page.evaluate(() => globalThis.pumpRDowns.slice(-2));
  assert.equal(doublePress.length, 2);
  assert.ok(
    doublePress[1] - doublePress[0] < RELOAD_GESTURE_MS.doublePress,
    'two reload-binding presses arrive within their actual gesture window',
  );
  await page.waitForFunction(
    (uid) => globalThis.pumpHandlingTest.session.inventory.itemByUid(uid).firearm.cycle?.mode === 'hand',
    ids.gun,
  );
  await waitForWork('chamberRound', ids.gun);
  const racked = await observe();
  assert.equal(racked.loose, loaded.loose);
  assert.equal(racked.gun.tube.length, loaded.gun.tube.length - 1);
  assert.equal(racked.rest, null);
  const shotsBeforeUnreadyClick = racked.sounds.filter((sound) => sound.event === 'shotgun_blast').length;
  const refusalsBeforeUnreadyClick = racked.sounds.filter((sound) => sound.event === 'player_nope').length;
  await page.mouse.click(640, 450);
  await page.evaluate(() => globalThis.pumpHandlingTest.session.frame(0.1));
  const unreadyClick = await observe();
  assert.equal(unreadyClick.gun.chamber, racked.gun.chamber, 'unreadied click leaves the chamber unchanged');
  assert.equal(unreadyClick.gun.tube.length, racked.gun.tube.length, 'unreadied click spends no shell');
  assert.equal(
    unreadyClick.sounds.filter((sound) => sound.event === 'shotgun_blast').length,
    shotsBeforeUnreadyClick,
    'unreadied click makes no firearm sound',
  );
  assert.equal(
    unreadyClick.sounds.filter((sound) => sound.event === 'player_nope').length,
    refusalsBeforeUnreadyClick,
    'unreadied click makes no refusal sound',
  );
  await page.mouse.down({ button: 'right' });
  const raiseDuration = await page.evaluate((uid) => {
    const test = globalThis.pumpHandlingTest;
    test.session.frame(1 / 60);
    return test.session.inventory.itemByUid(uid).firearm.readying.duration;
  }, ids.gun);
  await page.evaluate((duration) => globalThis.pumpHandlingTest.session.frame(duration), raiseDuration);
  assert.equal(
    await page.evaluate((uid) => globalThis.pumpHandlingTest.session.firearms.isReady(uid), ids.gun),
    true,
    'held stance becomes ready after simulation time advances',
  );
  await page.mouse.click(640, 450, { button: 'middle' });
  const aimed = await observe();
  assert.equal(aimed.ads, true, 'middle mouse toggles ADS while the firearm is ready');
  assert.equal(aimed.fov, ids.fov, 'ADS aligns the sight instead of relying on zoom');
  await page.mouse.click(640, 450);
  await page.waitForFunction(
    (uid) => globalThis.pumpHandlingTest.session.inventory.itemByUid(uid).firearm.chamber === 'case',
    ids.gun,
  );
  const fired = await observe();
  assert.equal(fired.gun.cycle, undefined);
  assert.equal(fired.gun.tube.length, racked.gun.tube.length);
  assert.equal(fired.loose, racked.loose);
  assert.equal(fired.dead, null);
  assert.equal(fired.ads, true, 'ADS remains active while the firearm is raised');
  assert.equal(fired.fov, ids.fov);
  await page.mouse.up({ button: 'right' });
  const lowered = await observe();
  assert.equal(lowered.ads, false, 'releasing the stance exits ADS');
  assert.equal(lowered.fov, ids.fov);
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
    `${JSON.stringify({ cancelled, unpacked, tapped, released, loaded, racked, fired, decoded, doublePress, handlingWaits, errors })}\n`,
  );
} finally {
  await browser?.close();
  await vite.close();
}
