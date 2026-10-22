// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: browser input selection must settle before the next keypress
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the source checkout for A/B tests
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';
import { observationPlugin, timePhase } from './primary-action-observation.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
const measureGlowstickFloor = async (page, uid, label, capture) => {
  const screenshot = await capture();
  const artifacts = resolve(projectRoot, 'test-results/primary-action');
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, `dropped-glowstick-${label}.png`), screenshot);
  const measurement = await page.evaluate(
    async ({ base64, itemUid }) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(itemUid);
      const location = item && r.inventory.locate(item);
      if (location?.kind !== 'pile') {
        throw new Error('Glowstick pixel fixture is not on the ground');
      }
      const { camera } = r.engine;
      camera.updateMatrixWorld(true);
      const forward = camera.getWorldDirection(camera.position.clone());
      forward.y = 0;
      forward.normalize();
      const { blockSize } = r.scale;
      const point = camera.position
        .clone()
        .set(
          (location.pile.pos[0] + 0.5) * blockSize + forward.x * 0.8,
          location.pile.pos[1] * blockSize + 0.015,
          (location.pile.pos[2] + 0.5) * blockSize + forward.z * 0.8,
        )
        .project(camera);
      const decoded = new Image();
      decoded.src = `data:image/png;base64,${base64}`;
      await decoded.decode();
      const x = Math.round(((point.x + 1) / 2) * decoded.naturalWidth);
      const y = Math.round(((1 - point.y) / 2) * decoded.naturalHeight);
      const radius = 6;
      if (x < radius || y < radius || x + radius >= decoded.naturalWidth || y + radius >= decoded.naturalHeight) {
        throw new Error(`Floor sample projects outside the canvas: ${x},${y}`);
      }
      const canvas = document.createElement('canvas');
      canvas.width = decoded.naturalWidth;
      canvas.height = decoded.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(decoded, 0, 0);
      const pixels = context.getImageData(x - radius, y - radius, radius * 2 + 1, radius * 2 + 1).data;
      let sum = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        sum += pixels[index] + pixels[index + 1] + pixels[index + 2];
      }
      return { x, y, luminance: sum / ((pixels.length / 4) * 3), on: item.on };
    },
    { base64: screenshot.toString('base64'), itemUid: uid },
  );
  return { measurement, screenshot };
};

const heldCompassPixels = (page, shot) =>
  page.evaluate(async (base64) => {
    const r = globalThis.primaryActionTest;
    const { scene, camera } = r.view.held.warmUpTarget;
    const display = scene.getObjectByName('compass-live-display');
    if (!display) {
      throw new Error('Held compass display is missing');
    }
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const point = display.getWorldPosition(display.position.clone()).project(camera);
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const x = Math.round(((point.x + 1) / 2) * image.width);
    const y = Math.round(((1 - point.y) / 2) * image.height);
    const radius = 16;
    const { data } = context.getImageData(x - radius, y - radius, radius * 2 + 1, radius * 2 + 1);
    let green = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 1] > data[index] + 8 && data[index + 1] > data[index + 2] + 4) {
        green += 1;
      }
    }
    return { green, pixels: data.length / 4, x, y };
  }, shot.toString('base64'));

const visorRatio = (page, shot) =>
  page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let edge = 0;
    let edgeCount = 0;
    let centre = 0;
    let centreCount = 0;
    const inCentre = (value) => value > 0.4 && value < 0.6;
    for (let offset = 0; offset < data.length; offset += 4) {
      const pixel = offset / 4;
      const nx = (pixel % canvas.width) / canvas.width;
      const ny = Math.floor(pixel / canvas.width) / canvas.height;
      const light = data[offset] + data[offset + 1] + data[offset + 2];
      if (nx < 0.06 || nx > 0.94 || ny < 0.06) {
        edge += light;
        edgeCount += 1;
      } else if (inCentre(nx) && inCentre(ny)) {
        centre += light;
        centreCount += 1;
      }
    }
    if (!(centre > 0 && edge > 0)) {
      throw new Error('Visor comparison needs a visible scene');
    }
    return edge / edgeCount / (centre / centreCount);
  }, shot.toString('base64'));

