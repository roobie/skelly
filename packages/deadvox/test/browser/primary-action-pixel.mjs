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
import { observationPlugin, timePhase } from './primary-action-observation.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
const [, , group] = process.argv;
assert.ok(['held', 'optic-zoom', 'optic-sights', 'lake'].includes(group), 'choose a pixel contract group');
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
// CI, so this reads the drawing buffer after the optical adapter, the frame's last draw, in one
// page call. The shown window also comes back as a PNG for the artifact.
const heldCompassCardChange = (page) =>
  page.evaluate((noon) => {
    const r = globalThis.primaryActionTest;
    const { sim } = r.session;
    sim.setDebugCalendarTime(r.nextTimeOfDay(sim.calendar, noon));
    r.input.pitch = 0;
    r.setHand(r.dominant, r.inventory.create('compass'));
    const { held } = r.view;
    const { scene, camera } = r.engine;
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

// Endpoint selection catches a variable scope mistaken for a fixed-unity sight at its lowest power.
const opticZoomRecord = ({ opticType, gunType, endpoint, rifleUid, withGear }) => {
  const r = globalThis.primaryActionTest;
  const { inventory, engine } = r;
  r.input.pitch = 0;
  const { sim } = r.session;
  sim.setDebugCalendarTime(r.nextTimeOfDay(sim.calendar, 12 * 3600));
  if (withGear) {
    for (const wear of ['riot_helmet', 'night_vision_goggles', 'utility_vest']) {
      inventory.add(inventory.create(wear), { kind: 'worn' });
    }
  }
  const rifle = rifleUid === undefined ? inventory.create(gunType) : inventory.itemByUid(rifleUid);
  const scope = inventory.create(opticType);
  const definition = inventory.registry.items.get(gunType);
  const stations = inventory.registry.models.get(definition.model).gun.attachmentSlots.map(({ id }) => id);
  const fitOptic = () => {
    for (const slot of stations) {
      try {
        inventory.fitSlot(rifle, slot, scope);
        return;
      } catch {
        // Another station may fit.
      }
    }
    throw new Error(`Could not fit ${opticType}`);
  };
  fitOptic();
  r.setHand(r.dominant, rifle);
  if (r.debugGunPose.mode !== 'ads') {
    r.debugGunPose.toggle('ads');
  }
  const opticModel = inventory.registry.models.get(inventory.registry.items.get(opticType).model);
  const range = opticModel.gun.attachment.properties.magnification;
  const targetPower = range?.[endpoint] ?? 1;
  if (range && range.min < range.max) {
    const { step } = inventory.registry.items.get(opticType).opticZoom;
    const limit = Math.ceil((range.max - range.min) / step) + 1;
    for (let tick = 0; tick < limit && r.opticZoom.appliedPower(rifle, true) !== targetPower; tick += 1) {
      r.opticZoom.wheel(rifle, true, endpoint === 'min' ? 1 : -1);
    }
  }
  return new Promise((done, failed) => {
    const lens = engine.mood.opticLens;
    const camera = lens.zoomCamera;
    const { renderer, scene } = engine;
    const { render } = renderer;
    let drawn;
    let sourceDraws = [];
    let imageDraws = 0;
    let frames = 0;
    const isUnder = (object, root) => {
      for (let node = object; node; node = node.parent) {
        if (node === root) {
          return true;
        }
      }
      return false;
    };
    const topLevelKey = (object) => {
      let top = object;
      while (top.parent && top.parent !== scene) {
        top = top.parent;
      }
      return `${top.name || top.type}[L${top.layers.mask}]`;
    };
    const pathOf = (object) => {
      const names = [];
      for (let node = object; node; node = node.parent) {
        names.unshift(`${node.name || node.type}[L${node.layers.mask}]`);
      }
      return names.join(' > ');
    };
    // Each object's own render callback fires only when the renderer submits it for this camera, so what it sees
    // is what the zoom pass draws, whatever the layer or visibility rules were.
    const submit = (drawnScene, observedCamera = camera) => {
      const objects = [];
      const others = {};
      const opticObjects = [];
      const optic = r.view.playerMeshes.animator.slotModelOf(
        rifle,
        Object.keys(rifle.slots).find((slot) => rifle.slots[slot].uid === scope.uid),
      );
      const restore = [];
      const recordObject = (object) => {
        if (optic && isUnder(object, optic)) {
          opticObjects.push(object.geometry.userData.piece ?? pathOf(object));
        }
        if (isUnder(object, r.view.playerMeshes.group) || object.layers.mask !== 1) {
          objects.push(pathOf(object));
        } else {
          const key = topLevelKey(object);
          others[key] = (others[key] ?? 0) + 1;
        }
      };
      drawnScene.traverse((object) => {
        if (!(object.isMesh || object.isLine || object.isPoints)) {
          return;
        }
        const prior = object.onBeforeRender;
        restore.push(() => {
          object.onBeforeRender = prior;
        });
        object.onBeforeRender = function (...args) {
          if (args[2] !== observedCamera) {
            return prior.apply(this, args);
          }
          recordObject(object);
          return prior.apply(this, args);
        };
      });
      return {
        objects,
        others,
        opticObjects,
        restore: () => {
          for (const undo of restore) {
            undo();
          }
        },
      };
    };
    renderer.render = function (drawnScene, drawnCamera) {
      const frame = r.view.held.opticLensFrame;
      const source = frame?.magnification === 1 && frame.worldAtUnity === false && drawnCamera === engine.camera;
      if (drawnScene !== scene || (drawnCamera !== camera && !source)) {
        render.call(this, drawnScene, drawnCamera);
        return;
      }
      const { objects, others, opticObjects, restore } = submit(drawnScene, drawnCamera);
      try {
        render.call(this, drawnScene, drawnCamera);
      } finally {
        restore();
      }
      if (source) {
        sourceDraws = opticObjects;
        return;
      }
      imageDraws += 1;
      const { uniforms } = engine.mood.opticPass;
      const optic = r.view.playerMeshes.animator.slotModelOf(
        rifle,
        Object.keys(rifle.slots).find((slot) => rifle.slots[slot].uid === scope.uid),
      );
      let opticMeshCount = 0;
      let opticVertices = 0;
      let clippedOpticVertices = 0;
      let nearestOpticDepth = Number.POSITIVE_INFINITY;
      engine.camera.updateWorldMatrix(true, false);
      optic?.traverse((object) => {
        if (!object.isMesh) {
          return;
        }
        opticMeshCount += 1;
        const positions = object.geometry.getAttribute('position');
        const toCamera = engine.camera.matrixWorldInverse.clone().multiply(object.matrixWorld);
        const point = engine.camera.position.clone();
        for (let index = 0; index < positions.count; index += 1) {
          point.fromBufferAttribute(positions, index).applyMatrix4(toCamera);
          const depth = -point.z;
          nearestOpticDepth = Math.min(nearestOpticDepth, depth);
          clippedOpticVertices += Number(depth <= engine.camera.near);
          opticVertices += 1;
        }
      });
      drawn = {
        rifleUid: rifle.uid,
        opticType,
        endpoint,
        targetPower,
        worldImage: true,
        magnifying: frame.magnifying,
        opticMeshCount,
        opticVertices,
        clippedOpticVertices,
        nearestOpticDepth,
        nearPlane: engine.camera.near,
        opticObjects,
        housingActive: lens.housingActive,
        magnification: frame.magnification,
        zoomCameraLayers: camera.layers.mask,
        zoomTextureIsTarget: uniforms.uZoomTexture.value === lens.target.texture,
        drawnObjects: objects,
        worldLayerDrawnByTopLevel: others,
      };
    };
    const { held } = r.view;
    const after = held.render;
    held.render = (...args) => {
      after.apply(held, args);
      frames += 1;
      const frame = held.opticLensFrame;
      if (frame?.magnification === 1 && frame.worldAtUnity === false && sourceDraws.length > 0) {
        drawn = {
          rifleUid: rifle.uid,
          opticType,
          endpoint,
          targetPower,
          magnification: frame.magnification,
          worldImage: false,
          opticMeshCount: sourceDraws.length,
          drawnObjects: [],
          sourceDraws,
          imageDraws,
          housingActive: lens.housingActive,
          zoomActive: engine.mood.opticPass.uniforms.uZoomActive.value,
          reticleCenter: frame.reticleCenter,
          shaderReticleCenter: engine.mood.opticPass.uniforms.uReticleCenter.value.toArray(),
        };
      }
      if (drawn?.opticMeshCount > 0) {
        held.render = after;
        renderer.render = render;
        done(drawn);
      } else if (frames > 120) {
        // A fresh rifle raises and then acquires ADS before the zoom camera draws, so the budget
        // covers both motions on a fast renderer, not only the raise.
        held.render = after;
        renderer.render = render;
        failed(new Error('The zoom camera did not draw within 120 frames'));
      }
    };
  });
};

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

const enterTestHouse = async (chromium, port) => {
  const page = await chromium.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
    process.stdout.write(`PAGE_ERROR ${error.stack}\n`);
  });
  await page.addInitScript(fakePointerLock);
  await timePhase('testHouse-pixel-boot', async () => {
    await page.goto(
      browserStageUrl(
        'primary-action-pixel',
        // The pixel fixture needs a dark sky; 23:30 is deep night on the authored cycle. It starts on the path's
        // open ground facing east, away from the showroom deck and its props, so the floor sample sees bare ground.
        `http://127.0.0.1:${port}/?debug=1&seed=73&site=testHouse&radius=32&time=23:30&at=-4,-0.5,-90&post=0&sunshadow=0&torchshadow=0`,
      ),
    );
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#dominant-hand').selectOption('left');
    await enterWorld(page);
  });
  const clip = await page.locator('#view canvas').boundingBox();
  assert(clip, 'the loaded scene has a canvas');
  // Page clipping avoids the locator screenshot's extra layout-stability frames.
  const capture = () => page.screenshot({ clip });
  return { page, capture, pageErrors };
};

