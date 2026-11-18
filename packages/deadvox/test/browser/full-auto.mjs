// biome-ignore-all lint/correctness/noNodejsModules: standalone native WebAudio/browser contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner selects the installed Chromium
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { modFileBytes } from '../modFile.ts';
import { pointActionMenu, waitForActionRing } from './action-menu.mjs';
import { launchChromium } from './chromium.mjs';
import { gameUrl, inlineStartMod } from './gameUrl.mjs';
import { holdAction, pressAction } from './input-actions.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';
import { waitForWorldLoaded } from './world-loading.mjs';

/**
 * @import * as FirearmHandling from '@skelly/engine/internal/game/firearmHandling.ts'
 * @import { HudSettings } from '@skelly/presentation/internal/ui/hudOptions.ts'
 * @import { PlayTestHandle } from './playTestHandle.ts'
 */
/** @typedef {import('@skelly/engine/sound').SoundId} SoundId */
/**
 * @typedef {{
 *   source: AudioBufferSourceNode;
 *   event: SoundId | undefined;
 *   gain: AudioNode | null;
 *   starts: number[];
 *   simStarts: (number | undefined)[];
 *   startFrames: number[];
 *   stops: { when: number | null; now: number }[];
 *   ramps: { value: number; time: number }[];
 *   disconnected: boolean;
 *   gainDisconnected: boolean;
 * }} SourceRecord
 */