const vite = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'error',
  plugins: [observationPlugin],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await timePhase('vite-listen', () => vite.listen());
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await timePhase('browser-launch', () =>
    launchChromium('primary-action-pixel', {
      headless: true,
      args: ['--enable-webgl'],
      renderMode: 'pixel',
    }),
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let locked = false;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => (locked ? (document.querySelector('#view canvas') ?? document.querySelector('#view')) : null),
    });
    Element.prototype.requestPointerLock = () => {
      locked = true;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      locked = false;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
  });
  await timePhase('testHouse-pixel-boot', async () => {
    await page.goto(
      browserStageUrl(
        'primary-action-pixel',
        // The pixel fixture needs a dark sky; 23:30 is deep night on the authored cycle.
        `http://127.0.0.1:${address.port}/?debug=1&seed=73&site=testHouse&radius=32&time=23:30&post=0&sunshadow=0&torchshadow=0`,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await page.locator('#go').click();
    await page.waitForFunction(
      () =>
        globalThis.primaryActionTest &&
        document.querySelector('#overlay')?.hidden &&
        document.pointerLockElement &&
        document.querySelector('#world-loading')?.dataset.state === 'ready' &&
        document.querySelector('#world-loading').hidden,
    );
  });
  const clip = await page.locator('#view canvas').boundingBox();
  assert(clip, 'the loaded scene has a canvas');
  // Page clipping avoids the locator screenshot's extra layout-stability frames.
  const capture = () => page.screenshot({ clip });
  const baselineShot = await timePhase('glowstick-pixel-assertions', async () => {
    const fixture = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.input.pitch = -0.55;
      const item = r.inventory.create('glowstick');
      if (!r.inventory.add(item, { kind: 'pile', pos: r.feet() })) {
        throw new Error('Could not place dropped-glowstick pixel fixture');
      }
      return { uid: item.uid, frame: r.frames };
    });
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames > frame, fixture.frame);
    const { measurement: off } = await measureGlowstickFloor(page, fixture.uid, 'off', capture);
    assert.notEqual(off.on, true);
    const onFrame = await page.evaluate((uid) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(uid);
      r.setHand(r.dominant, item);
      const reason = r.survival.use(item);
      if (reason) {
        throw new Error(`Could not light dropped glowstick fixture: ${reason}`);
      }
      const dropped = r.inventory.move(item, { kind: 'pile', pos: r.feet() });
      if (!dropped.ok) {
        throw new Error(`Could not drop lit glowstick fixture: ${dropped.reason}`);
      }
      return r.frames;
    }, fixture.uid);
    await page.waitForFunction((frame) => globalThis.primaryActionTest.frames > frame, onFrame);
    const { measurement: on, screenshot } = await measureGlowstickFloor(page, fixture.uid, 'on', capture);
    assert.equal(on.on, true);
    process.stdout.write(`Dropped glowstick floor luminance: ${JSON.stringify({ off, on })}\n`);
    assert.ok(
      on.luminance > off.luminance + 3,
      'a dropped lit glowstick visibly brightens nearby floor pixels at night',
    );
    assert.deepEqual(pageErrors, []);
    return screenshot;
  });
  await timePhase('worn-helmet-assertions', async () => {
    const baseline = await visorRatio(page, baselineShot);
    const uid = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.create('riot_helmet');
      if (!r.inventory.add(item, { kind: 'worn' })) {
        throw new Error('Could not wear helmet fixture');
      }
      return item.uid;
    });
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return r.view.held.warmUpTarget.camera.children.length > 0;
    });
    const worn = await visorRatio(page, await capture());
    assert.ok(worn < baseline * 0.9, 'wearing the visor darkens the outer band relative to the centre');
    await page.evaluate(() => globalThis.primaryActionTest.thirdPerson.toggle());
    await page.waitForFunction(() => {
      const attachment = globalThis.primaryActionTest.view.playerMeshes.group.getObjectByName('worn-head');
      return attachment?.visible === true && attachment.children.length > 0;
    });
    await page.evaluate((itemUid) => {
      const r = globalThis.primaryActionTest;
      const result = r.inventory.move(r.inventory.itemByUid(itemUid), { kind: 'pile', pos: r.feet() });
      if (!result.ok) {
        throw new Error(result.reason);
      }
      r.thirdPerson.toggle();
    }, uid);
    await page.waitForFunction(() => {
      const r = globalThis.primaryActionTest;
      return (
        !r.view.playerMeshes.group.getObjectByName('worn-head') && r.view.held.warmUpTarget.camera.children.length === 0
      );
    });
    const restored = await visorRatio(page, await capture());
    process.stdout.write(`Visor edge/centre ratios: ${JSON.stringify({ baseline, worn, restored })}\n`);
    assert.ok(Math.abs(restored / baseline - 1) < 0.02, 'removing the helmet restores the scene ratio');
    assert.deepEqual(pageErrors, []);
  });
  await timePhase('held-compass-pixel-assertion', async () => {
    const frame = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.setHand(r.dominant, r.inventory.create('compass'));
      return r.frames;
    });
    await page.waitForFunction((previous) => globalThis.primaryActionTest.frames > previous + 3, frame);
    const shot = await capture();
    await writeFile(resolve(projectRoot, 'test-results/primary-action/held-compass.png'), shot);
    const pixels = await heldCompassPixels(page, shot);
    process.stdout.write(`Held compass green pixels: ${JSON.stringify(pixels)}\n`);
    assert.ok(
      pixels.x > 16 && pixels.y > 16 && pixels.x < clip.width - 16 && pixels.y < clip.height - 16,
      'the held compass display projects inside the pixel sample',
    );
  });
  await page.evaluate(() => {
    const r = globalThis.primaryActionTest;
    r.clearHand(r.dominant);
    r.clearHand(r.off);
    r.setHand(r.dominant, r.inventory.create('machete'));
    r.setHand(r.off, r.inventory.create('canned_beans'));
  });
  await page.waitForFunction(() => !document.querySelector('#item-action-list').hidden);
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => {
    const r = globalThis.primaryActionTest;
    return r.survival.selectedItemAction(r.inventory.hands[r.dominant])?.opening === true;
  });
  const artifacts = resolve(projectRoot, 'test-results/primary-action');
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: resolve(artifacts, 'can-action-list.png') });
} finally {
  if (browser) {
    await timePhase('browser-close', () => browser.close());
  }
  await timePhase('vite-close', () => vite.close());
}
