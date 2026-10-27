// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: browser input selection must settle before the next keypress
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the source checkout for A/B tests
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';
import { opticHousingChecks } from './optic-housing.mjs';
import { observationPlugin, timePhase } from './primary-action-observation.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
// Two groups, so each fits its step's bound: held, worn and dropped items at the test house, and the lake surface.
const [, , group] = process.argv;
assert.ok(group === 'held' || group === 'lake', 'choose the held or lake group');
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
    const { camera, scene } = r.engine;
    const heldFrame = scene.getObjectByName('held-items-view');
    if (!heldFrame) {
      throw new Error('The world-posed owner-view instruments are not installed');
    }
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
        const dial = heldFrame.getObjectByName('compass-live-dial');
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

const fakePointerLock = () => {
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
};

// Returns the parts of world readiness once all hold or loading has failed, or always when asked,
// so a failed or timed-out wait names the part that stayed false.
const worldReadiness = (always) => {
  const mask = document.querySelector('#world-loading');
  const parts = {
    testHook: Boolean(globalThis.primaryActionTest),
    overlayHidden: document.querySelector('#overlay')?.hidden === true,
    pointerLocked: Boolean(document.pointerLockElement),
    worldLoading: mask?.dataset.state,
    loadingMessage: mask?.querySelector('#world-loading-message')?.textContent,
    maskHidden: mask?.hidden === true,
  };
  const ready =
    parts.testHook && parts.overlayHidden && parts.pointerLocked && parts.worldLoading === 'ready' && parts.maskHidden;
  return always || ready || parts.worldLoading === 'failed' ? parts : false;
};

const enterWorld = async (page) => {
  await page.locator('#go').click();
  let parts;
  try {
    parts = await (await page.waitForFunction(worldReadiness, false)).jsonValue();
  } catch (error) {
    if (error.name !== 'TimeoutError') {
      throw error;
    }
    parts = await page.evaluate(worldReadiness, true);
  }
  assert.equal(parts.worldLoading, 'ready', `the world becomes ready: ${JSON.stringify(parts)}`);
  assert.ok(
    parts.testHook && parts.overlayHidden && parts.pointerLocked && parts.maskHidden,
    `the ready world is entered: ${JSON.stringify(parts)}`,
  );
};

const heldItemChecks = async (chromium, port) => {
  const page = await chromium.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(fakePointerLock);
  await timePhase('testHouse-pixel-boot', async () => {
    await page.goto(
      browserStageUrl(
        'primary-action-pixel',
        // The pixel fixture needs a dark sky; 23:30 is deep night on the authored cycle. It starts on the path's
        // open ground facing east, away from the showroom deck and its props, so the floor sample sees bare ground.
        // This flow measures the camera-attached visor mask, not the alternative world geometry.
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=32&time=23:30&at=-4,-0.5,-90&post=0&sunshadow=0&torchshadow=0&optics=effect`,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await enterWorld(page);
  });
  await timePhase('optic-housing-pixel-property', () => opticHousingChecks(page));
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
};

// The lake's surface is drawn from both sides. The debug crack check paints wherever no geometry covers
// a pixel magenta, so a camera under the water looking straight up sees magenta exactly when the
// surface's underside is missing or wound away from it. Looking down or level would pass on the bed.
const lakeSurfaceCheck = (chromium, port) =>
  timePhase('underwater-surface-pixels', async () => {
    const lake = await chromium.newPage({ viewport: { width: 640, height: 400 } });
    try {
      const lakeErrors = [];
      lake.on('pageerror', (error) => lakeErrors.push(error.message));
      await lake.addInitScript(fakePointerLock);
      // Start over the basin centre, so the small startup ring is the lake.
      const { layouts } = JSON.parse(
        await readFile(resolve(projectRoot, 'src/content/base/layouts-water.json'), 'utf8'),
      );
      const lakeLayout = layouts.find(({ id }) => id === 'lake_demo');
      const [centreX, centreZ] = lakeLayout.terrain[0].centre;
      const cam = `${centreX},${lakeLayout.water[0].level + 2},${centreZ},0,89,0`;
      await timePhase('lake-menu', async () => {
        await lake.goto(
          browserStageUrl(
            'primary-action-pixel',
            `http://127.0.0.1:${port}/?debug=1&seed=1&site=lake_demo&radius=16&time=12:00&freeze=1&crackcheck=1&post=0&sunshadow=0&torchshadow=0&cam=${cam}`,
          ),
        );
        await lake.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
      });
      await timePhase('lake-enter', () => enterWorld(lake));
      // The game is frozen, so a placed body stays put while the camera keeps following it. The software
      // renderer draws a frame or two a second, so every view is read inside one render hook, not awaited.
      const { level, sky, under, above } = await lake.evaluate(async () => {
        // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this browser-origin URL.
        const { centreDepth } = await import('/test/browser/water-depth.ts');
        const r = globalThis.primaryActionTest;
        const { engine } = r;
        const { body } = r.session;
        const s = r.scale.blockSize;
        const layout = engine.registry.layouts.get('lake_demo');
        const [x, z] = layout.terrain[0].centre;
        const eye = engine.camera.position.y - body.pos[1] * s;
        const gl = engine.renderer.getContext();
        // Reads the drawing buffer right after the held layer, the frame's last draw; the HUD is DOM, not in it.
        // The second frame after the move is read, so the camera has followed the body.
        const look = (eyeAt, pitch) =>
          new Promise((done) => {
            body.pos = [x / s, (eyeAt - eye) / s, z / s];
            body.vel = [0, 0, 0];
            r.input.pitch = pitch;
            const { held } = r.view;
            const { render } = held;
            let renders = 0;
            held.render = (...args) => {
              render.apply(held, args);
              renders += 1;
              if (renders < 2) {
                return;
              }
              held.render = render;
              const pixel = new Uint8Array(4);
              gl.readPixels(
                gl.drawingBufferWidth >> 1,
                gl.drawingBufferHeight >> 1,
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixel,
              );
              const colour = { r: pixel[0], g: pixel[1], b: pixel[2] };
              done({ cameraY: engine.camera.position.y, colour, depth: centreDepth(engine) });
            };
          });
        const surface = layout.water[0].level;
        return {
          level: surface,
          sky: await look(surface + 2, 1.55),
          under: await look(surface - s, 1.55),
          // Straight down, the player's own body covers the centre; a radian down meets the water just ahead.
          above: await look(surface + 2, -1),
        };
      });
      const magenta = ({ r, g, b }) => r > 150 && b > 150 && g < 0.5 * Math.min(r, b);
      process.stdout.write(`Underwater surface views: ${JSON.stringify({ level, sky, under, above })}\n`);
      assert.ok(magenta(sky.colour) && sky.depth === 1, 'the control looks up at open sky and both oracles see it');
      assert.ok(under.cameraY < level && above.cameraY > level, 'the views sit under and above the surface');
      assert.ok(
        !magenta(under.colour),
        'looking up from under the water, the centre pixel is the surface, not the sky',
      );
      assert.ok(under.depth < 1, 'looking up from under the water, a chunk face covers the centre');
      assert.ok(above.colour.b > above.colour.r && above.depth < 1, 'looking down from above, the centre is water');
      assert.deepEqual(lakeErrors, []);
    } finally {
      await lake.close();
    }
  });

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
  await (group === 'lake' ? lakeSurfaceCheck(browser, address.port) : heldItemChecks(browser, address.port));
} finally {
  if (browser) {
    await timePhase('browser-close', () => browser.close());
  }
  await timePhase('vite-close', () => vite.close());
}
