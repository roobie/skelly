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
import { launchChromium } from './chromium.mjs';
import { inlineStartMod, stageLookBaseline } from './gameUrl.mjs';
import { pressAction } from './input-actions.mjs';
import { inventorySelectionChanged } from './inventory-selection.ts';
import { observationPlugin, timePhase } from './primary-action-observation.mjs';
import { loadStartScreen, openStagePage, playTestUrl } from './primaryActionPage.mjs';
import { installScopedGun } from './scoped-gun.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';

/**
 * @import { Browser, Page, ViewportSize } from 'playwright'
 * @import { BufferGeometry, Camera, CircleGeometry, Line, Mesh, Object3D, Points, ShaderMaterial, Vector3Tuple } from 'three'
 * @import { Item } from '@skelly/engine/inventory'
 * @import { SiteLayoutDef } from '@skelly/engine/internal/core/schema/files.ts'
 * @import { StartKitEntry } from '@skelly/engine/internal/core/schema/starts.ts'
 * @import { InlineStartMod } from './gameUrl.mjs'
 * @import { OpticLensFrame } from '@skelly/engine/pose'
 * @import { OpticPassReadout } from '@skelly/presentation/internal/render/mood.ts'
 * @import { HashState } from '../../src/hashState.ts'
 * @import * as OpticDiscScene from './optic-disc-scene.mjs'
 * @import { centreDepth } from './water-depth.ts'
 */

/** @typedef {'held' | 'optic-zoom' | 'optic-sights' | 'lake'} PixelGroup */
/** @typedef {(chromium: Browser, port: number) => Promise<void>} PixelCheck */

const projectRoot = resolve(process.env.PRIMARY_ACTION_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
/** @type {StartKitEntry[]} */
const sharedKit = [
  { condition: 0.7, count: 1, destination: { kind: 'worn' }, id: 'jeans', item: 'jeans' },
  { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'sneakers', item: 'sneakers' },
  { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'hoodie', item: 'hoodie' },
  { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'beans', item: 'canned_beans' },
  { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'matches', item: 'matches' },
  { count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 }, id: 'bandages', item: 'bandage' },
];
const sharedRecipes = [
  'torch',
  'candle',
  'repair_kit',
  'repair_crowbar',
  'sawn_plank',
  'door_bar',
  'make_rope',
  'grind_kitchen_knife',
  'hone_kitchen_knife',
  'grind_kabar',
  'hone_kabar',
  'grind_machete',
  'hone_machete',
];
/**
 * The pixel fixture needs a dark sky; 23:30 is deep night on the authored cycle.
 * @param {string} name
 * @param {StartKitEntry[]} kit
 */
const houseNightMod = (name, kit) =>
  inlineStartMod(`fixture.primary-action-pixel.${name}`, {
    density: null,
    id: `primary_action_pixel_${name}_start`,
    kit: [...sharedKit, ...kit],
    recipes: sharedRecipes,
    seed: 1,
    site: 'testHouse',
    skills: {},
    startTimeGameTimeOfDay: '23:30',
    storeys: 1,
    wounds: [],
  });
// The player drops the off-hand stick unlit, then lights and drops the other, so the floor is read either way.
const heldItemsMod = houseNightMod('held_items', [
  { destination: { kind: 'hand', role: 'off' }, id: 'unlit_glowstick', item: 'glowstick' },
  { destination: { kind: 'hand', role: 'dominant' }, id: 'lit_glowstick', item: 'glowstick' },
  { destination: { kind: 'pocket', parent: 'jeans', pocket: 0 }, id: 'compass', item: 'compass' },
]);
const opticRifleMod = houseNightMod('optic_rifle', [
  { destination: { kind: 'hand', role: 'dominant' }, id: 'rifle', item: 'rifle_assault' },
]);
const lakeNoonMod = inlineStartMod('fixture.primary-action-pixel.lake', {
  density: null,
  id: 'primary_action_pixel_lake_start',
  kit: sharedKit,
  recipes: sharedRecipes,
  seed: 1,
  site: 'lake_demo',
  skills: {},
  startTimeGameTimeOfDay: '12:00',
  storeys: 1,
  wounds: [],
});
/**
 * @param {string} name
 * @returns {name is PixelGroup}
 */
const isPixelGroup = (name) => ['held', 'optic-zoom', 'optic-sights', 'lake'].includes(name);
const [, , group = ''] = process.argv;
assert.ok(isPixelGroup(group), 'choose a pixel contract group');
/**
 * @param {Page} page
 * @param {Item['uid']} uid
 * @param {string} label
 * @param {() => Promise<Buffer>} capture
 */
const measureGlowstickFloor = async (page, uid, label, capture) => {
  const screenshot = await capture();
  const artifacts = resolve(projectRoot, 'test-results/primary-action');
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, `dropped-glowstick-${label}.png`), screenshot);
  const measurement = await page.evaluate(
    async ({ base64, itemUid }) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(itemUid);
      if (!item) {
        throw new Error('Glowstick pixel fixture is not in the inventory');
      }
      const location = r.inventory.locate(item);
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
      // Sized for the test house's 640x360 viewport: a software-rendered frame costs time in proportion to its pixels.
      const radius = 3;
      if (x < radius || y < radius || x + radius >= decoded.naturalWidth || y + radius >= decoded.naturalHeight) {
        throw new Error(`Floor sample projects outside the canvas: ${x},${y}`);
      }
      const canvas = document.createElement('canvas');
      canvas.width = decoded.naturalWidth;
      canvas.height = decoded.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('The floor sample canvas has no 2D context');
      }
      context.drawImage(decoded, 0, 0);
      const pixels = context.getImageData(x - radius, y - radius, radius * 2 + 1, radius * 2 + 1).data;
      // Every fourth channel is alpha, which the luminance leaves out.
      const sum = pixels.reduce((total, channel, index) => (index % 4 === 3 ? total : total + channel), 0);
      return { x, y, luminance: sum / ((pixels.length / 4) * 3), on: item.on };
    },
    { base64: screenshot.toString('base64'), itemUid: uid },
  );
  return { measurement, screenshot };
};