/**
 * The page probe; the fields after `event` arrive as the stage reaches each phase.
 * @typedef {{
 *   shots: number[];
 *   shotFrames: number[];
 *   frame: number;
 *   sources: SourceRecord[];
 *   peak: number;
 *   released: boolean;
 *   laserVisibleAfterFire: boolean;
 *   event: SoundId;
 *   titleF1DefaultPrevented?: boolean;
 *   titleF2DefaultPrevented?: boolean;
 *   f1DefaultPrevented?: boolean;
 *   f2DefaultPrevented?: boolean;
 *   trajectories?: number;
 *   reportReader?: ReturnType<PlayTestHandle['session']['sim']['events']['reader']>;
 *   casesBefore?: number;
 *   releaseAt?: number;
 * }} FullAutoProbe
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const magazineModel = JSON.parse(modFileBytes('gungen/magazine_stanag_30.model.json').toString('utf8'));
const noonStart = {
  density: null,
  id: 'full_auto_noon_start',
  kit: [
    { condition: 0.7, count: 1, destination: { kind: 'worn' }, id: 'jeans', item: 'jeans' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'sneakers', item: 'sneakers' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'hoodie', item: 'hoodie' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'beans', item: 'canned_beans' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'matches', item: 'matches' },
    { count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 }, id: 'bandages', item: 'bandage' },
  ],
  recipes: [
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
  ],
  seed: 1,
  site: 'testHouse',
  skills: {},
  startTimeGameTimeOfDay: '12:00',
  storeys: 1,
  wounds: [],
};
const rifleStart = {
  ...noonStart,
  id: 'full_auto_fixture_start',
  debugOnly: true,
  kit: [
    ...noonStart.kit,
    { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } },
    { id: 'firearm', item: 'rifle_assault', destination: { kind: 'hand', role: 'dominant' } },
    {
      id: 'fitted_magazine',
      item: 'magazine_stanag_30',
      cartridges: new Array(magazineModel.gun.capacity).fill('cartridge_5_d_56x45'),
      destination: { kind: 'slot', parent: 'firearm', slot: 'magazine' },
    },
    {
      id: 'spare_magazine',
      item: 'magazine_stanag_30',
      cartridges: new Array(magazineModel.gun.capacity).fill('cartridge_5_d_56x45'),
      destination: { kind: 'pocket', parent: 'backpack', pocket: 0 },
    },
    {
      id: 'box',
      item: 'cartridge_box_5_d_56x45',
      destination: { kind: 'pocket', parent: 'backpack', pocket: 0 },
    },
  ],
};
const vite = await createStageServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  const port = listeningPort(vite);
  browser = await launchChromium('full-auto', { headless: true });
  const page = await browser.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    /** @type {FullAutoProbe} */
    const probe = {
      shots: [],
      shotFrames: [],
      frame: 0,
      sources: [],
      peak: 0,
      released: false,
      laserVisibleAfterFire: false,
      event: 'gunshot',
    };
    globalThis.fullAutoProbe = probe;
    // A voice starts in a microtask after the frame that fired its shot, and microtasks drain before the next
    // animation frame, so shot and start share this count. A deferred or batched start does not.
    const countFrame = () => {
      probe.frame += 1;
      requestAnimationFrame(countFrame);
    };
    requestAnimationFrame(countFrame);
    /** @param {SourceRecord} record */
    const gun = (record) => record.event === probe.event;
    const makeSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = makeSource.call(this);
      /** @type {SourceRecord} */
      const record = {
        source,
        // Game audio names the event once the stage observes its voices; see `observeSourceStarts`.
        event: undefined,
        gain: null,
        starts: [],
        simStarts: [],
        startFrames: [],
        stops: [],
        ramps: [],
        disconnected: false,
        gainDisconnected: false,
      };
      probe.sources.push(record);
      const connect = source.connect.bind(source);
      source.connect = (/** @type {AudioNode | AudioParam} */ gain) => {
        if (!(gain instanceof AudioNode && 'gain' in gain && gain.gain instanceof AudioParam)) {
          throw new Error('The full-auto probe needs each voice source to feed a node with a gain');
        }
        record.gain = gain;
        const disconnectGain = gain.disconnect.bind(gain);
        gain.disconnect = () => {
          record.gainDisconnected = true;
          return disconnectGain();
        };
        const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
        gain.gain.linearRampToValueAtTime = (value, time) => {
          record.ramps.push({ value, time });
          return ramp(value, time);
        };
        return connect(gain);
      };
      const start = source.start.bind(source);
      source.start = (...args) => {
        record.starts.push(this.currentTime);
        record.simStarts.push(globalThis.skellyPlayTest?.session.sim.time);
        record.startFrames.push(probe.frame);
        const result = start(...args);
        probe.peak = Math.max(
          probe.peak,
          probe.sources.filter((entry) => gun(entry) && entry.starts.length > 0 && !entry.disconnected).length,
        );
        return result;
      };
      const stop = source.stop.bind(source);
      source.stop = (...args) => {
        record.stops.push({ when: args[0] ?? null, now: this.currentTime });
        return stop(...args);
      };
      const disconnect = source.disconnect.bind(source);
      source.disconnect = () => {
        record.disconnected = true;
        return disconnect();
      };
      return source;
    };
    let locked = false;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => (locked ? document.querySelector('#view') : null),
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
  await page.goto(
    browserStageUrl(
      'full-auto',
      gameUrl(`http://127.0.0.1:${port}`, {
        startMod: inlineStartMod('fixture.full-auto.rifle', rifleStart),
        harness: { 'play-test': 1 },
        hash: {
          debug: true,
          seed: 73,
          radius: 64,
          at: [43.5, 0, -90],
          post: false,
          sunshadow: false,
          torchshadow: false,
          mannequin: 'regional_map-right-lowered',
          mannequinWear: ['jacket', 'jeans', 'rubber_boots', 'utility_vest', 'school_backpack'],
        },
      }),
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  const debugGateCode = await page.evaluate(
    `import('/src/product/input.ts').then(({ inputBindings }) => inputBindings.chords('debug.gate')[0].code)`,
  );
  await page.evaluate((code) => {
    globalThis.fullAutoProbe.titleF1DefaultPrevented = false;
    globalThis.fullAutoProbe.titleF2DefaultPrevented = false;
    globalThis.addEventListener('keydown', (event) => {
      if (event.code === 'F1') {
        globalThis.fullAutoProbe.titleF1DefaultPrevented = event.defaultPrevented;
      }
      if (event.code === code) {
        globalThis.fullAutoProbe.titleF2DefaultPrevented = event.defaultPrevented;
      }
    });
  }, debugGateCode);
  await page.keyboard.press('F1');
  assert.equal(
    await page.evaluate(() => globalThis.fullAutoProbe.titleF1DefaultPrevented),
    false,
    'F1 is not cancelled on the title screen',
  );
  await pressAction(page, 'debug.gate');
  assert.equal(
    await page.evaluate(() => globalThis.fullAutoProbe.titleF2DefaultPrevented),
    true,
    'the debug modifier cancels F2 on the title screen',
  );
  // Read committed reports before returning from fire so native starts must still share their shot's frame.
  await page.evaluate(async () => {
    const moduleUrl = '/@stage/@skelly/engine/internal/game/firearmHandling.ts';
    const { FirearmMechanics } = /** @type {typeof FirearmHandling} */ (await import(moduleUrl));
    if (typeof FirearmMechanics?.prototype?.fire !== 'function') {
      throw new Error(
        'Full-auto observer needs packages/engine/src/game/firearmHandling.ts FirearmMechanics.prototype.fire',
      );
    }
    const { fire } = FirearmMechanics.prototype;
    FirearmMechanics.prototype.fire = function (input) {
      const admitted = fire.call(this, input);
      const probe = globalThis.fullAutoProbe;
      for (const report of probe.reportReader?.read() ?? []) {
        if (report.kind === 'sound' && report.event === probe.event) {
          probe.shots.push(report.time);
          probe.shotFrames.push(probe.frame);
        }
      }
      return admitted;
    };
  });
  await page.locator('#go').click();
  await waitForWorldLoaded(page);
  await page.waitForFunction(() => globalThis.skellyPlayTest && document.querySelector('#debug-ui-root'));
  await page.evaluate(() => {
    const { audio, input } = globalThis.skellyPlayTest;
    audio.observeSourceStarts((event, source) => {
      const record = globalThis.fullAutoProbe.sources.findLast((entry) => entry.source === source);
      if (!record) {
        throw new Error('The full-auto probe records each voice source as game audio creates it');
      }
      record.event = event;
    });
    input.controls.pitch = (-20 * Math.PI) / 180;
  });
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#overlay');
    return document.pointerLockElement !== null && overlay instanceof HTMLElement && overlay.hidden;
  });
  assert.equal(await page.locator('#debug-center-x').count(), 1, 'debug profile includes the separate centre X');
  const mannequinGroup = page.locator('section[data-group="mannequin"]');
  assert.equal(await mannequinGroup.count(), 1, 'a requested mannequin gets its own debug panel section');
  const mannequinPose = mannequinGroup.locator('.debug-actions button').first();
  const poseBefore = await mannequinPose.textContent();
  await pressAction(page, 'debug.mannequin-next');
  await page.waitForFunction(
    ([before]) =>
      document.querySelector('section[data-group="mannequin"] .debug-actions button')?.textContent !== before,
    [poseBefore],
  );
  const reviewMap = page.locator('iframe[title="Current-world review map"]');
  await pressAction(page, 'debug.review-map-toggle');
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe[title="Current-world review map"]');
    return frame instanceof HTMLIFrameElement && !frame.hidden && frame.src.includes('overlay=1');
  });
  const reviewMapPage = page.frameLocator('iframe[title="Current-world review map"]');
  await reviewMapPage.locator('html[data-ready="true"]').waitFor();
  const mapParams = await reviewMap.evaluate((frame) => {
    if (!(frame instanceof HTMLIFrameElement)) {
      throw new Error('The review map is not an iframe');
    }
    return Object.fromEntries(new URL(frame.src).searchParams);
  });
  assert.equal(mapParams.seed, '73', 'review map receives the active world seed');
  assert.equal(
    mapParams.site,
    await page.evaluate(() => globalThis.skellyPlayTest.engine.config.site),
    'review map receives the active site',
  );
  assert.equal(mapParams.centerX, mapParams.playerX, 'map centers on the player');
  assert.equal(mapParams.centerZ, mapParams.playerZ, 'map centers on the player');
  assert.equal(Number.isFinite(Number(mapParams.playerYaw)), true, 'map receives player facing');
  assert.equal(
    await page.evaluate(() => globalThis.skellyPlayTest.session.sim.paused),
    false,
    'map matches the debug panel pause rule',
  );
  const reviewMapHidden = () => {
    const frame = document.querySelector('iframe[title="Current-world review map"]');
    return frame instanceof HTMLIFrameElement && frame.hidden;
  };
  const reviewMapShown = () => {
    const frame = document.querySelector('iframe[title="Current-world review map"]');
    return frame instanceof HTMLIFrameElement && !frame.hidden;
  };
  await pressAction(page, 'debug.review-map-toggle');
  await page.waitForFunction(reviewMapHidden);
  await pressAction(page, 'debug.review-map-toggle');
  await page.waitForFunction(reviewMapShown);
  // Closing resets the frame to about:blank; a reopen needs the new page's key forwarder ready before Escape.
  await reviewMapPage.locator('html[data-ready="true"]').waitFor();
  await reviewMap.evaluate((frame) => {
    if (!(frame instanceof HTMLIFrameElement)) {
      throw new Error('The review map is not an iframe');
    }
    frame.contentWindow?.focus();
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(reviewMapHidden);
  /**
   * @param {string} labelText
   * @param {keyof HudSettings} key
   * @param {string} selector
   * @param {boolean} visible
   */
  const setHudOption = async (labelText, key, selector, visible) => {
    await page.evaluate(
      ({ label, nextVisibility }) => {
        const option = [...document.querySelectorAll('#hud-options label')].find((candidate) =>
          candidate.textContent.includes(label),
        );
        const checkbox = option?.querySelector('input');
        if (!checkbox) {
          throw new Error(`${label} HUD option is missing`);
        }
        checkbox.checked = nextVisibility;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { label: labelText, nextVisibility: visible },
    );
    await page.waitForFunction(
      ({ optionKey, optionSelector, nextVisibility }) => {
        const stored = localStorage.getItem('skelly.hud-options');
        const target = document.querySelector(optionSelector);
        return (
          stored !== null &&
          JSON.parse(stored)[optionKey] === nextVisibility &&
          target instanceof HTMLElement &&
          target.hidden === !nextVisibility
        );
      },
      { optionKey: key, optionSelector: selector, nextVisibility: visible },
    );
  };
  const centreX = page.locator('#debug-center-x');
  await setHudOption('Crosshair', 'crosshair', '#crosshair', false);
  assert.equal(await centreX.isVisible(), false, 'debug centre X is hidden with the Crosshair option off');
  await setHudOption('Crosshair', 'crosshair', '#crosshair', true);
  assert.equal(await centreX.isVisible(), true, 'debug centre X appears when the Crosshair option is on');
  const centreXBox = await centreX.boundingBox();
  const viewport = page.viewportSize();
  assert(centreXBox && viewport);
  assert.ok(
    Math.abs(centreXBox.x + centreXBox.width / 2 - viewport.width / 2) < 0.5,
    'debug X is centred horizontally',
  );
  assert.ok(
    Math.abs(centreXBox.y + centreXBox.height / 2 - viewport.height / 2) < 0.5,
    'debug X is centred vertically',
  );
  await setHudOption('Quickbar', 'quickbar', '#quickbar', true);
  const shownReadout = await page.evaluate(() => {
    const { debugTools, eye } = globalThis.skellyPlayTest;
    if (!debugTools) {
      throw new Error('the full-auto stage runs with the debug tools');
    }
    debugTools.updateAim(undefined);
    debugTools.updateLookedAt(eye(), [0, -1, 0], true);
    const lookReadout = document.querySelector('#debug-look-readout');
    const quickbar = document.querySelector('#quickbar');
    if (!(lookReadout && quickbar instanceof HTMLElement)) {
      throw new Error('the debug look readout and the quickbar are on the page');
    }
    const readout = lookReadout.getBoundingClientRect();
    const bar = quickbar.getBoundingClientRect();
    return {
      text: lookReadout.textContent.trim(),
      quickbarHidden: quickbar.hidden || getComputedStyle(quickbar).display === 'none',
      readout: { top: readout.top, bottom: readout.bottom, left: readout.left, right: readout.right },
      quickbarTop: bar.top,
      middle: innerHeight / 2,
      width: innerWidth,
    };
  });
  assert.notEqual(shownReadout.text, '', 'looked-at block readout is populated');
  const furnitureMassReadout = await page.evaluate(() => {
    const { debugTools, eye, session } = globalThis.skellyPlayTest;
    const { inventory } = session;
    if (!debugTools) {
      throw new Error('the full-auto stage runs with the debug tools');
    }
    const definition = [...inventory.registry.furniture.values()].find(
      (value) => value.massKg !== undefined && value.size.every((axis) => axis <= 2),
    );
    if (!definition) {
      throw new Error('No compact furniture with an authored mass');
    }
    const origin = eye();
    const entity = inventory.furnish({
      type: definition.id,
      pos: [Math.floor(origin[0]) + 1, Math.floor(session.body.pos[1]) + 2, Math.floor(origin[2])],
      size: definition.size,
      facing: 'n',
    });
    if (!entity) {
      throw new Error('Could not furnish debug mass target');
    }
    const [x, y, z] = entity.pos;
    const [width, height, depth] = entity.size;
    const [dx, dy, dz] = [x + width / 2 - origin[0], y + height / 2 - origin[1], z + depth / 2 - origin[2]];
    const length = Math.hypot(dx, dy, dz);
    debugTools.updateLookedAt(origin, [dx / length, dy / length, dz / length], true);
    const lookReadout = document.querySelector('#debug-look-readout');
    if (!lookReadout) {
      throw new Error('the debug look readout is on the page');
    }
    return { text: lookReadout.textContent, mass: definition.massKg };
  });
  assert.ok(
    furnitureMassReadout.text.includes(String(furnitureMassReadout.mass)),
    'debug furniture readout includes the content-authored mass',
  );
  assert.equal(shownReadout.quickbarHidden, false, 'quickbar is shown');
  assert.ok(shownReadout.readout.top > shownReadout.middle, 'looked-at readout is below the screen middle');
  assert.ok(shownReadout.readout.bottom <= shownReadout.quickbarTop, 'looked-at readout clears the quickbar');
  assert.ok(centreXBox.y + centreXBox.height < shownReadout.readout.top, 'looked-at readout clears the centre X');
  assert.ok(
    shownReadout.quickbarTop - shownReadout.readout.bottom < shownReadout.readout.bottom - shownReadout.readout.top,
    'looked-at readout sits just above the quickbar',
  );
  assert.equal(
    shownReadout.readout.left + shownReadout.readout.right,
    shownReadout.width,
    'looked-at readout is horizontally centred',
  );
  const aimReadout = await page.evaluate(() => {
    const { debugTools, eye } = globalThis.skellyPlayTest;
    if (!debugTools) {
      throw new Error('the full-auto stage runs with the debug tools');
    }
    debugTools.updateAim({
      id: 0,
      region: 'torso',
      distanceMetres: 1,
      reachMetres: 1,
      inReach: true,
      health: 1,
      maxHealth: 1,
      boxes: [],
      hitBox: {
        bone: 'core.trunk',
        center: [0, 0, 0],
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        halfSize: [0.2, 0.3, 0.1],
        voxelCentroid: [0, 0, 0],
        voxelCount: 1,
      },
    });
    debugTools.updateLookedAt(eye(), [0, -1, 0], true);
    const look = document.querySelector('#debug-look-readout');
    const aim = document.querySelector('#debug-aim-readout');
    if (!(look && aim)) {
      throw new Error('the debug look and aim readouts are on the page');
    }
    return {
      aim: aim.textContent,
      look: look.textContent,
      lookVisible: look.getClientRects().length > 0,
    };
  });
  assert.notEqual(aimReadout.aim.trim(), '', 'shambler aim readout remains visible at the crosshair');
  assert.equal(aimReadout.look, '', 'looked-at block readout yields while the aim readout is active');
  assert.equal(aimReadout.lookVisible, false, 'the yielded readout has no box to overlap the aim readout');
  await setHudOption('Quickbar', 'quickbar', '#quickbar', false);
  const hiddenReadout = await page.evaluate(() => {
    const { debugTools, eye } = globalThis.skellyPlayTest;
    if (!debugTools) {
      throw new Error('the full-auto stage runs with the debug tools');
    }
    debugTools.updateAim(undefined);
    debugTools.updateLookedAt(eye(), [0, -1, 0], true);
    const lookReadout = document.querySelector('#debug-look-readout');
    const quickbar = document.querySelector('#quickbar');
    if (!(lookReadout && quickbar instanceof HTMLElement)) {
      throw new Error('the debug look readout and the quickbar are on the page');
    }
    const readout = lookReadout.getBoundingClientRect();
    return {
      top: readout.top,
      bottom: readout.bottom,
      middle: innerHeight / 2,
      height: innerHeight,
      quickbarHidden: quickbar.hidden,
    };
  });
  assert.equal(hiddenReadout.quickbarHidden, true, 'quickbar is hidden');
  assert.ok(hiddenReadout.top > hiddenReadout.middle, 'hidden quickbar leaves the readout below the screen middle');
  assert.ok(
    hiddenReadout.height - hiddenReadout.bottom < hiddenReadout.top - hiddenReadout.middle,
    'without a quickbar the readout stays near the bottom edge',
  );
  await pressAction(page, 'debug.build-toggle');
  await page.waitForFunction(() => globalThis.skellyPlayTest.debugTools?.buildOn === true);
  const buildReadout = await page.evaluate(() => {
    const { debugTools, eye } = globalThis.skellyPlayTest;
    if (!debugTools) {
      throw new Error('the full-auto stage runs with the debug tools');
    }
    debugTools.updateLookedAt(eye(), [0, -1, 0], true);
    const lookReadout = document.querySelector('#debug-look-readout');
    const hotbar = document.querySelector('#hotbar');
    if (!(lookReadout && hotbar instanceof HTMLElement)) {
      throw new Error('the debug look readout and the build palette are on the page');
    }
    const readout = lookReadout.getBoundingClientRect();
    const palette = hotbar.getBoundingClientRect();
    return {
      text: lookReadout.textContent.trim(),
      hidden: hotbar.hidden || getComputedStyle(hotbar).display === 'none',
      readoutBottom: readout.bottom,
      paletteTop: palette.top,
      paletteHeight: palette.height,
    };
  });
  assert.notEqual(buildReadout.text, '', 'build-mode block readout is populated');
  assert.equal(buildReadout.hidden, false, 'build palette is shown');
  assert.ok(buildReadout.paletteHeight > 0, 'build palette has visible bounds');
  assert.ok(buildReadout.readoutBottom <= buildReadout.paletteTop, 'readout clears the build palette');
  await pressAction(page, 'debug.build-toggle');
  await page.waitForFunction(() => globalThis.skellyPlayTest.debugTools?.buildOn === false);
  await page.evaluate((code) => {
    globalThis.fullAutoProbe.f1DefaultPrevented = false;
    globalThis.fullAutoProbe.f2DefaultPrevented = false;
    globalThis.addEventListener('keydown', (event) => {
      if (event.code === 'F1') {
        globalThis.fullAutoProbe.f1DefaultPrevented = event.defaultPrevented;
      }
      if (event.code === code) {
        globalThis.fullAutoProbe.f2DefaultPrevented = event.defaultPrevented;
      }
    });
  }, debugGateCode);
  await page.keyboard.press('F1');
  assert.equal(
    await page.evaluate(() => globalThis.fullAutoProbe.f1DefaultPrevented),
    false,
    'F1 is not cancelled in gameplay',
  );
  await pressAction(page, 'debug.gate');
  assert.equal(
    await page.evaluate(() => globalThis.fullAutoProbe.f2DefaultPrevented),
    true,
    'the debug modifier prevents the browser default for F2 in gameplay',
  );
  await page.evaluate(() => {
    const { impactEffects } = globalThis.skellyPlayTest.view;
    const fire = impactEffects.fire.bind(impactEffects);
    let trajectories = 0;
    globalThis.fullAutoProbe.trajectories = trajectories;
    impactEffects.fire = (traces, debugLaser) => {
      trajectories += traces.length;
      globalThis.fullAutoProbe.trajectories = trajectories;
      fire(traces, debugLaser);
      globalThis.fullAutoProbe.laserVisibleAfterFire ||= impactEffects.laser.visible;
    };
  });
  const tuning = await page.evaluate(async () => {
    const { inventory } = globalThis.skellyPlayTest.session;
    const moduleUrl = '/@stage/@skelly/engine/inventory';
    const { firearmHandlingFor, spentCaseItemId } = await import(moduleUrl);
    const rifle = inventory.hands.right;
    const firearm = rifle && inventory.registry.items.get(rifle.type)?.firearm;
    if (!(rifle && firearm)) {
      throw new Error('Full-auto fixture needs a firearm in the right hand');
    }
    const data = firearmHandlingFor(rifle, inventory.registry);
    const event = firearm.shotSound;
    globalThis.fullAutoProbe.event = event;
    const voiceCap = inventory.registry.sounds.get(event)?.voiceCap;
    const rounds = rifle.slots?.magazine?.cartridges?.length;
    if (
      !(voiceCap !== undefined && voiceCap > 0 && data.roundsPerSimSecond > 0 && rounds !== undefined && rounds > 1)
    ) {
      throw new Error('Full-auto fixture needs capped audio, automatic cadence and a loaded magazine');
    }
    const interval = 1 / data.roundsPerSimSecond;
    const duration = Math.min(2, (rounds - 0.5) * interval);
    return { voiceCap, interval, duration, caseType: spentCaseItemId(data.calibre) };
  });
  const expectedShots = Math.ceil(tuning.duration / tuning.interval);
  assert.ok(expectedShots > 1, 'the burst exercises automatic follow-up shots');
  // Exercise same-quantum cold admission beyond the selected sound's cap.
  await page.evaluate((voiceCap) => {
    const { session } = globalThis.skellyPlayTest;
    const { inventory } = session;
    const rifle = inventory.hands.right;
    if (rifle?.type !== 'rifle_assault') {
      throw new Error('The AR loadout is missing before cold sound startup');
    }
    for (let index = 0; index < voiceCap + 8; index++) {
      session.playPlayerSound(globalThis.fullAutoProbe.event, session.sim.time, { listenerRelative: true });
    }
  }, tuning.voiceCap);
  await page.waitForFunction(
    (voiceCap) =>
      globalThis.fullAutoProbe.sources.filter(
        (record) => record.starts.length > 0 && record.event === globalThis.fullAutoProbe.event,
      ).length ===
      voiceCap + 8,
    tuning.voiceCap,
  );
  const cold = await page.evaluate(() =>
    globalThis.fullAutoProbe.sources
      .filter((record) => record.event === globalThis.fullAutoProbe.event)
      .map(({ stops, ramps }) => ({ stops, ramps })),
  );
  assert.equal(cold.flatMap(({ stops }) => stops).length, 8, 'the selected voice cap leaves eight fading retirees');
  assert.ok(
    cold.every(({ stops, ramps }) =>
      stops.every(
        ({ when, now }) => when !== null && when > now && ramps.some((ramp) => ramp.value === 0 && ramp.time === when),
      ),
    ),
    'all cold starts retain fades rather than immediate hard stops',
  );
  await page.waitForFunction(() =>
    globalThis.fullAutoProbe.sources
      .filter((record) => record.event === globalThis.fullAutoProbe.event)
      .every((record) => record.disconnected),
  );
  await page.evaluate(() => {
    globalThis.fullAutoProbe.sources = [];
  });

  await page.evaluate(({ caseType, duration }) => {
    const { session } = globalThis.skellyPlayTest;
    const { inventory } = session;
    // The selected start holds a full fitted magazine; charge it as a player would.
    const rifle = inventory.hands.right;
    if (rifle?.type !== 'rifle_assault' || !rifle.slots?.magazine) {
      throw new Error('The AR loadout did not put a magazine-fed AR in the right hand');
    }
    const reportReader = session.sim.events.reader();
    globalThis.fullAutoProbe.reportReader = reportReader;
    reportReader.read();
    const refusal = session.firearms.cock(rifle.uid, session.sim.time);
    if (refusal) {
      throw new Error(`Could not charge the fixture AR: ${refusal}`);
    }
    for (let step = 0; session.queue.busy; step += 1) {
      if (step > 600) {
        throw new Error('Charging the fixture AR did not finish');
      }
      session.frame(1 / 60);
    }
    const probe = globalThis.fullAutoProbe;
    probe.casesBefore = [...inventory.piles.values()]
      .flatMap((pile) => pile.items)
      .filter(({ item }) => item.type === caseType)
      .reduce((sum, { item }) => sum + item.count, 0);
    // Release from the actual simulation clock, not a wall-clock sleep or guessed frame count.
    session.sim.scheduler.register({
      id: 'full-auto-test-release',
      rate: 60,
      tick: (_dt, time) => {
        const [firstShot] = probe.shots;
        if (firstShot !== undefined && time >= firstShot + duration - 1e-9 && !probe.released) {
          globalThis.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
          probe.released = true;
          probe.releaseAt = time;
        }
      },
    });
  }, tuning);
  await page.mouse.down({ button: 'right' });
  const readyDuration = await page.evaluate(() => {
    const { session } = globalThis.skellyPlayTest;
    const { inventory } = session;
    session.frame(1 / 60);
    const readying = inventory.hands.right?.firearm?.readying;
    if (!readying) {
      throw new Error('The fixture rifle is readying after the aim press');
    }
    return readying.duration;
  });
  await page.evaluate((duration) => globalThis.skellyPlayTest.session.frame(duration), readyDuration);
  assert.equal(
    await page.evaluate(() => {
      const { session } = globalThis.skellyPlayTest;
      const { inventory } = session;
      const rifle = inventory.hands.right;
      if (!rifle) {
        throw new Error('The fixture rifle is in the right hand before firing');
      }
      return session.firearms.isReady(rifle.uid);
    }),
    true,
    'fixture rifle is ready before firing',
  );
  assert.equal(
    await page.evaluate(() => Boolean(globalThis.skellyPlayTest.heldFirearmBore())),
    true,
    'wielded firearm publishes its bore for the crosshair',
  );
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.waitForFunction(() => globalThis.fullAutoProbe.released);
  await page.mouse.up();
  const impactPresentation = await page.evaluate(() => ({
    marks: globalThis.skellyPlayTest.view.impactEffects.activeMarks,
    laserSegments: globalThis.skellyPlayTest.view.impactEffects.laser.geometry.drawRange.count,
    laserVisibleAfterFire: globalThis.fullAutoProbe.laserVisibleAfterFire,
  }));
  assert.ok(impactPresentation.marks > 0, 'committed rounds that meet world geometry create impact marks');
  assert.ok(
    impactPresentation.laserSegments > 0 && impactPresentation.laserVisibleAfterFire,
    'debug trajectory segments are visible in the renderer',
  );
  const cadence = await page.evaluate(() => ({ shots: globalThis.fullAutoProbe.shots }));
  assert.equal(
    cadence.shots.length,
    expectedShots,
    'holding primary follows the admitted cadence over the half-open burst',
  );
  assert.equal(
    await page.evaluate(() => globalThis.fullAutoProbe.trajectories),
    cadence.shots.length,
    'each committed rifle round reaches the shared world-impact presentation',
  );
  const [firstShot] = cadence.shots;
  assert.ok(firstShot !== undefined, 'the burst fired');
  cadence.shots.forEach((time, index) => {
    assert.ok(
      Math.abs(time - firstShot - index * tuning.interval) < 1e-8,
      'exact simulation shot deadlines, not accumulated frame rounding',
    );
  });
  await page.waitForFunction(() => {
    const { releaseAt } = globalThis.fullAutoProbe;
    return releaseAt !== undefined && globalThis.skellyPlayTest.session.sim.time > releaseAt + 0.25;
  });
  assert.equal(await page.evaluate(() => globalThis.fullAutoProbe.shots.length), expectedShots, 'release stops firing');
  const recoilState = await page.evaluate(() => {
    const { input, session } = globalThis.skellyPlayTest;
    const state = session.aim.snapshotState();
    return {
      finite: [
        session.playerStridePhase,
        state.lookYaw,
        state.lookPitch,
        state.recoilYaw,
        state.recoilPitch,
        state.frame.yaw,
        state.frame.pitch,
      ].every(Number.isFinite),
      pitch: input.controls.pitch,
    };
  });
  assert.ok(recoilState.finite, 'the skill-zero burst keeps aim state finite');
  assert.ok(Math.abs(recoilState.pitch) <= Math.PI / 2, 'recoil keeps camera pitch within its valid range');
  await page.evaluate(() => {
    // The burst left a few rounds: change to the loadout's spare full magazine, as a player would with R.
    const { session } = globalThis.skellyPlayTest;
    const { inventory } = session;
    const rifle = inventory.hands.right;
    if (!rifle) {
      throw new Error('The fixture rifle is in the right hand before the magazine change');
    }
    const refusal = session.firearms.loadNext(rifle.uid, session.sim.time);
    if (refusal) {
      throw new Error(`Could not change to the spare magazine: ${refusal}`);
    }
    for (let step = 0; session.queue.busy; step += 1) {
      if (step > 600) {
        throw new Error('Changing to the spare magazine did not finish');
      }
      session.frame(1 / 60);
    }
  });

  // Seed the selected cap with real decoded samples so the warm burst must steal.
  await page.waitForFunction(() =>
    globalThis.fullAutoProbe.sources
      .filter((record) => record.event === globalThis.fullAutoProbe.event)
      .every((record) => record.disconnected),
  );
  await page.evaluate((voiceCap) => {
    const { session } = globalThis.skellyPlayTest;
    const probe = globalThis.fullAutoProbe;
    probe.sources = [];
    probe.peak = 0;
    for (let index = 0; index < voiceCap; index++) {
      session.playPlayerSound(probe.event, session.sim.time, { listenerRelative: true });
    }
  }, tuning.voiceCap);
  await page.waitForFunction(
    (voiceCap) =>
      globalThis.fullAutoProbe.sources.filter(
        (record) => record.event === globalThis.fullAutoProbe.event && record.starts.length > 0,
      ).length === voiceCap,
    tuning.voiceCap,
  );
  await page.evaluate(() => {
    const { reportReader } = globalThis.fullAutoProbe;
    if (!reportReader) {
      throw new Error('The report reader was opened before the first burst');
    }
    // Warm-up voices test the cap, not committed firearm shots.
    reportReader.read();
    globalThis.fullAutoProbe.shots = [];
    globalThis.fullAutoProbe.shotFrames = [];
    globalThis.fullAutoProbe.released = false;
  });
  await page.mouse.down();
  await page.waitForFunction(() => globalThis.fullAutoProbe.released);
  await page.mouse.up();
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() =>
    globalThis.fullAutoProbe.sources
      .filter((record) => record.event === globalThis.fullAutoProbe.event)
      .every((record) => record.disconnected && record.gainDisconnected),
  );
  const native = await page.evaluate(() => ({
    shots: globalThis.fullAutoProbe.shots,
    shotFrames: globalThis.fullAutoProbe.shotFrames,
    peak: globalThis.fullAutoProbe.peak,
    records: globalThis.fullAutoProbe.sources
      .filter((record) => record.event === globalThis.fullAutoProbe.event)
      .map(({ starts, simStarts, startFrames, stops, ramps, disconnected, gainDisconnected }) => ({
        starts,
        simStarts,
        startFrames,
        stops,
        ramps,
        disconnected,
        gainDisconnected,
      })),
  }));
  assert.equal(native.shots.length, expectedShots);
  assert.equal(
    native.records.length,
    tuning.voiceCap + expectedShots,
    'native source starts equal warm-up plus accepted shots',
  );
  assert.ok(native.records.every(({ starts }) => starts.length === 1));
  const burst = native.records.slice(tuning.voiceCap);
  // Voices start immediately on the audio clock, so its span is wall time under CI load. Bind each
  // native start to its shot instead: never before it on the simulation clock, and in the same animation
  // frame as it (a frame can fire two shots, so no sim-time upper bound is stable).
  assert.equal(native.shotFrames.length, expectedShots);
  burst.forEach(({ starts, simStarts, startFrames }, index) => {
    const [simStart] = simStarts;
    const shot = native.shots[index];
    assert.ok(
      simStart !== undefined && shot !== undefined && simStart >= shot - 1e-9,
      `native start ${index} begins no earlier than its shot on the simulation clock`,
    );
    assert.equal(startFrames[0], native.shotFrames[index], `native start ${index} begins in its shot's frame`);
    if (index > 0) {
      const [start] = starts;
      const previous = burst[index - 1]?.starts[0];
      assert.ok(
        start !== undefined && previous !== undefined && start >= previous,
        `native start ${index} follows start ${index - 1}`,
      );
    }
  });
  await page.waitForFunction(() => {
    const rifle = globalThis.skellyPlayTest.session.inventory.hands.right;
    return rifle !== undefined && !rifle.firearm?.landings?.length;
  });
  const persistentCases = await page.evaluate((caseType) => {
    const { casesBefore } = globalThis.fullAutoProbe;
    if (casesBefore === undefined) {
      throw new Error('The spent cases were counted before the first burst');
    }
    return (
      [...globalThis.skellyPlayTest.session.inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .filter(({ item }) => item.type === caseType)
        .reduce((sum, { item }) => sum + item.count, 0) - casesBefore
    );
  }, tuning.caseType);
  assert.equal(persistentCases, cadence.shots.length + native.shots.length, 'both bursts record every case at impact');
  assert.ok(native.peak <= 2 * tuning.voiceCap, 'live voices plus fading tails stay within twice the selected cap');
  assert.ok(
    native.records.some(({ stops }) => stops.length),
    'the warm two-second burst exercises voice stealing',
  );
  for (const { stops, ramps, disconnected, gainDisconnected } of native.records) {
    assert.ok(disconnected && gainDisconnected, 'native source and per-source gain are released');
    for (const { when, now } of stops) {
      assert.ok(when !== null && when > now, 'no immediate hard-stop after warm-up');
      assert.ok(
        ramps.some((ramp) => ramp.value === 0 && ramp.time === when),
        'each stolen native voice fades to zero before scheduled stop',
      );
    }
  }
  await page.waitForFunction(() => !globalThis.skellyPlayTest.session.queue.busy);
  const releaseMode = await holdAction(page, 'emote.menu');
  await waitForActionRing(page);
  await pointActionMenu(page, 'gun');
  await releaseMode();
  await page.locator('#action-radial .radial-entry[data-action="press-check"]').waitFor({ state: 'attached' });
  const releaseEmote = await holdAction(page, 'emote.menu');
  await pointActionMenu(page, 'press-check');
  await releaseEmote();
  await waitForActionRing(page, false);
  await page.waitForFunction(() => {
    const [job] = globalThis.skellyPlayTest.session.queue.jobs;
    return job?.kind === 'action' && job.jobType === 'firearm.press-check';
  });
  await page.locator('.debug-marker:not(.debug-frozen)').click();
  const toolsHeader = page.locator('[data-group="tools"] .debug-group-header');
  if ((await toolsHeader.getAttribute('aria-expanded')) === 'false') {
    await toolsHeader.click();
  }
  const skillKickSlider = page.locator('#firearms-skill-automaticFollowup-recoilKickScale');
  await skillKickSlider.waitFor();
  await skillKickSlider.scrollIntoViewIfNeeded();
  const sliderBounds = await skillKickSlider.boundingBox();
  assert.ok(sliderBounds, 'the firearms skill slider is visible for mouse input');
  const sliderBefore = Number(await skillKickSlider.inputValue());
  const sliderStartX = sliderBounds.x + sliderBounds.width * 0.2;
  const sliderEndX = sliderBounds.x + sliderBounds.width * 0.8;
  const sliderY = sliderBounds.y + sliderBounds.height / 2;
  const pointerState = await page.evaluate(() => {
    const { input } = globalThis.skellyPlayTest;
    return { locked: input.locked, menuPointer: input.menuPointer };
  });
  assert.deepEqual(
    pointerState,
    { locked: true, menuPointer: true },
    'the debug slider is used while pointer lock is routed to the menu',
  );
  const physicalStart = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  await page.mouse.move(physicalStart.x, physicalStart.y);
  await page.evaluate(
    ({ x, y }) => {
      const { input } = globalThis.skellyPlayTest;
      input.moveMenuCursor(x - input.cursorX, y - input.cursorY);
    },
    { x: sliderStartX, y: sliderY },
  );
  await page.mouse.down();
  await page.mouse.move(physicalStart.x + sliderEndX - sliderStartX, physicalStart.y, { steps: 8 });
  await page.mouse.up();
  const runtimeTuning = await page.evaluate(() => {
    const slider = document.querySelector('#firearms-skill-automaticFollowup-recoilKickScale');
    const { input, session } = globalThis.skellyPlayTest;
    const { inventory } = session;
    const gun = inventory.hands.right;
    if (!(slider instanceof HTMLInputElement && gun)) {
      throw new Error('The firearms skill slider and the fixture rifle are present after the drag');
    }
    return {
      slider: Number(slider.value),
      effective: session.firearms.skillZeroHandlingFor(gun.uid).automaticFollowup.recoilKickScale,
      locked: input.locked,
      saved: JSON.stringify(session.snapshot({ worldId: 'world', characterId: 'character' })),
    };
  });
  assert.notEqual(runtimeTuning.slider, sliderBefore, 'the mouse drag changes the slider value');
  assert.equal(runtimeTuning.effective, runtimeTuning.slider, 'the mouse-selected value changes firearm handling');
  assert.equal(runtimeTuning.locked, true, 'dragging the slider keeps pointer lock available for play');
  assert.ok(!runtimeTuning.saved.includes('skillZeroHandling'), 'runtime tuning is not included in a save');
  await page.goto(
    browserStageUrl(
      'full-auto',
      gameUrl(`http://127.0.0.1:${port}`, {
        startMod: inlineStartMod('fixture.full-auto.noon', noonStart),
        hash: { seed: 73, radius: 64, at: [43.5, 0, -90], post: false, sunshadow: false, torchshadow: false },
      }),
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await waitForWorldLoaded(page);
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#overlay');
    return overlay instanceof HTMLElement && overlay.hidden;
  });
  assert.equal(await page.locator('#debug-look-readout').count(), 0, 'normal play omits the debug look readout');
  assert.deepEqual(errors, []);
  process.stdout.write(
    `full-auto native WebAudio passed: ${expectedShots} shots/burst, ${persistentCases} cases, release stops, ${native.records.length} starts, native starts in their shots' frames, peak ${native.peak}, faded steals, all source/gain nodes released.\n`,
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  const state = await page?.evaluate(() => ({
    context: globalThis.skellyPlayTest?.audio.contextState,
    shots: globalThis.fullAutoProbe?.shots,
    sources: globalThis.fullAutoProbe?.sources.map(({ event, source, starts, stops, disconnected }) => ({
      event,
      duration: source.buffer?.duration,
      starts,
      stops,
      disconnected,
    })),
    errors: document.querySelector('#errors')?.textContent,
  }));
  process.stderr.write(`native full-auto failure state: ${JSON.stringify(state)}\n`);
  throw error;
} finally {
  await browser?.close();
  await vite.close();
}
