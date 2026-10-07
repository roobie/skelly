// biome-ignore-all lint/correctness/noNodejsModules: standalone native WebAudio/browser contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner selects the installed Chromium
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { pressAction } from './input-actions.mjs';
import { browserStageArgs, browserStageUrl } from './stage-mode.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const anchors = new Map([
  ['src/game/play.ts', '  const onForwardPress = (e: MouseEvent) => {'],
  ['src/game/audio.ts', '    this.stealOldestVoice(event, context);\n    const source = context.createBufferSource();'],
]);
const requireAnchor = (code, file, marker) => {
  const matches = code.split(marker).length - 1;
  if (matches !== 1) {
    throw new Error(`Full-auto observation anchor in ${file} must match exactly once; found ${matches}`);
  }
};
// Vite reports transform failures asynchronously. Validate before starting it or a browser,
// so an API change cannot masquerade as a later cold-audio wait timeout.
for (const [file, marker] of anchors) {
  requireAnchor(readFileSync(resolve(root, file), 'utf8'), file, marker);
}
const { chromium } = await import('playwright');
const vite = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'full-auto-observation',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/src/game/play.ts')) {
          const marker = anchors.get('src/game/play.ts');
          requireAnchor(code, 'src/game/play.ts', marker);
          return code.replace(
            marker,
            `  Object.assign(globalThis, { fullAutoRuntime: { input, inventory, session, audio, caseEffects, view, debugTools, eye, heldFirearmBore: () => heldFirearmBore() } });\n${marker}`,
          );
        }
        if (id.endsWith('/src/game/audio.ts')) {
          const marker = anchors.get('src/game/audio.ts');
          requireAnchor(code, 'src/game/audio.ts', marker);
          return code.replace(
            marker,
            '    this.stealOldestVoice(event, context);\n    globalThis.fullAutoProbe.event = event;\n    const source = context.createBufferSource();\n    globalThis.fullAutoProbe.event = undefined;',
          );
        }
      },
    },
  ],
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    headless: true,
    args: browserStageArgs('full-auto'),
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const probe = { shots: [], sources: [], peak: 0, released: false, laserVisibleAfterFire: false };
    globalThis.fullAutoProbe = probe;
    const gun = (record) => record.event === 'gunshot';
    const makeSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = makeSource.call(this);
      const record = {
        source,
        event: probe.event,
        gain: null,
        starts: [],
        stops: [],
        ramps: [],
        disconnected: false,
        gainDisconnected: false,
      };
      probe.sources.push(record);
      const connect = source.connect.bind(source);
      source.connect = (gain) => {
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
      `http://127.0.0.1:${address.port}/?seed=73&debug=1&loadout=ar&firearmsCombat=0&radius=64&time=12:00&cam=43.50,33.00,0.00,-90.0,-20.0,0.0&post=0&sunshadow=0&torchshadow=0`,
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  const debugGateCode = await page.evaluate(
    `import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.chords('debug.gate')[0].code)`,
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
  // Observe the public admission result instead of an implementation-specific source snippet.
  await page.evaluate(async () => {
    const moduleUrl = '/src/game/firearmHandling.ts';
    const { FirearmMechanics } = await import(moduleUrl);
    if (typeof FirearmMechanics?.prototype?.fire !== 'function') {
      throw new Error('Full-auto observer needs src/game/firearmHandling.ts FirearmMechanics.prototype.fire');
    }
    const { fire } = FirearmMechanics.prototype;
    FirearmMechanics.prototype.fire = function (input) {
      const admitted = fire.call(this, input);
      if (admitted) {
        globalThis.fullAutoProbe.shots.push(input.simTime);
      }
      return admitted;
    };
  });
  await page.locator('#go').click();
  await page.waitForFunction(() => globalThis.fullAutoRuntime && document.querySelector('#debug-ui-root'));
  await page.waitForFunction(() => document.pointerLockElement && document.querySelector('#overlay').hidden);
  assert.equal(await page.locator('#debug-center-x').count(), 1, 'debug profile includes the separate centre X');
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
      ({ optionKey, optionSelector, nextVisibility }) =>
        JSON.parse(localStorage.getItem('deadvox.hud-options'))[optionKey] === nextVisibility &&
        document.querySelector(optionSelector).hidden === !nextVisibility,
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
    const { debugTools, eye } = globalThis.fullAutoRuntime;
    debugTools.updateAim(undefined);
    debugTools.updateLookedAt(eye(), [0, -1, 0], true);
    const readout = document.querySelector('#debug-look-readout').getBoundingClientRect();
    const quickbar = document.querySelector('#quickbar');
    const bar = quickbar.getBoundingClientRect();
    return {
      text: document.querySelector('#debug-look-readout').textContent.trim(),
      quickbarHidden: quickbar.hidden || getComputedStyle(quickbar).display === 'none',
      readout: { top: readout.top, bottom: readout.bottom, left: readout.left, right: readout.right },
      quickbarTop: bar.top,
      middle: innerHeight / 2,
      width: innerWidth,
    };
  });
  assert.notEqual(shownReadout.text, '', 'looked-at block readout is populated');
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
    const { debugTools, eye } = globalThis.fullAutoRuntime;
    debugTools.updateAim({
      id: 0,
      region: 'torso',
      distanceMetres: 1,
      reachMetres: 1,
      inReach: true,
      health: 1,
      maxHealth: 1,
      boxes: [],
    });
    debugTools.updateLookedAt(eye(), [0, -1, 0], true);
    const look = document.querySelector('#debug-look-readout');
    return {
      aim: document.querySelector('#debug-aim-readout').textContent,
      look: look.textContent,
      lookVisible: look.getClientRects().length > 0,
    };
  });
  assert.notEqual(aimReadout.aim.trim(), '', 'shambler aim readout remains visible at the crosshair');
  assert.equal(aimReadout.look, '', 'looked-at block readout yields while the aim readout is active');
  assert.equal(aimReadout.lookVisible, false, 'the yielded readout has no box to overlap the aim readout');
  await setHudOption('Quickbar', 'quickbar', '#quickbar', false);
  const hiddenReadout = await page.evaluate(() => {
    const { debugTools, eye } = globalThis.fullAutoRuntime;
    debugTools.updateAim(undefined);
    debugTools.updateLookedAt(eye(), [0, -1, 0], true);
    const readout = document.querySelector('#debug-look-readout').getBoundingClientRect();
    return {
      top: readout.top,
      bottom: readout.bottom,
      middle: innerHeight / 2,
      height: innerHeight,
      quickbarHidden: document.querySelector('#quickbar').hidden,
    };
  });
  assert.equal(hiddenReadout.quickbarHidden, true, 'quickbar is hidden');
  assert.ok(hiddenReadout.top > hiddenReadout.middle, 'hidden quickbar leaves the readout below the screen middle');
  assert.ok(
    hiddenReadout.height - hiddenReadout.bottom < hiddenReadout.top - hiddenReadout.middle,
    'without a quickbar the readout stays near the bottom edge',
  );
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
    const { impactEffects } = globalThis.fullAutoRuntime.view;
    const fire = impactEffects.fire.bind(impactEffects);
    globalThis.fullAutoProbe.trajectories = 0;
    impactEffects.fire = (trajectory, debugLaser) => {
      globalThis.fullAutoProbe.trajectories += trajectory.directions.length;
      fire(trajectory, debugLaser);
      globalThis.fullAutoProbe.laserVisibleAfterFire ||= impactEffects.laser.visible;
    };
  });
  // Reproduce the review's same-quantum cold load with actual sample decoding/nodes.
  await page.evaluate(() => {
    const { session } = globalThis.fullAutoRuntime;
    for (let index = 0; index < 40; index++) {
      session.playPlayerSound('gunshot', session.sim.time, { listenerRelative: true });
    }
  });
  await page.waitForFunction(
    () =>
      globalThis.fullAutoProbe.sources.filter((record) => record.starts.length > 0 && record.event === 'gunshot')
        .length === 40,
  );
  const cold = await page.evaluate(() =>
    globalThis.fullAutoProbe.sources
      .filter((record) => record.event === 'gunshot')
      .map(({ stops, ramps }) => ({ stops, ramps })),
  );
  assert.equal(cold.flatMap(({ stops }) => stops).length, 8, '32 full cold voices and eight fading retirees');
  assert.ok(
    cold.every(({ stops, ramps }) =>
      stops.every(
        ({ when, now }) => when !== null && when > now && ramps.some((ramp) => ramp.value === 0 && ramp.time === when),
      ),
    ),
    'all 40 cold starts retain fades, not seven immediate hard stops',
  );
  await page.waitForFunction(() =>
    globalThis.fullAutoProbe.sources
      .filter((record) => record.event === 'gunshot')
      .every((record) => record.disconnected),
  );
  await page.evaluate(() => {
    globalThis.fullAutoProbe.sources = [];
  });

  await page.evaluate(() => {
    const { inventory, session } = globalThis.fullAutoRuntime;
    // ?loadout=ar holds the AR with a full magazine fitted; work the charging handle as a player would.
    const rifle = inventory.hands.right;
    if (rifle?.type !== 'rifle_assault' || !rifle.slots?.magazine) {
      throw new Error('The AR loadout did not put a magazine-fed AR in the right hand');
    }
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
      .filter(({ item }) => item.type === 'spent_case_5_d_56x45')
      .reduce((sum, { item }) => sum + item.count, 0);
    // Release from the actual simulation clock, not a wall-clock sleep or guessed frame count.
    session.sim.scheduler.register({
      id: 'full-auto-test-release',
      rate: 60,
      tick: (_dt, time) => {
        if (probe.shots.length > 0 && time >= probe.shots[0] + 2 - 1e-9 && !probe.released) {
          globalThis.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
          probe.released = true;
          probe.releaseAt = time;
        }
      },
    });
  });
  await page.mouse.down({ button: 'right' });
  const readyDuration = await page.evaluate(() => {
    const { inventory, session } = globalThis.fullAutoRuntime;
    session.frame(1 / 60);
    return inventory.hands.right.firearm.readying.duration;
  });
  await page.evaluate((duration) => globalThis.fullAutoRuntime.session.frame(duration), readyDuration);
  assert.equal(
    await page.evaluate(() => {
      const { inventory, session } = globalThis.fullAutoRuntime;
      return session.firearms.isReady(inventory.hands.right.uid);
    }),
    true,
    'fixture rifle is ready before firing',
  );
  assert.equal(
    await page.evaluate(() => Boolean(globalThis.fullAutoRuntime.heldFirearmBore())),
    true,
    'wielded firearm publishes its bore for the crosshair',
  );
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.waitForFunction(() => globalThis.fullAutoProbe.released);
  await page.mouse.up();
  const impactPresentation = await page.evaluate(() => ({
    marks: globalThis.fullAutoRuntime.view.impactEffects.activeMarks,
    laserSegments: globalThis.fullAutoRuntime.view.impactEffects.laser.geometry.drawRange.count,
    laserVisibleAfterFire: globalThis.fullAutoProbe.laserVisibleAfterFire,
  }));
  assert.ok(impactPresentation.marks > 0, 'committed rounds that meet world geometry create impact marks');
  assert.ok(
    impactPresentation.laserSegments > 0 && impactPresentation.laserVisibleAfterFire,
    'debug trajectory segments are visible in the renderer',
  );
  const cadence = await page.evaluate(() => ({
    shots: globalThis.fullAutoProbe.shots,
    cases:
      [...globalThis.fullAutoRuntime.inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .filter(({ item }) => item.type === 'spent_case_5_d_56x45')
        .reduce((sum, { item }) => sum + item.count, 0) - globalThis.fullAutoProbe.casesBefore,
  }));
  assert.equal(
    cadence.shots.length,
    27,
    'holding AR primary fires 27 shots in the half-open two-second burst at 800 rpm',
  );
  assert.equal(cadence.cases, 27, 'every automatic shot records a persistent case');
  assert.equal(
    await page.evaluate(() => globalThis.fullAutoProbe.trajectories),
    cadence.shots.length,
    'each committed rifle round reaches the shared world-impact presentation',
  );
  cadence.shots.forEach((time, index) => {
    assert.ok(
      Math.abs(time - cadence.shots[0] - index * 0.075) < 1e-8,
      'exact simulation shot deadlines, not accumulated frame rounding',
    );
  });
  await page.waitForFunction(
    () => globalThis.fullAutoRuntime.session.sim.time > globalThis.fullAutoProbe.releaseAt + 0.25,
  );
  assert.equal(await page.evaluate(() => globalThis.fullAutoProbe.shots.length), 27, 'release stops firing');
  const recoilState = await page.evaluate(() => {
    const { input, session } = globalThis.fullAutoRuntime;
    const state = session.aim.snapshotState();
    return {
      finite: [
        state.gaitPhase,
        state.lookYaw,
        state.lookPitch,
        state.recoilYaw,
        state.recoilPitch,
        state.frame.yaw,
        state.frame.pitch,
      ].every(Number.isFinite),
      pitch: input.pitch,
    };
  });
  assert.ok(recoilState.finite, 'the skill-zero burst keeps aim state finite');
  assert.ok(Math.abs(recoilState.pitch) <= Math.PI / 2, 'recoil keeps camera pitch within its valid range');
  await page.evaluate(() => {
    // The burst left a few rounds: change to the loadout's spare full magazine, as a player would with R.
    const { inventory, session } = globalThis.fullAutoRuntime;
    const refusal = session.firearms.loadNext(inventory.hands.right.uid, session.sim.time);
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

  // Warm buffers are real decoded bundled samples. Seed 32 live tails so this burst must steal.
  await page.waitForFunction(() =>
    globalThis.fullAutoProbe.sources
      .filter((record) => record.event === 'gunshot')
      .every((record) => record.disconnected),
  );
  await page.evaluate(() => {
    const { session } = globalThis.fullAutoRuntime;
    const probe = globalThis.fullAutoProbe;
    probe.sources = [];
    probe.peak = 0;
    for (let index = 0; index < 32; index++) {
      session.playPlayerSound('gunshot', session.sim.time, { listenerRelative: true });
    }
  });
  await page.waitForFunction(
    () =>
      globalThis.fullAutoProbe.sources.filter((record) => record.event === 'gunshot' && record.starts.length > 0)
        .length === 32,
  );
  await page.evaluate(() => {
    globalThis.fullAutoProbe.shots = [];
    globalThis.fullAutoProbe.released = false;
  });
  await page.mouse.down();
  await page.waitForFunction(() => globalThis.fullAutoProbe.released);
  await page.mouse.up();
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() =>
    globalThis.fullAutoProbe.sources
      .filter((record) => record.event === 'gunshot')
      .every((record) => record.disconnected && record.gainDisconnected),
  );
  const native = await page.evaluate(() => ({
    shots: globalThis.fullAutoProbe.shots,
    peak: globalThis.fullAutoProbe.peak,
    records: globalThis.fullAutoProbe.sources
      .filter((record) => record.event === 'gunshot')
      .map(({ starts, stops, ramps, disconnected, gainDisconnected }) => ({
        starts,
        stops,
        ramps,
        disconnected,
        gainDisconnected,
      })),
  }));
  assert.equal(native.shots.length, 27);
  assert.equal(native.records.length, 32 + 27, 'native source starts equal warm-up plus accepted shots');
  assert.ok(native.records.every(({ starts }) => starts.length === 1));
  const burst = native.records.slice(32);
  const nativeSpan = burst.at(-1).starts[0] - burst[0].starts[0];
  assert.ok(
    nativeSpan >= 1.85 && nativeSpan <= 2.1,
    `native two-second burst span ${nativeSpan}s (1.95s attack span, <=150ms scheduling allowance)`,
  );
  assert.ok(native.peak <= 64, '32 full voices plus at most 32 fading tails');
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
    const { input } = globalThis.fullAutoRuntime;
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
      const { input } = globalThis.fullAutoRuntime;
      input.moveMenuCursor(x - input.cursorX, y - input.cursorY);
    },
    { x: sliderStartX, y: sliderY },
  );
  await page.mouse.down();
  await page.mouse.move(physicalStart.x + sliderEndX - sliderStartX, physicalStart.y, { steps: 8 });
  await page.mouse.up();
  const runtimeTuning = await page.evaluate(() => {
    const slider = document.querySelector('#firearms-skill-automaticFollowup-recoilKickScale');
    const { input, inventory, session } = globalThis.fullAutoRuntime;
    const gun = inventory.hands.right;
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
  assert.deepEqual(errors, []);
  process.stdout.write(
    `full-auto native WebAudio passed: 27 shots/2s at 800rpm, 27 cases, release stops, ${native.records.length} starts, ${nativeSpan.toFixed(3)}s native attack span, peak ${native.peak}, faded steals, all source/gain nodes released.\n`,
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  const state = await page?.evaluate(() => ({
    context: globalThis.fullAutoRuntime?.audio.context?.state,
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