const heldItemChecks = async (chromium, port) => {
  const { page, capture, pageErrors } = await enterTestHouse(chromium, port);
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
  await timePhase('own-head-mask-assertions', async () => {
    const uid = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.create('night_vision_goggles');
      if (!r.inventory.add(item, { kind: 'worn' })) {
        throw new Error('Could not wear eyes-slot fixture');
      }
      return item.uid;
    });
    await page.waitForFunction(() => globalThis.primaryActionTest.view.playerMeshes.group.getObjectByName('worn-eyes'));
    const frame = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const { group: actor } = r.view.playerMeshes;
      const counts = { head: 0, eyes: 0, body: 0 };
      globalThis.ownBodyDraws = counts;
      for (const [role, name] of [
        ['head', 'figure-head'],
        ['eyes', 'worn-eyes'],
        ['body', 'figure-leftLeg'],
      ]) {
        actor.getObjectByName(name).traverse((object) => {
          if (!object.isMesh) {
            return;
          }
          const before = object.onBeforeRender;
          object.onBeforeRender = function (...args) {
            before.apply(this, args);
            if (args[2] === r.engine.camera) {
              counts[role] += 1;
            }
          };
        });
      }
      r.input.pitch = -1.3;
      return r.frames;
    });
    await page.waitForFunction((start) => globalThis.primaryActionTest.frames > start + 1, frame);
    const own = await page.evaluate(() => ({ ...globalThis.ownBodyDraws }));
    assert.equal(own.head, 0, 'own-camera world pass excludes the head');
    assert.equal(own.eyes, 0, 'own-camera world pass excludes eyes-slot equipment');
    assert.ok(own.body > 0, 'looking down draws the canonical world legs');
    const externalFrame = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.input.pitch = 0;
      r.thirdPerson.toggle();
      return r.frames;
    });
    await page.waitForFunction((start) => globalThis.primaryActionTest.frames > start + 1, externalFrame);
    const external = await page.evaluate(() => ({ ...globalThis.ownBodyDraws }));
    assert.ok(external.head > 0 && external.eyes > 0, 'external world pass draws head and eyes-slot equipment');
    await page.evaluate((itemUid) => {
      const r = globalThis.primaryActionTest;
      const result = r.inventory.move(r.inventory.itemByUid(itemUid), { kind: 'pile', pos: r.feet() });
      if (!result.ok) {
        throw new Error(result.reason);
      }
      r.thirdPerson.toggle();
      r.input.pitch = -0.55;
    }, uid);
  });
  await timePhase('held-compass-pixel-assertion', async () => {
    // The card is lit like the model, so it is read by daylight; nothing after this phase needs the
    // night. Hiding only the card isolates its own pixels from the lit floor and the arm around it.
    const { png, ...change } = await heldCompassCardChange(page);
    await writeFile(resolve(projectRoot, 'test-results/primary-action/held-compass.png'), Buffer.from(png, 'base64'));
    process.stdout.write(`Held compass card pixels: ${JSON.stringify(change)}\n`);
    await writeFile(resolve(projectRoot, 'test-results/primary-action/held-compass-world.png'), await capture());
    assert.ok(
      change.changed > change.pixels / 20,
      'the held compass card is visible: hiding it changes its marks and needle on screen',
    );
  });
};

