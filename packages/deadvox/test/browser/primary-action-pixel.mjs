// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: browser input selection must settle before the next keypress
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the source checkout for A/B tests
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
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

// Puts a compass in the dominant hand by daylight and counts how many pixels of the square around
// its card differ visibly between the first frame that shows the card and the next frame, drawn
// with only the card hidden. A page screenshot costs seconds per frame on the software renderer in
// CI, so this reads the drawing buffer right after the held layer, the frame's last draw, in one
// page call. The shown window also comes back as a PNG for the artifact.
const heldCompassCardChange = (page) =>
  page.evaluate((noon) => {
    const r = globalThis.primaryActionTest;
    const { sim } = r.session;
    sim.setDebugCalendarTime(r.nextTimeOfDay(sim.calendar, noon));
    r.setHand(r.dominant, r.inventory.create('compass'));
    const { held } = r.view;
    const { scene, camera } = held.warmUpTarget;
    const gl = r.engine.renderer.getContext();
    let window;
    const read = (dial) => {
      if (!window) {
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const point = dial.getWorldPosition(dial.position.clone()).project(camera);
        const rim = dial.localToWorld(dial.position.clone().set(dial.geometry.parameters.radius, 0, 0)).project(camera);
        const radius = Math.round(Math.hypot(((rim.x - point.x) * width) / 2, ((rim.y - point.y) * height) / 2));
        window = {
          left: Math.round(((point.x + 1) / 2) * width) - radius,
          bottom: Math.round(((point.y + 1) / 2) * height) - radius,
          side: radius * 2 + 1,
        };
      }
      const { left, bottom, side } = window;
      const flipped = new Uint8Array(side * side * 4);
      gl.readPixels(left, bottom, side, side, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
      const data = new Uint8ClampedArray(flipped.length);
      for (let row = 0; row < side; row += 1) {
        data.set(flipped.subarray((side - 1 - row) * side * 4, (side - row) * side * 4), row * side * 4);
      }
      return data;
    };
    const compare = (shown, hidden) => {
      let changed = 0;
      for (let index = 0; index < shown.length; index += 4) {
        const difference = [0, 1, 2].reduce(
          (sum, channel) => sum + Math.abs(shown[index + channel] - hidden[index + channel]),
          0,
        );
        if (difference > 48) {
          changed += 1;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = window.side;
      canvas.height = window.side;
      canvas.getContext('2d').putImageData(new ImageData(shown, window.side, window.side), 0, 0);
      return { changed, pixels: shown.length / 4, side: window.side, png: canvas.toDataURL('image/png').split(',')[1] };
    };
    return new Promise((drawn, failed) => {
      const { render } = held;
      let shown;
      let renders = 0;
      held.render = (...args) => {
        render.apply(held, args);
        renders += 1;
        const dial = scene.getObjectByName('compass-live-dial');
        if (renders > 30) {
          held.render = render;
          failed(new Error('The held compass card was not drawn within 30 held-layer frames'));
        } else if (dial?.visible === true && !shown) {
          shown = read(dial);
          dial.visible = false;
        } else if (dial?.visible === false && shown) {
          held.render = render;
          drawn(compare(shown, read(dial)));
        }
      };
    });
  }, 12 * 3600);

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
    // The card is lit like the model, so it is read by daylight; nothing after this phase needs the
    // night. Hiding only the card isolates its own pixels from the lit floor and the arm around it.
    const { png, ...change } = await heldCompassCardChange(page);
    await writeFile(resolve(projectRoot, 'test-results/primary-action/held-compass.png'), Buffer.from(png, 'base64'));
    process.stdout.write(`Held compass card pixels: ${JSON.stringify(change)}\n`);
    assert.ok(
      change.changed > change.pixels / 20,
      'the held compass card is visible: hiding it changes its marks and needle on screen',
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