// With the compass in the dominant hand, by daylight, counts how many pixels of the square around
// its card differ visibly between the first frame that shows the card and the next frame, drawn
// with only the card hidden. A page screenshot costs seconds per frame on the software renderer in
// CI, so this reads the drawing buffer in one page call, each image once its frame's draws have
// finished; on the held layer's stack the frame is not complete below render scale 1
// (render/screenScale.ts, ScreenScale.render), and the unrendered strips' artifacts would count as
// card changes, letting a missing card pass. The shown window also comes back as a PNG for the
// artifact.
/** @param {Page} page */
const heldCompassCardChange = (page) =>
  page.evaluate(
    /**
     * @param {number} noon
     * @returns {Promise<{ changed: number, pixels: number, side: number, png: string }>}
     */
    (noon) => {
      const r = globalThis.primaryActionTest;
      const { sim } = r.session;
      sim.setDebugCalendarTime(r.nextTimeOfDay(sim.calendar, noon));
      r.input.controls.pitch = 0;
      const { held } = r.view;
      const { scene, camera, renderer } = r.engine;
      if (!renderer) {
        throw new Error('The held compass check needs a rendered engine');
      }
      const gl = renderer.getContext();
      /** @type {{ left: number, bottom: number, side: number } | undefined} */
      let window;
      /** @param {Mesh<CircleGeometry>} dial */
      const read = (dial) => {
        if (!window) {
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          const point = dial.getWorldPosition(dial.position.clone()).project(camera);
          const rim = dial
            .localToWorld(dial.position.clone().set(dial.geometry.parameters.radius, 0, 0))
            .project(camera);
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
      /**
       * @param {Uint8ClampedArray<ArrayBuffer>} shown
       * @param {Uint8ClampedArray<ArrayBuffer>} hidden
       */
      const changedPixels = (shown, hidden) => {
        let changed = 0;
        for (let index = 0; index < shown.length; index += 4) {
          const difference = [0, 1, 2].reduce(
            (sum, channel) => sum + Math.abs((shown[index + channel] ?? 0) - (hidden[index + channel] ?? 0)),
            0,
          );
          if (difference > 48) {
            changed += 1;
          }
        }
        return changed;
      };
      /**
       * @param {Uint8ClampedArray<ArrayBuffer>} shown
       * @param {Uint8ClampedArray<ArrayBuffer>} hidden
       */
      const compare = (shown, hidden) => {
        if (!window) {
          throw new Error('The compass card window is compared before it is read');
        }
        const changed = changedPixels(shown, hidden);
        const canvas = document.createElement('canvas');
        canvas.width = window.side;
        canvas.height = window.side;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The compass card canvas has no 2D context');
        }
        context.putImageData(new ImageData(shown, window.side, window.side), 0, 0);
        const [, png] = canvas.toDataURL('image/png').split(',');
        if (png === undefined) {
          throw new Error('The compass card canvas gave no PNG data URL');
        }
        return { changed, pixels: shown.length / 4, side: window.side, png };
      };
      return new Promise((drawn, failed) => {
        const { render } = held;
        /** @type {Uint8ClampedArray<ArrayBuffer> | undefined} */
        let shown;
        let renders = 0;
        held.render = (...args) => {
          render.apply(held, args);
          renders += 1;
          // The card is a circle mesh; see `packages/presentation/src/render/compass.ts`, `createCompass`.
          const dial = /** @type {Mesh<CircleGeometry> | undefined} */ (scene.getObjectByName('compass-live-dial'));
          if (renders > 30) {
            held.render = render;
            failed(new Error('The held compass card was not drawn within 30 held-layer frames'));
          } else if (dial?.visible === true && !shown) {
            // A microtask, not this stack: it runs once the frame callback (the upscale included)
            // has returned, and still before the next frame can change the buffer.
            queueMicrotask(() => {
              shown = read(dial);
              dial.visible = false;
            });
          } else if (dial?.visible === false && shown) {
            held.render = render;
            const shownCard = shown;
            queueMicrotask(() => {
              drawn(compare(shownCard, read(dial)));
            });
          }
        };
      });
    },
    12 * 3600,
  );

/** @typedef {'min' | 'max'} OpticEndpoint */
/**
 * @typedef {{
 *   opticType: string,
 *   gunType: string,
 *   endpoint: OpticEndpoint,
 *   refit: boolean,
 *   withGear: boolean,
 * }} OpticZoomRequest
 */
/** @typedef {{ gunType: string, opticType: string }} ScopeRequest */
/**
 * @typedef {{
 *   rifleUid: Item['uid'],
 *   opticType: string,
 *   endpoint: OpticEndpoint,
 *   targetPower: number,
 *   magnification: number,
 *   opticMeshCount: number,
 *   housingActive: boolean,
 *   drawnObjects: string[],
 * }} OpticZoomCommon
 */
/**
 * What the zoom camera drew for a sight picture made from its own world image.
 * @typedef {OpticZoomCommon & {
 *   worldImage: true,
 *   magnifying: boolean,
 *   opticVertices: number,
 *   clippedOpticVertices: number,
 *   nearestOpticDepth: number,
 *   nearPlane: number,
 *   opticObjects: string[],
 *   zoomCameraLayers: number,
 *   zoomTextureIsTarget: boolean,
 *   worldLayerDrawnByTopLevel: Record<string, number>,
 * }} OpticWorldImageRecord
 */
/**
 * What the source frame drew for a sight picture seen through the optic's physical window.
 * @typedef {OpticZoomCommon & {
 *   worldImage: false,
 *   sourceDraws: string[],
 *   imageDraws: number,
 *   zoomActive: boolean,
 *   reticleCenter: OpticLensFrame['reticleCenter'],
 *   shaderReticleCenter: OpticPassReadout['reticleCenter'],
 * }} OpticSourceWindowRecord
 */
/** @typedef {OpticWorldImageRecord | OpticSourceWindowRecord} OpticZoomRecord */

/**
 * Scopes the kit's rifle in the dominant hand. A kit slot row cannot do it, because a start kit's slot id excludes the
 * dots of a rail station's id. Runs inside the page.
 * @param {ScopeRequest} request
 */
const scopeHeldRifle = ({ gunType, opticType }) => {
  const r = globalThis.primaryActionTest;
  const { inventory } = r;
  const gun = inventory.hands[r.dominant];
  if (gun?.type !== gunType) {
    throw new Error(`The kit's ${gunType} is not in the dominant hand`);
  }
  r.stripSights(gun);
  r.fitAtAnyStation(gun, inventory.create(opticType));
};

/**
 * Endpoint selection catches a variable scope mistaken for a fixed-unity sight at its lowest power.
 * @param {OpticZoomRequest} request
 * @returns {Promise<OpticZoomRecord>}
 */
const opticZoomRecord = ({ opticType, gunType, endpoint, refit, withGear }) => {
  const r = globalThis.primaryActionTest;
  const { inventory, engine } = r;
  r.input.controls.pitch = 0;
  const { sim } = r.session;
  sim.setDebugCalendarTime(r.nextTimeOfDay(sim.calendar, 12 * 3600));
  if (withGear) {
    for (const wear of ['riot_helmet', 'night_vision_goggles', 'utility_vest']) {
      inventory.add(inventory.create(wear), { kind: 'worn' });
    }
  }
  const rifle = inventory.hands[r.dominant];
  if (rifle?.type !== gunType) {
    throw new Error(`The optic zoom ${gunType} is not in the dominant hand`);
  }
  // The first optic is fitted to the stripped rifle beforehand; later ones replace their predecessor.
  const fitOptic = () => {
    if (refit) {
      const optic = inventory.create(opticType);
      r.fitAtAnyStation(rifle, optic);
      return optic;
    }
    const fitted = Object.values(rifle.slots ?? {}).find((child) => child?.type === opticType);
    if (!fitted) {
      throw new Error(`${gunType} came without its ${opticType}`);
    }
    return fitted;
  };
  const scope = fitOptic();
  const { slots } = rifle;
  if (!slots) {
    throw new Error(`${gunType} has no attachment slots`);
  }
  if (r.debugGunPose.mode !== 'ads') {
    r.debugGunPose.toggle('ads');
  }
  const opticAttachment = () => {
    const opticDefinition = inventory.registry.items.get(opticType);
    const opticModel =
      opticDefinition?.model === undefined ? undefined : inventory.registry.models.get(opticDefinition.model);
    const attachment = opticModel?.gun?.attachment;
    if (!(opticDefinition && attachment)) {
      throw new Error(`${opticType} has no gun attachment model`);
    }
    return { opticDefinition, attachment };
  };
  const zoomToEndpoint = () => {
    const { opticDefinition, attachment } = opticAttachment();
    const range = attachment.properties.magnification;
    const targetPower = range?.[endpoint] ?? 1;
    if (!range || range.min >= range.max) {
      return targetPower;
    }
    if (!opticDefinition.opticZoom) {
      throw new Error(`${opticType} has a magnification range but no zoom step`);
    }
    const { step } = opticDefinition.opticZoom;
    const limit = Math.ceil((range.max - range.min) / step) + 1;
    const notch = endpoint === 'min' ? 1 : -1;
    for (let tick = 0; tick < limit && r.opticZoom.appliedPower(rifle, true) !== targetPower; tick += 1) {
      r.opticZoom.wheel(rifle, true, notch);
    }
    return targetPower;
  };
  const targetPower = zoomToEndpoint();
  const { renderer, scene, mood } = engine;
  if (!(renderer && mood)) {
    throw new Error('The optic zoom check needs a rendered engine');
  }
  // The figure and the post chain can be rebuilt between frames, so each frame reads them afresh.
  const fittedOptic = () => {
    const slot = Object.keys(slots).find((key) => slots[key]?.uid === scope.uid);
    return slot === undefined ? undefined : r.view.playerMeshes.slotModelOf(rifle, slot);
  };
  const opticReadout = () => {
    const readout = mood.opticReadout;
    if (!readout) {
      throw new Error('The optic zoom check needs the optic pass');
    }
    return readout;
  };
  /**
   * @param {Object3D} object
   * @returns {object is Mesh}
   */
  const isMesh = (object) => 'isMesh' in object && object.isMesh === true;
  /**
   * @param {Object3D} object
   * @returns {object is Mesh | Line | Points}
   */
  const isDrawable = (object) =>
    isMesh(object) ||
    ('isLine' in object && object.isLine === true) ||
    ('isPoints' in object && object.isPoints === true);
  return new Promise((done, failed) => {
    const { render } = renderer;
    /** @type {OpticZoomRecord | undefined} */
    let drawn;
    /** @type {string[]} */
    let sourceDraws = [];
    let imageDraws = 0;
    let frames = 0;
    /**
     * @param {Object3D} object
     * @param {Object3D} root
     */
    const isUnder = (object, root) => {
      for (let node = /** @type {Object3D | null} */ (object); node; node = node.parent) {
        if (node === root) {
          return true;
        }
      }
      return false;
    };
    /** @param {Object3D} object */
    const topLevelKey = (object) => {
      let top = object;
      while (top.parent && top.parent !== scene) {
        top = top.parent;
      }
      return `${top.name || top.type}[L${top.layers.mask}]`;
    };
    /** @param {Object3D} object */
    const pathOf = (object) => {
      const names = [];
      for (let node = /** @type {Object3D | null} */ (object); node; node = node.parent) {
        names.unshift(`${node.name || node.type}[L${node.layers.mask}]`);
      }
      return names.join(' > ');
    };
    // Each object's own render callback fires only when the renderer submits it for this camera, so what it sees
    // is what the zoom pass draws, whatever the layer or visibility rules were.
    /**
     * @param {Object3D} drawnScene
     * @param {Camera} observedCamera
     */
    const submit = (drawnScene, observedCamera) => {
      /** @type {string[]} */
      const objects = [];
      /** @type {Record<string, number>} */
      const others = {};
      /** @type {string[]} */
      const opticObjects = [];
      const optic = fittedOptic();
      /** @type {(() => void)[]} */
      const restore = [];
      /** @param {Mesh | Line | Points} object */
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
        if (!isDrawable(object)) {
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
      if (drawnScene !== scene || !(mood.isOpticZoomCamera(drawnCamera) || source)) {
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
      if (!frame) {
        throw new Error('The zoom camera drew without an optic lens frame');
      }
      const readout = opticReadout();
      const optic = fittedOptic();
      let opticMeshCount = 0;
      let opticVertices = 0;
      let clippedOpticVertices = 0;
      let nearestOpticDepth = Number.POSITIVE_INFINITY;
      engine.camera.updateWorldMatrix(true, false);
      optic?.traverse((object) => {
        if (!isMesh(object)) {
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
        housingActive: readout.housingActive,
        magnification: frame.magnification,
        zoomCameraLayers: readout.zoomLayerMask,
        zoomTextureIsTarget: readout.showsZoomImage,
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
          housingActive: opticReadout().housingActive,
          zoomActive: opticReadout().zoomActive,
          reticleCenter: frame.reticleCenter,
          shaderReticleCenter: opticReadout().reticleCenter,
        };
      }
      if (drawn && drawn.opticMeshCount > 0) {
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

// Puts a helmet on and takes it off, reading the edge/centre ratio of the frames either side. The reads sit a few
// frames apart because reads seconds apart can see a different daylit scene, and they use the drawing buffer because
// a page screenshot costs seconds on CI's software renderer. Each read runs once the frame's draws have finished:
// below render scale 1 the scene is drawn into a sub-viewport that only a later upscale covers
// (render/screenScale.ts, ScreenScale.render), so a read on the held layer's stack would measure the unrendered
// strips, and the adaptive scale's step changes between reads would pass for a scene change.
/** @param {Page} page */
const visorRatios = (page) =>
  page.evaluate(async () => {
    const r = globalThis.primaryActionTest;
    const { held } = r.view;
    const visorParent = held.warmUpTarget.camera;
    const { renderer } = r.engine;
    if (!renderer) {
      throw new Error('The visor check needs a rendered engine');
    }
    const gl = renderer.getContext();
    /**
     * @param {number} nx
     * @param {number} ny
     */
    const bandOf = (nx, ny) => {
      if (nx < 0.06 || nx > 0.94 || ny < 0.06) {
        return 'edge';
      }
      return nx > 0.4 && nx < 0.6 && ny > 0.4 && ny < 0.6 ? 'centre' : undefined;
    };
    const ratio = () => {
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const data = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      const sums = { edge: { light: 0, count: 0 }, centre: { light: 0, count: 0 } };
      for (let offset = 0; offset < data.length; offset += 4) {
        const pixel = offset / 4;
        // The buffer's rows run bottom to top.
        const band = bandOf((pixel % width) / width, 1 - Math.floor(pixel / width) / height);
        if (band) {
          const [red = 0, green = 0, blue = 0] = data.subarray(offset, offset + 3);
          sums[band].light += red + green + blue;
          sums[band].count += 1;
        }
      }
      return sums.edge.light / sums.edge.count / (sums.centre.light / sums.centre.count);
    };
    /** @returns {Promise<number>} */
    const nextFrame = () =>
      new Promise((drawn) => {
        const { render } = held;
        held.render = (...args) => {
          render.apply(held, args);
          held.render = render;
          // A microtask, not this stack: it runs once the frame callback (the upscale included)
          // has returned, and still before any other task can touch the buffer.
          queueMicrotask(() => {
            drawn(ratio());
          });
        };
      });
    /**
     * The frame after the visor's state is seen, so the read cannot land before it is drawn.
     * @param {number} count
     */
    const onceVisor = async (count) => {
      for (let frames = 0; frames < 30; frames += 1) {
        if (visorParent.children.length === count) {
          return nextFrame();
        }
        await nextFrame();
      }
      throw new Error(`The held camera did not reach ${count} visor children within 30 frames`);
    };
    const baseline = await nextFrame();
    const helmet = r.inventory.create('riot_helmet');
    if (!r.inventory.add(helmet, { kind: 'worn' })) {
      throw new Error('Could not wear helmet fixture');
    }
    const worn = await onceVisor(1);
    const removed = r.inventory.move(helmet, { kind: 'pile', pos: r.feet() });
    if (!removed.ok) {
      throw new Error(removed.reason);
    }
    return { baseline, worn, restored: await onceVisor(0) };
  });

// Every wait in this stage follows a page load or a software-rendered frame, whose duration scales with machine
// load, so a Playwright timer only turns a busy runner into a failure. A hung wait ends at the CI step's
// `timeout-minutes` (`.github/workflows/deadvox-browser.yml`) or, run through `test:ui-browser`, at its `timeout`
// (`packages/deadvox/package.json`, "test:ui-browser"). `timePhase` logs each phase's start and `enterWorld` each
// readiness change, so the last lines before a kill name the stuck phase and the part that stayed false.
/**
 * @param {Browser} chromium
 * @param {ViewportSize} viewport
 */
const newStagePage = async (chromium, viewport) => {
  const stagePage = await openStagePage(chromium, viewport);
  stagePage.page.setDefaultTimeout(0);
  return stagePage;
};

const readinessParts = () => {
  const overlay = document.querySelector('#overlay');
  const loading = document.querySelector('#world-loading');
  const mask = loading instanceof HTMLElement ? loading : undefined;
  return {
    testHook: Boolean(globalThis.primaryActionTest),
    overlayHidden: overlay instanceof HTMLElement && overlay.hidden,
    pointerLocked: Boolean(document.pointerLockElement),
    worldLoading: mask?.dataset.state,
    loadingMessage: mask?.querySelector('#world-loading-message')?.textContent,
    maskHidden: mask?.hidden === true,
  };
};

/** @param {ReturnType<typeof readinessParts>} parts */
const isEntered = (parts) =>
  parts.testHook && parts.overlayHidden && parts.pointerLocked && parts.worldLoading === 'ready' && parts.maskHidden;

const READINESS_POLL_MS = 250;

/**
 * Polls until the world is entered or its load has failed, logging each change of the parts.
 * @param {Page} page
 */
const enterWorld = async (page) => {
  await page.locator('#go').click();
  let parts;
  let logged;
  do {
    parts = await page.evaluate(readinessParts);
    const line = JSON.stringify(parts);
    if (line !== logged) {
      process.stdout.write(`WORLD_READINESS ${line}\n`);
      logged = line;
    }
    if (!isEntered(parts) && parts.worldLoading !== 'failed') {
      await new Promise((done) => setTimeout(done, READINESS_POLL_MS));
    }
  } while (!isEntered(parts) && parts.worldLoading !== 'failed');
  assert.equal(parts.worldLoading, 'ready', `the world becomes ready: ${JSON.stringify(parts)}`);
  assert.ok(isEntered(parts), `the ready world is entered: ${JSON.stringify(parts)}`);
};

/**
 * @param {Browser} chromium
 * @param {number} port
 * @param {InlineStartMod} startMod
 */
const enterTestHouse = async (chromium, port, startMod) => {
  const { page, pageErrors } = await newStagePage(chromium, { width: 640, height: 360 });
  page.on('pageerror', (error) => process.stdout.write(`PAGE_ERROR ${error.stack}\n`));
  // At this viewport the HUD's quickbar covers the floor sample, and its pixels would drown the glow.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const hudless = document.createElement('style');
      hudless.textContent = '#hud, #quickbar, #prompt { visibility: hidden }';
      document.head.append(hudless);
    });
  });
  await timePhase('testHouse-pixel-boot', async () => {
    await loadStartScreen(
      page,
      playTestUrl({
        stage: 'primary-action-pixel',
        port,
        startMod,
        // The view starts on the path's open ground facing east, away from the showroom deck and its props, so the
        // floor sample sees bare ground.
        hash: {
          debug: true,
          seed: 73,
          radius: 32,
          at: [-4, -0.5, -90],
          ...stageLookBaseline,
          post: false,
          sunshadow: false,
          torchshadow: false,
        },
      }),
      { dominantHand: 'left' },
    );
    await enterWorld(page);
  });
  const clip = await page.locator('#view canvas').boundingBox();
  assert(clip, 'the loaded scene has a canvas');
  // Page clipping avoids the locator screenshot's extra layout-stability frames.
  const capture = () => page.screenshot({ clip });
  return { page, capture, pageErrors };
};

/** @param {string} line */
const writeLine = (line) => process.stdout.write(`${line}\n`);

/**
 * Holds throw until the held item is on the ground, as a player drops it, then waits for a frame that draws it there.
 * @param {Page} page
 * @param {Item['uid']} uid
 * @param {string} label
 */
const dropHeldItem = async (page, uid, label) => {
  await waitForSimulation(
    page,
    ({ itemUid }) => {
      const r = globalThis.primaryActionTest;
      const item = r.inventory.itemByUid(itemUid);
      return {
        time: r.session.sim.time,
        paused: r.session.sim.paused,
        reached: item !== undefined && r.inventory.locate(item)?.kind === 'pile',
      };
    },
    { itemUid: uid },
    { seconds: 5, label, hold: 'player.throw', record: writeLine },
  );
  const frame = await page.evaluate(() => globalThis.primaryActionTest.frames);
  await page.waitForFunction((start) => globalThis.primaryActionTest.frames > start, frame);
};

/**
 * Opens the inventory screen, steps the selection to the item and wields it, as a player does, then closes the screen.
 * @param {Page} page
 * @param {Item['uid']} uid
 * @param {string} label
 */
const wieldFromInventory = async (page, uid, label) => {
  await pressAction(page, 'ui.inventory-toggle');
  const rows = await page.locator('#inventory [data-uid]').count();
  const selection = () =>
    page.evaluate(() => document.querySelector('#inventory [data-uid].selected')?.getAttribute('data-uid') ?? null);
  for (let selected = await selection(), steps = 0; selected !== String(uid); selected = await selection()) {
    assert.ok(steps < rows, `the inventory selection reaches item ${uid}`);
    await pressAction(page, 'inventory.next');
    await page.waitForFunction(inventorySelectionChanged, selected);
    steps += 1;
  }
  await pressAction(page, 'inventory.hands');
  await waitForSimulation(
    page,
    ({ itemUid }) => {
      const r = globalThis.primaryActionTest;
      return {
        time: r.session.sim.time,
        paused: r.session.sim.paused,
        reached: r.inventory.hands[r.dominant]?.uid === itemUid,
        dominant: r.inventory.hands[r.dominant]?.type,
        off: r.inventory.hands[r.off]?.type,
        jobs: r.queue.jobs.map((job) => job.kind),
      };
    },
    { itemUid: uid },
    { seconds: 10, label, record: writeLine },
  );
  await pressAction(page, 'ui.inventory-toggle');
};

/** @type {PixelCheck} */
const heldItemChecks = async (chromium, port) => {
  const { page, capture, pageErrors } = await enterTestHouse(chromium, port, heldItemsMod);
  await timePhase('glowstick-pixel-assertions', async () => {
    const sticks = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.input.controls.pitch = -0.55;
      const [unlit, lit] = [r.off, r.dominant].map((side) => r.inventory.hands[side]);
      if (unlit?.type !== 'glowstick' || lit?.type !== 'glowstick') {
        throw new Error('The kit does not hold a glowstick in each hand');
      }
      return { unlit: unlit.uid, lit: lit.uid };
    });
    await dropHeldItem(page, sticks.unlit, 'holding throw drops the unlit off-hand glowstick');
    const { measurement: off } = await measureGlowstickFloor(page, sticks.unlit, 'off', capture);
    assert.notEqual(off.on, true);
    // A press where the pointer already is: moving it would turn the view off the floor sample.
    await page.mouse.down();
    await page.mouse.up();
    await waitForSimulation(
      page,
      ({ uid }) => {
        const r = globalThis.primaryActionTest;
        return {
          time: r.session.sim.time,
          paused: r.session.sim.paused,
          reached: r.inventory.itemByUid(uid)?.on === true,
        };
      },
      { uid: sticks.lit },
      { seconds: 5, label: 'the dominant-hand use lights the held glowstick', record: writeLine },
    );
    await dropHeldItem(page, sticks.lit, 'holding throw drops the lit glowstick');
    const { measurement: on } = await measureGlowstickFloor(page, sticks.lit, 'on', capture);
    assert.equal(on.on, true);
    process.stdout.write(`Dropped glowstick floor luminance: ${JSON.stringify({ off, on })}\n`);
    assert.ok(
      on.luminance > off.luminance + 3,
      'a dropped lit glowstick visibly brightens nearby floor pixels at night',
    );
    assert.deepEqual(pageErrors, []);
  });
  await timePhase('worn-helmet-assertions', async () => {
    // A visor paints its own tint, which outshines a night scene: only a band with daylight on it can be darkened.
    const noonFrame = await page.evaluate((noon) => {
      const r = globalThis.primaryActionTest;
      const { sim } = r.session;
      sim.setDebugCalendarTime(r.nextTimeOfDay(sim.calendar, noon));
      return r.frames;
    }, 12 * 3600);
    await page.waitForFunction((start) => globalThis.primaryActionTest.frames > start + 1, noonFrame);
    const { baseline, worn, restored } = await visorRatios(page);
    process.stdout.write(`Visor edge/centre ratios: ${JSON.stringify({ baseline, worn, restored })}\n`);
    assert.ok(baseline > 0 && Number.isFinite(baseline), 'the visor comparison needs a visible scene');
    assert.ok(worn < baseline * 0.9, 'wearing the visor darkens the outer band relative to the centre');
    assert.ok(Math.abs(restored / baseline - 1) < 0.02, 'removing the helmet restores the scene ratio');
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
    await page.evaluate(() => globalThis.primaryActionTest.thirdPerson.toggle());
    await page.waitForFunction(() => {
      const attachment = globalThis.primaryActionTest.view.playerMeshes.group.getObjectByName('worn-head');
      return attachment?.visible === true && attachment.children.length > 0;
    });
    await page.evaluate((itemUid) => {
      const r = globalThis.primaryActionTest;
      const helmet = r.inventory.itemByUid(itemUid);
      if (!helmet) {
        throw new Error('The worn helmet fixture is gone');
      }
      const result = r.inventory.move(helmet, { kind: 'pile', pos: r.feet() });
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
      for (const [role, name] of /** @type {const} */ ([
        ['head', 'figure-head'],
        ['eyes', 'worn-eyes'],
        ['body', 'figure-leftLeg'],
      ])) {
        const part = actor.getObjectByName(name);
        if (!part) {
          throw new Error(`The player figure has no ${name}`);
        }
        part.traverse((object) => {
          if (!('isMesh' in object && object.isMesh === true)) {
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
      r.input.controls.pitch = -1.3;
      return r.frames;
    });
    await page.waitForFunction((start) => globalThis.primaryActionTest.frames > start + 1, frame);
    const own = await page.evaluate(() => ({ ...globalThis.ownBodyDraws }));
    assert.equal(own.head, 0, 'own-camera world pass excludes the head');
    assert.equal(own.eyes, 0, 'own-camera world pass excludes eyes-slot equipment');
    assert.ok(own.body > 0, 'looking down draws the canonical world legs');
    const externalFrame = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      r.input.controls.pitch = 0;
      r.thirdPerson.toggle();
      return r.frames;
    });
    await page.waitForFunction((start) => globalThis.primaryActionTest.frames > start + 1, externalFrame);
    const external = await page.evaluate(() => ({ ...globalThis.ownBodyDraws }));
    assert.ok(external.head > 0 && external.eyes > 0, 'external world pass draws head and eyes-slot equipment');
    await page.evaluate((itemUid) => {
      const r = globalThis.primaryActionTest;
      const goggles = r.inventory.itemByUid(itemUid);
      if (!goggles) {
        throw new Error('The worn goggles fixture is gone');
      }
      const result = r.inventory.move(goggles, { kind: 'pile', pos: r.feet() });
      if (!result.ok) {
        throw new Error(result.reason);
      }
      r.thirdPerson.toggle();
      r.input.controls.pitch = -0.55;
    }, uid);
  });
  await timePhase('held-compass-pixel-assertion', async () => {
    // The card is lit like the model, so it is read by daylight; nothing after this phase needs the
    // night. Hiding only the card isolates its own pixels from the lit floor and the arm around it.
    const compass = await page.evaluate(() => {
      const r = globalThis.primaryActionTest;
      const found = [...r.inventory.items()].find(({ item }) => item.type === 'compass');
      if (found?.location.kind !== 'pocket') {
        throw new Error('The kit does not pocket a compass');
      }
      return found.item.uid;
    });
    await wieldFromInventory(page, compass, 'the inventory screen wields the pocketed compass');
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
// optic's sight picture. Acceptance must not depend on the render cadence — one frame can carry
// the acquisition past any watched interval — so once the raise completes the recorder takes
// exclusive control of the session's tick entry: outer frames are absorbed while it advances the
// acquisition in bounded single player ticks to a partial state, renders it, then hands the ticks
// back and samples until the acquisition completes. Runs inside the page.
const adsAcquisitionMotionRecord = async () => {
  const r = globalThis.primaryActionTest;
  const { session } = r;
  r.input.controls.pitch = 0;
  const rifle = r.inventory.hands[r.dominant];
  if (!rifle) {
    throw new Error('The scoped rifle is not in the dominant hand');
  }
  if (r.debugGunPose.mode !== 'hip') {
    r.debugGunPose.toggle('hip');
  }
  const { uid } = rifle;
  const playerTick = 1 / 60;
  /** @type {{ acquired: boolean, elapsed: number, lensFrame: boolean }[]} */
  const samples = [];
  let latched = false;
  let holding = false;
  let toggledAt = 0;
  let heldElapsed = 0;
  /** @type {Vector3Tuple | undefined} */
  let hipCamera;
  let partialCamera;
  /** @type {unknown} */
  let failWith;
  /** @type {(value?: unknown) => void} */
  let markLatched;
  /** @type {(value?: unknown) => void} */
  let markDone;
  const latchedNow = new Promise((markReady) => {
    markLatched = markReady;
  });
  const completed = new Promise((markFinished) => {
    markDone = markFinished;
  });
  const { frame } = session;
  try {
    session.frame = (...args) => {
      if (holding) {
        // Exclusive control: while the ticks are held, only the recorder's bounded steps run.
        return;
      }
      let out;
      try {
        out = frame(...args);
      } catch (error) {
        // An error in the tick itself must settle the recorder rather than dangle its awaits.
        failWith = error;
        markLatched();
        markDone();
        return;
      }
      try {
        if (!latched) {
          if (session.firearms.isReady(uid) && r.debugGunPose.mode !== 'ads') {
            r.debugGunPose.toggle('ads');
            toggledAt = r.frames;
            latched = true;
            holding = true;
            hipCamera = r.engine.camera.position.toArray();
            markLatched();
          }
          return out;
        }
        const sample = {
          acquired: session.firearms.isAdsAcquired(uid),
          elapsed: rifle.firearm?.adsAcquiring?.elapsedSimSeconds ?? 0,
          lensFrame: r.view.held.opticLensFrame !== undefined,
        };
        samples.push(sample);
        if (sample.acquired) {
          markDone();
        }
      } catch (error) {
        failWith = error;
        markLatched();
        markDone();
      }
      return out;
    };
    await latchedNow;
    if (failWith) {
      throw failWith;
    }
    // Bounded steps to a partial acquisition: one player tick at a time, so a state inside the
    // acquisition is reached by construction instead of watched for in whole frames.
    const acquiring = () => rifle.firearm?.adsAcquiring;
    for (let steps = 0; steps < 600; steps += 1) {
      const current = acquiring();
      if (current && current.elapsedSimSeconds >= current.durationSimSeconds / 2) {
        break;
      }
      frame(playerTick);
    }
    const reached = acquiring();
    heldElapsed = reached?.elapsedSimSeconds ?? 0;
    if (!reached || session.firearms.isAdsAcquired(uid)) {
      throw new Error('Bounded ticks did not reach a partial acquisition state');
    }
    // Rendering continues while the ticks are held; give the view a few frames to present the
    // partial state, then read the camera it shows.
    for (let index = 0; index < 3; index += 1) {
      await new Promise((frameDone) => requestAnimationFrame(frameDone));
    }
    partialCamera = r.engine.camera.position.toArray();
    holding = false;
    await completed;
    if (failWith) {
      throw failWith;
    }
    if (!hipCamera) {
      throw new Error('The hip camera was not read when ADS latched');
    }
    return {
      rifleUid: uid,
      toggledAt,
      framesToAcquire: r.frames - toggledAt,
      samples,
      heldElapsed,
      partialCamera,
      hipCamera,
    };
  } finally {
    holding = false;
    session.frame = frame;
  }
};

/** @type {PixelCheck} */
const opticZoomCheck = async (chromium, port) => {
  // One session also exercises clearing masks when switching between optic presentations.
  // The short-relief prism also protects the world camera's near-plane boundary.
  const { page } = await enterTestHouse(chromium, port, opticRifleMod);
  await installScopedGun(page);
  // The optic's sight picture must arrive with the acquisition motion, not on the toggle's frame.
  await timePhase('ads-acquisition-motion', async () => {
    await page.evaluate(scopeHeldRifle, { gunType: 'rifle_assault', opticType: 'optic_fixed_prism_4x' });
    const acquisition = await page.evaluate(adsAcquisitionMotionRecord);
    const { samples } = acquisition;
    const [first] = samples;
    const last = samples.at(-1);
    assert.ok(
      samples.length > 1 && first && last,
      'long-gun ADS acquisition is observed over more than one simulation frame',
    );
    assert.equal(first.acquired, false, 'the sight is not acquired on the frame after the toggle');
    assert.equal(last.acquired, true, 'the sight is acquired once acquisition completes');
    assert.ok(acquisition.framesToAcquire > 1, 'aiming down sights takes simulation time rather than snapping');
    // Render frames can land between 60 Hz player ticks and run no tick, so renderer samples may
    // legitimately repeat a tick's progress. What must hold over every sample, completion included,
    // is no backwards motion, and the completed progress must stand above the first sample's.
    assert.ok(
      samples.every((sample, index) => {
        const previous = samples[index - 1];
        return !previous || sample.elapsed >= previous.elapsed;
      }),
      'acquisition progress never runs backwards between renderer samples, completion included',
    );
    assert.ok(last.elapsed > first.elapsed, 'acquisition progress advances from the first sample to the completed one');
    const incomplete = samples.slice(0, -1);
    assert.ok(
      incomplete.every((sample) => !sample.lensFrame),
      'the optic sight picture waits for the acquisition to complete',
    );
    // The view carries the aim from hip to sights with the acquisition instead of snapping. The
    // record reaches a partial acquisition by bounded ticks and renders it, so acceptance never
    // depends on the render cadence: the held mid-acquisition camera must sit strictly part-way
    // between the hip eye and the settled full-ADS camera, which the final read takes after one
    // redraw.
    const sightPicture = await page.waitForFunction((uid) => {
      const r = globalThis.primaryActionTest;
      return r.session.inventory.hands[r.dominant]?.uid === uid && r.view.held.opticLensFrame !== undefined;
    }, acquisition.rifleUid);
    assert.ok(sightPicture, 'the optic sight picture arrives once the acquisition completes');
    const finalCamera = await page.evaluate(() => globalThis.primaryActionTest.engine.camera.position.toArray());
    /**
     * @param {Vector3Tuple} from
     * @param {Vector3Tuple} to
     */
    const cameraDistance = (from, to) => Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]);
    const travel = cameraDistance(acquisition.hipCamera, finalCamera);
    assert.ok(travel > 0.002, 'the camera travels from the hip eye to the sighted eye');
    assert.ok(
      acquisition.heldElapsed > 0 && acquisition.heldElapsed < last.elapsed,
      'the held partial state sits strictly inside the acquisition',
    );
    const carried = cameraDistance(acquisition.hipCamera, acquisition.partialCamera);
    assert.ok(
      carried >= 0.25 * travel && carried <= 0.75 * travel,
      'the held partial acquisition renders the camera part-way to the sight line',
    );
    process.stdout.write(
      `ADS_ACQUISITION_MOTION ${JSON.stringify({ framesToAcquire: acquisition.framesToAcquire, samples: samples.length })}\n`,
    );
  });
  /** @type {Record<'optic-zoom' | 'optic-sights', [string, string, OpticEndpoint, boolean?][]>} */
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
  assert.ok(group === 'optic-zoom' || group === 'optic-sights', 'the optic check runs for an optic group');
  for (const [index, [opticType, gunType, endpoint, physicalWindow = false]] of endpoints[group].entries()) {
    await timePhase('optic-disc-endpoint', async () => {
      const first = index === 0;
      if (first) {
        await page.evaluate(scopeHeldRifle, { gunType, opticType });
      }
      const record = await page.evaluate(opticZoomRecord, {
        opticType,
        gunType,
        endpoint,
        refit: !first,
        withGear: first,
      });
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
        assert.equal(record.zoomActive, false, 'the shader preserves the source image');
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
            const { scopeDiscPixels } = /** @type {typeof OpticDiscScene} */ (await import(moduleUrl));
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

/**
 * Opens the lake scenario with the camera over the basin centre, so the small startup ring is the lake, and
 * enters the world. `hash` adds to the stage's own settings.
 * @param {Browser} chromium
 * @param {number} port
 * @param {HashState} hash
 */
const openLake = async (chromium, port, hash) => {
  const { page, pageErrors: errors } = await newStagePage(chromium, { width: 640, height: 400 });
  const { layouts } = /** @type {{ layouts: SiteLayoutDef[] }} */ (
    JSON.parse(await readFile(resolve(projectRoot, 'mods/skelly.deadvox.scenario.water/layouts-water.json'), 'utf8'))
  );
  const lakeLayout = layouts.find(({ id }) => id === 'lake_demo');
  const basin = lakeLayout?.terrain[0];
  const lake = lakeLayout?.water?.[0];
  assert.ok(basin?.kind === 'basin' && lake, 'the lake_demo layout has a basin with water');
  const [centreX, centreZ] = basin.centre;
  const cam = [centreX, lake.level + 2, centreZ, 0, 89, 0];
  await timePhase('lake-menu', () =>
    loadStartScreen(
      page,
      playTestUrl({
        stage: 'primary-action-pixel',
        port,
        startMod: lakeNoonMod,
        hash: {
          ...stageLookBaseline,
          debug: true,
          seed: 1,
          radius: 16,
          cam,
          freeze: true,
          sunshadow: false,
          torchshadow: false,
          ...hash,
        },
      }),
    ),
  );
  await timePhase('lake-enter', () => enterWorld(page));
  return { page, errors };
};

// Installs `globalThis.lakeLook(eyeAt, pitch, yaw)` in the page: puts the camera at a height over the basin centre,
// looking at a pitch (and a yaw, when given), and resolves with the centre pixel, the pixel `BESIDE_PIXELS` to its
// right and the chunk depth of the second frame after the move
// (so the camera has followed the body). The game is frozen, so a placed body stays put. The software renderer
// draws a frame or two a second, so every view is read inside one render hook, not awaited. It reads the drawing
// buffer right after the mood pass, the frame's last draw, so post on and off are both read as the player sees
// them; the HUD is DOM, not in it.
/** @typedef {{ r: number, g: number, b: number }} Rgb */
/**
 * @typedef {(eyeAt: number, pitch: number, yaw?: number) => Promise<{
 *   cameraY: number,
 *   colour: Rgb,
 *   beside: Rgb,
 *   depth: ReturnType<typeof centreDepth>,
 * }>} LakeLook
 */
/** @param {number} beside */
const installLakeLook = async (beside) => {
  // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this browser-origin URL.
  const { centreDepth } = await import('/test/browser/water-depth.ts');
  const r = globalThis.primaryActionTest;
  const { engine } = r;
  const { body } = r.session;
  const s = r.scale.blockSize;
  const layout = engine.registry.layouts.get('lake_demo');
  const basin = layout?.terrain[0];
  const lake = layout?.water?.[0];
  if (!(basin?.kind === 'basin' && lake)) {
    throw new Error('The lake_demo layout has no basin with water');
  }
  const [x, z] = basin.centre;
  const { renderer, mood, camera, meshes } = engine;
  if (!(renderer && mood)) {
    throw new Error('The lake look needs a rendered engine');
  }
  const eye = camera.position.y - body.pos[1] * s;
  const gl = renderer.getContext();
  /** @param {number} dx */
  const pixelAt = (dx) => {
    const pixel = new Uint8Array(4);
    gl.readPixels(
      (gl.drawingBufferWidth >> 1) + dx,
      gl.drawingBufferHeight >> 1,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );
    const [red = 0, green = 0, blue = 0] = pixel;
    return { r: red, g: green, b: blue };
  };
  globalThis.lakeLook = (eyeAt, pitch, yaw) =>
    new Promise((done) => {
      body.pos = [x / s, (eyeAt - eye) / s, z / s];
      body.vel = [0, 0, 0];
      r.input.controls.pitch = pitch;
      if (yaw !== undefined) {
        r.input.controls.yaw = yaw;
      }
      const { render } = mood;
      let renders = 0;
      mood.render = (...args) => {
        render.apply(mood, args);
        renders += 1;
        if (renders < 2) {
          return;
        }
        mood.render = render;
        done({
          cameraY: camera.position.y,
          colour: pixelAt(0),
          beside: pixelAt(beside),
          depth: centreDepth({ renderer, camera, meshes }),
        });
      };
    });
  return lake.level;
};

// The lake's surface is drawn from both sides. The debug crack check paints wherever no geometry covers
// a pixel magenta, so a camera under the water looking straight up sees magenta exactly when the
// surface's underside is missing or wound away from it. Looking down or level would pass on the bed.
/** @typedef {(lake: Page, level: number, lakeErrors: string[]) => Promise<void>} LakeCheck */
/** @type {LakeCheck} */
const lakeSurfaceCheck = async (lake, level, lakeErrors) => {
  const { sky, under, above } = await lake.evaluate(async (surface) => {
    const s = globalThis.primaryActionTest.scale.blockSize;
    return {
      sky: await globalThis.lakeLook(surface + 2, 1.55),
      under: await globalThis.lakeLook(surface - s, 1.55),
      // Straight down, the player's own body covers the centre; a radian down meets the water just ahead.
      above: await globalThis.lakeLook(surface + 2, -1),
    };
  }, level);
  /** @param {Rgb} colour */
  const magenta = ({ r, g, b }) => r > 150 && b > 150 && g < 0.5 * Math.min(r, b);
  process.stdout.write(`Underwater surface views: ${JSON.stringify({ level, sky, under, above })}\n`);
  assert.ok(magenta(sky.colour) && sky.depth === 1, 'the control looks up at open sky and both oracles see it');
  assert.ok(under.cameraY < level && above.cameraY > level, 'the views sit under and above the surface');
  assert.ok(!magenta(under.colour), 'looking up from under the water, the centre pixel is the surface, not the sky');
  assert.ok(under.depth < 1, 'looking up from under the water, a chunk face covers the centre');
  assert.ok(above.colour.b > above.colour.r && above.depth < 1, 'looking down from above, the centre is water');
  assert.deepEqual(lakeErrors, []);
};

// The sky dome stands in for the flat background, so where nothing covers the horizon it must read as the flat
// background, which is the fog colour, with post on and off. The reference is the same view with the dome's
// material hidden. Higher up the dome must differ from it, or the horizon match could pass with no dome drawn.
// The page runs a tone mapper at an exposure other than 1 with bloom, so the post chain's colour scale and the
// sky's bloom rule are in play: a dome left unscaled, or bright enough to bloom, would not meet the fog colour.
// The content's horizon tint leans the band away from the fog colour on purpose, so the check zeroes it: only an
// untinted band has the fog colour as its exact target.
const HORIZON_PITCH = 0;
const HIGH_PITCH = 0.7;
const horizonTolerance = 3;
/**
 * @param {Rgb} a
 * @param {Rgb} b
 */
const apart = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
/** @type {LakeCheck} */
const skyHorizonCheck = async (lake, level, lakeErrors) => {
  const views = await lake.evaluate(
    async ({ surface, horizonPitch, highPitch }) => {
      const { mood, scene } = globalThis.primaryActionTest.engine;
      if (!mood) {
        throw new Error('The sky horizon check needs a rendered engine');
      }
      mood.setCrackCheck(false);
      // Film grain is a fresh per-pixel hash each frame, which would swamp the tolerance.
      mood.setFilm(false);
      /**
       * @param {Object3D | undefined} object
       * @returns {object is Mesh<BufferGeometry, ShaderMaterial>}
       */
      const isShadedMesh = (object) => {
        if (object === undefined || !('isMesh' in object) || !('material' in object)) {
          return false;
        }
        const { material } = object;
        return typeof material === 'object' && material !== null && 'isShaderMaterial' in material;
      };
      const dome = scene.getObjectByName('skyDome');
      if (!isShadedMesh(dome)) {
        throw new Error('The scene has no shaded skyDome');
      }
      const tint = dome.material.uniforms.uHorizonTint;
      if (!tint) {
        throw new Error('The sky dome has no horizon tint');
      }
      const shippedTint = tint.value;
      tint.value = 0;
      /** @param {boolean} visible */
      const lookWithDome = async (visible) => {
        dome.material.visible = visible;
        return {
          horizon: await globalThis.lakeLook(surface + 2, horizonPitch),
          high: await globalThis.lakeLook(surface + 2, highPitch),
        };
      };
      /** @param {boolean} post */
      const lookWithPost = async (post) => {
        mood.setPost(post);
        const view = { dome: await lookWithDome(true), flat: await lookWithDome(false) };
        dome.material.visible = true;
        return view;
      };
      const byMode = { direct: await lookWithPost(false), post: await lookWithPost(true) };
      tint.value = shippedTint;
      return byMode;
    },
    { surface: level, horizonPitch: HORIZON_PITCH, highPitch: HIGH_PITCH },
  );
  process.stdout.write(`Sky dome horizon views: ${JSON.stringify(views)}\n`);
  for (const [mode, { dome, flat }] of Object.entries(views)) {
    assert.equal(dome.horizon.depth, 1, `${mode}: nothing covers the horizon pixel, so it shows the sky`);
    assert.ok(
      apart(dome.horizon.colour, flat.horizon.colour) <= horizonTolerance,
      `${mode}: the dome meets the fog colour at the horizon`,
    );
    assert.ok(
      apart(dome.high.colour, flat.high.colour) > horizonTolerance,
      `${mode}: higher up the dome differs from the flat background`,
    );
  }
  assert.deepEqual(lakeErrors, []);
};

// The sun's disc is in frame, brighter than the sky beside it, or the checks below prove nothing.
//
// The sky stays out of bloom through `toDisplay`, whatever radiance it has. Only a small bright body against a sky
// with headroom can show that: a saturated pixel reads the same with bloom on and off, and radiance past half-float
// range blacks the frame instead of glowing. So the test-owned look, drawn only inside this page, is a clear keyed
// sky with no painted glow and a disc far past the bloom threshold, and the sky beside it reads the same either way.
//
// Bloom cannot light the sky, so the painted glow is all the glow the sun has. Every view is of that look, with only
// the glow varied, so tuning a shipped look cannot fail the check. A glow far past display range still has headroom
// only if it went through `toDisplay` with the rest of the sky.
const BRIGHT_SUN = 100;
const OVERDRIVEN_GLOW = 100;
const BESIDE_PIXELS = 24;
/** @type {LakeCheck} */
const skySunGlowCheck = async (lake, level, lakeErrors) => {
  const views = await lake.evaluate(
    async ({ surface, sunBrightness, overdrivenGlow }) => {
      const { mood, scene } = globalThis.primaryActionTest.engine;
      if (!mood) {
        throw new Error('The sun glow check needs a rendered engine');
      }
      mood.setCrackCheck(false);
      mood.setFilm(false);
      mood.setPost(true);
      /**
       * @param {Object3D | undefined} object
       * @returns {object is Mesh<BufferGeometry, ShaderMaterial>}
       */
      const isShadedMesh = (object) => {
        if (object === undefined || !('isMesh' in object) || !('material' in object)) {
          return false;
        }
        const { material } = object;
        return typeof material === 'object' && material !== null && 'isShaderMaterial' in material;
      };
      const dome = scene.getObjectByName('skyDome');
      if (!isShadedMesh(dome)) {
        throw new Error('The scene has no shaded skyDome');
      }
      const { uniforms } = dome.material;
      const { uSunDir } = uniforms;
      if (!uSunDir) {
        throw new Error('The sky dome has no sun direction');
      }
      const [x, y, z] = uSunDir.value.toArray();
      // The camera looks down its own -z, with the yaw about y applied after the pitch about x.
      const pitch = Math.asin(y);
      const yaw = Math.atan2(-x, -z);
      const look = () => globalThis.lakeLook(surface + 2, pitch, yaw);
      const { onBeforeRender } = dome;
      /** @param {Record<string, number>} overrides */
      const lookWith = async (overrides) => {
        // Runs at the draw, after the frame's own update has set the uniforms.
        dome.onBeforeRender = () => {
          for (const [name, value] of Object.entries(overrides)) {
            const uniform = uniforms[name];
            if (!uniform) {
              throw new Error(`The sky dome has no ${name} uniform`);
            }
            uniform.value = value;
          }
        };
        const view = await look();
        dome.onBeforeRender = onBeforeRender;
        return view;
      };
      const brightSun = { uPhysicalWeight: 0, uCloudOpacity: 0, uSunGlow: 0, uSunBrightness: sunBrightness };
      mood.setBloom(false);
      const plain = await lookWith(brightSun);
      const glowing = await lookWith({ ...brightSun, uSunGlow: 1 });
      const overdriven = await lookWith({ ...brightSun, uSunGlow: overdrivenGlow });
      mood.setBloom(true);
      const bloom = await lookWith(brightSun);
      return { plain, glowing, overdriven, bloom, bloomRan: mood.bloomDrawing };
    },
    { surface: level, sunBrightness: BRIGHT_SUN, overdrivenGlow: OVERDRIVEN_GLOW },
  );
  process.stdout.write(`Sky sun glow views: ${JSON.stringify(views)}\n`);
  /** @param {Rgb} colour */
  const brightness = ({ r, g, b }) => r + g + b;
  /**
   * @param {Rgb} lit
   * @param {Rgb} dim
   */
  const visiblyBrighter = (lit, dim) => brightness(lit) > brightness(dim) + 3 * horizonTolerance;
  assert.ok(views.bloomRan, 'the bloom pass runs for the view that compares the sky with bloom on');
  assert.ok(
    visiblyBrighter(views.plain.colour, views.plain.beside),
    'the sun disc is in frame, brighter than the sky beside it',
  );
  /** @param {Rgb} colour */
  const hasHeadroom = (colour) => Math.max(...Object.values(colour)) + horizonTolerance < 255;
  assert.ok(hasHeadroom(views.plain.beside), 'the sky beside the sun has headroom for bloom to show');
  assert.ok(
    apart(views.bloom.beside, views.plain.beside) <= horizonTolerance,
    'the sky beside a very bright sun gains no glow from bloom',
  );
  assert.ok(
    visiblyBrighter(views.glowing.beside, views.plain.beside),
    'the painted glow brightens the sky beside the sun',
  );
  assert.ok(hasHeadroom(views.overdriven.beside), 'a glow far past display range is brought into it with the sky');
  assert.deepEqual(lakeErrors, []);
};

/** @type {PixelCheck} */
const lakeChecks = (chromium, port) =>
  timePhase('lake-pixels', async () => {
    const { page: lake, errors } = await openLake(chromium, port, {
      post: false,
      crackcheck: true,
      tone: 'aces',
      exposure: 0.5,
      bloom: true,
    });
    try {
      const level = await lake.evaluate(installLakeLook, BESIDE_PIXELS);
      await timePhase('underwater-surface-pixels', () => lakeSurfaceCheck(lake, level, errors));
      await timePhase('sky-dome-horizon-pixels', () => skyHorizonCheck(lake, level, errors));
      await timePhase('sky-sun-glow-pixels', () => skySunGlowCheck(lake, level, errors));
    } finally {
      await lake.close();
    }
  });

const vite = await createStageServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'error',
  plugins: [observationPlugin],
  server: { host: '127.0.0.1', port: 0 },
});
/** @type {Browser | undefined} */
let browser;
try {
  await timePhase('vite-listen', () => vite.listen());
  const port = listeningPort(vite);
  browser = await timePhase('browser-launch', () =>
    launchChromium('primary-action-pixel', {
      headless: true,
      args: ['--enable-webgl'],
      renderMode: 'pixel',
    }),
  );
  /** @type {Record<PixelGroup, PixelCheck>} */
  const checks = {
    held: heldItemChecks,
    'optic-zoom': opticZoomCheck,
    'optic-sights': opticZoomCheck,
    lake: lakeChecks,
  };
  await checks[group](browser, port);
} finally {
  const launched = browser;
  if (launched) {
    await timePhase('browser-close', () => launched.close());
  }
  await timePhase('vite-close', () => vite.close());
}