// Long-gun ADS acquisition is Combat-owned simulation time: the fixture raises with the debug hip
// latch, then latches ADS, and the hooked session frames sample acquisition progress and the held
// optic's sight picture. Acceptance must not depend on the render cadence, so the record freezes
// the simulation through the debug freeze control once the acquisition is half done, renders the
// held partial state, then unfreezes and lets the acquisition complete. Runs inside the page.
const adsAcquisitionMotionRecord = async () => {
  const r = globalThis.primaryActionTest;
  const { inventory, session } = r;
  r.input.pitch = 0;
  const rifle = inventory.create('rifle_assault');
  r.setHand(r.dominant, rifle);
  const scope = inventory.create('optic_fixed_prism_4x');
  const stations = inventory.registry.models
    .get(inventory.registry.items.get(rifle.type).model)
    .gun.attachmentSlots.map(({ id }) => id);
  const fitted = stations.some((slot) => {
    try {
      return inventory.fitSlot(rifle, slot, scope);
    } catch {
      // Another station may fit.
      return false;
    }
  });
  if (!fitted) {
    throw new Error('Could not fit the acquisition fixture optic');
  }
  if (r.debugGunPose.mode !== 'hip') {
    r.debugGunPose.toggle('hip');
  }
  const { uid } = rifle;
  const samples = [];
  let toggledAt = 0;
  let heldElapsed = 0;
  let unfreeze = () => null;
  let failWith;
  let froze;
  let finish;
  const frozeNow = new Promise((markFrozen) => {
    froze = markFrozen;
  });
  const completed = new Promise((markCompleted) => {
    finish = markCompleted;
  });
  const { frame } = session;
  const restore = () => {
    session.frame = frame;
  };
  session.frame = (...args) => {
    const out = frame(...args);
    try {
      if (!session.firearms.isReady(uid)) {
        return out;
      }
      if (r.debugGunPose.mode !== 'ads') {
        r.debugGunPose.toggle('ads');
        toggledAt = r.frames;
        return out;
      }
      const acquiring = rifle.firearm?.adsAcquiring;
      const elapsed = acquiring?.elapsedSimSeconds ?? 0;
      if (
        !heldElapsed &&
        acquiring &&
        !session.firearms.isAdsAcquired(uid) &&
        elapsed >= acquiring.durationSimSeconds / 2
      ) {
        heldElapsed = elapsed;
        r.debugTools.handleAction('debug.freeze-game');
        unfreeze = () => r.debugTools.handleAction('debug.freeze-game');
        froze();
        return out;
      }
      samples.push({
        acquired: session.firearms.isAdsAcquired(uid),
        elapsed,
        camera: r.engine.camera.position.toArray(),
        lensFrame: r.view.held.opticLensFrame !== undefined,
      });
      if (samples.at(-1).acquired) {
        restore();
        finish();
      }
    } catch (error) {
      restore();
      failWith = error;
      finish();
    }
    return out;
  };
  await frozeNow;
  // Rendering continues while the simulation is frozen; give the view a few frames to present the
  // held partial state, then read the camera it shows.
  for (let index = 0; index < 3; index += 1) {
    await new Promise((frameDone) => requestAnimationFrame(frameDone));
  }
  const partialCamera = r.engine.camera.position.toArray();
  unfreeze();
  await completed;
  if (failWith) {
    throw failWith;
  }
  return { rifleUid: uid, toggledAt, framesToAcquire: r.frames - toggledAt, samples, heldElapsed, partialCamera };
};

const opticZoomCheck = async (chromium, port) => {
  // One session also exercises clearing masks when switching between optic presentations.
  // The short-relief prism also protects the world camera's near-plane boundary.
  const { page } = await enterTestHouse(chromium, port);
  // The optic's sight picture must arrive with the acquisition motion, not on the toggle's frame.
  await timePhase('ads-acquisition-motion', async () => {
    const acquisition = await page.evaluate(adsAcquisitionMotionRecord);
    const { samples } = acquisition;
    assert.ok(samples.length > 1, 'long-gun ADS acquisition is observed over more than one simulation frame');
    assert.equal(samples[0].acquired, false, 'the sight is not acquired on the frame after the toggle');
    assert.equal(samples.at(-1).acquired, true, 'the sight is acquired once acquisition completes');
    assert.ok(acquisition.framesToAcquire > 1, 'aiming down sights takes simulation time rather than snapping');
    // Render frames can land between 60 Hz player ticks and run no tick, so renderer samples may
    // legitimately repeat a tick's progress. What must hold over every sample, completion included,
    // is no backwards motion, and the completed progress must stand above the first sample's.
    assert.ok(
      samples.every((sample, index) => index === 0 || sample.elapsed >= samples[index - 1].elapsed),
      'acquisition progress never runs backwards between renderer samples, completion included',
    );
    assert.ok(
      samples.at(-1).elapsed > samples[0].elapsed,
      'acquisition progress advances from the first sample to the completed one',
    );
    const incomplete = samples.slice(0, -1);
    assert.ok(
      incomplete.every((sample) => !sample.lensFrame),
      'the optic sight picture waits for the acquisition to complete',
    );
    // The view carries the aim from hip to sights with the acquisition instead of snapping. The
    // record holds an explicit partial acquisition and renders it, so acceptance never depends on
    // the render cadence: the frozen mid-acquisition camera must sit strictly part-way between the
    // hip eye and the settled full-ADS camera, which the final read takes after one redraw.
    const sightPicture = await page.waitForFunction((uid) => {
      const r = globalThis.primaryActionTest;
      return r.session.inventory.hands[r.dominant]?.uid === uid && r.view.held.opticLensFrame !== undefined;
    }, acquisition.rifleUid);
    assert.ok(sightPicture, 'the optic sight picture arrives once the acquisition completes');
    const finalCamera = await page.evaluate(() => globalThis.primaryActionTest.engine.camera.position.toArray());
    const cameraDistance = (from, to) => Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]);
    const travel = cameraDistance(samples[0].camera, finalCamera);
    assert.ok(travel > 0.002, 'the camera travels from the hip eye to the sighted eye');
    assert.ok(
      acquisition.heldElapsed > 0 && acquisition.heldElapsed < samples.at(-1).elapsed,
      'the held partial state sits strictly inside the acquisition',
    );
    const carried = cameraDistance(samples[0].camera, acquisition.partialCamera);
    assert.ok(
      carried >= 0.25 * travel && carried <= 0.75 * travel,
      'the held partial acquisition renders the camera part-way to the sight line',
    );
    process.stdout.write(
      `ADS_ACQUISITION_MOTION ${JSON.stringify({ framesToAcquire: acquisition.framesToAcquire, samples: samples.length })}\n`,
    );
  });
  const rifleUids = new Map();
  const endpoints = {
    'optic-zoom': [
      ['optic_lpvo_1_6x', 'rifle_assault', 'min'],
      ['optic_lpvo_1_6x', 'rifle_assault', 'max'],
    ],
    'optic-sights': [
      ['optic_fixed_prism_4x', 'rifle_assault', 'max'],
      ['optic_mini_reflex', 'rifle_assault', 'min'],
      ['optic_holographic', 'rifle_assault', 'min', true],
    ],
  };
  for (const [opticType, gunType, endpoint, physicalWindow = false] of endpoints[group]) {
    await timePhase('optic-disc-endpoint', async () => {
      const record = await page.evaluate(opticZoomRecord, {
        opticType,
        gunType,
        endpoint,
        rifleUid: rifleUids.get(gunType),
        withGear: rifleUids.size === 0,
      });
      rifleUids.set(gunType, record.rifleUid);
      const { drawnObjects, ...summary } = record;
      process.stdout.write(
        `OPTIC_ZOOM_DIAGNOSTIC ${JSON.stringify({ ...summary, drawnObjectCount: drawnObjects.length })}\n`,
      );
      assert.equal(record.magnification, record.targetPower, 'the optic reaches its authored endpoint');
      assert.ok(record.opticMeshCount > 0, 'a physical optic is present');
      assert.equal(record.worldImage, !physicalWindow, 'the fixture presents its selected sight picture');
      if (!record.worldImage) {
        assert.equal(record.imageDraws, 0, 'the physical window needs no replacement image');
        assert.equal(record.housingActive, false, 'no stale disc mask clips the source-window reticle');
        assert.equal(record.zoomActive, 0, 'the shader preserves the source image');
        assert.ok(record.sourceDraws.includes('optic-near-frame'), 'the physical near frame is actually drawn');
        assert.ok(!record.sourceDraws.includes('optic-ads-housing'), 'the lengthwise ADS hood is not drawn');
        assert.deepEqual(record.shaderReticleCenter, record.reticleCenter, 'the reticle is not recentered');
        return;
      }
      assert.deepEqual(record.opticObjects, [], 'the image excludes its own fitted optic');
      if (opticType === 'optic_fixed_prism_4x') {
        assert.ok(record.opticVertices > 0, 'the prism near-plane witness contains real model vertices');
        assert.equal(
          record.clippedOpticVertices,
          0,
          'the short-relief prism is not cut into slivers by the near plane',
        );
      }
      if (record.magnifying) {
        const pixels = await timePhase('optic-disc-pixels', () =>
          page.evaluate(async (moduleUrl) => {
            const { scopeDiscPixels } = await import(moduleUrl);
            return scopeDiscPixels(globalThis.primaryActionTest);
          }, '/test/browser/optic-disc-scene.mjs'),
        );
        process.stdout.write(`OPTIC_DISC_PIXELS ${JSON.stringify({ opticType, endpoint, ...pixels })}\n`);
        assert.ok(pixels.occludingPixels > 0, 'opaque tube geometry would obscure the interior without the disc');
        assert.equal(pixels.unreplacedPixels, 0, 'the disc replaces every witnessed tube pixel inside its aperture');
      }
      assert.equal(record.zoomTextureIsTarget, true, 'the lens pass shows the zoom target');
      assert.equal(record.housingActive, !record.magnifying, 'only fixed-unity discs preserve foreground housing');
      if (record.magnification > 1) {
        assert.equal(
          record.zoomCameraLayers & 0b1110,
          0,
          'the magnified camera sees none of the figure, self-mask or optic body layers',
        );
        assert.deepEqual(record.drawnObjects, [], 'the magnified camera submits no held, worn or own-body geometry');
      }
      assert.ok(Object.keys(record.worldLayerDrawnByTopLevel).length > 0, 'the image camera submits world objects');
    });
  }
  await page.close();
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
  const checks = {
    held: heldItemChecks,
    'optic-zoom': opticZoomCheck,
    'optic-sights': opticZoomCheck,
    lake: lakeSurfaceCheck,
  };
  await checks[group](browser, address.port);
} finally {
  if (browser) {
    await timePhase('browser-close', () => browser.close());
  }
  await timePhase('vite-close', () => vite.close());
}
