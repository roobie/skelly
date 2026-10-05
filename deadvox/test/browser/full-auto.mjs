// biome-ignore-all lint/correctness/noNodejsModules: standalone native WebAudio/browser contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner selects the installed Chromium
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
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
            `  Object.assign(globalThis, { fullAutoRuntime: { input, inventory, session, audio, caseEffects, view } });\n${marker}`,
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
    const probe = { shots: [], sources: [], peak: 0, released: false };
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
      `http://127.0.0.1:${address.port}/?seed=73&debug=1&radius=64&time=12:00&cam=43.50,33.00,0.00,-90.0,-20.0,0.0&post=0&sunshadow=0&torchshadow=0`,
    ),
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
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
  await page.evaluate(() => {
    globalThis.fullAutoProbe.f1DefaultPrevented = false;
    globalThis.addEventListener('keydown', (event) => {
      if (event.code === 'F1') {
        globalThis.fullAutoProbe.f1DefaultPrevented = event.defaultPrevented;
      }
    });
  });
  await page.keyboard.press('F1');
  assert.equal(
    await page.evaluate(() => globalThis.fullAutoProbe.f1DefaultPrevented),
    true,
    'the attached debug handler prevents the browser default for F1',
  );
  await page.evaluate(() => {
    const { impactEffects } = globalThis.fullAutoRuntime.view;
    const fire = impactEffects.fire.bind(impactEffects);
    globalThis.fullAutoProbe.trajectories = 0;
    impactEffects.fire = (trajectory, debugLaser) => {
      globalThis.fullAutoProbe.trajectories += trajectory.directions.length;
      fire(trajectory, debugLaser);
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
    for (const side of ['left', 'right']) {
      const held = inventory.hands[side];
      if (held && !inventory.consume(held, held.count)) {
        throw new Error(`Could not clear ${side} fixture hand`);
      }
    }
    const rifle = inventory.create('debug_rifle_assault');
    if (!inventory.add(rifle, { kind: 'hand', side: 'right' })) {
      throw new Error('Could not place fixture rifle in hand');
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
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.waitForFunction(() => globalThis.fullAutoProbe.released);
  await page.mouse.up();
  const impactPresentation = await page.evaluate(() => ({
    marks: globalThis.fullAutoRuntime.view.impactEffects.activeMarks,
    laserSegments: globalThis.fullAutoRuntime.view.impactEffects.laser.geometry.drawRange.count,
    laserVisible: globalThis.fullAutoRuntime.view.impactEffects.laser.visible,
  }));
  assert.ok(impactPresentation.marks > 0, 'committed rounds that meet world geometry create impact marks');
  assert.ok(
    impactPresentation.laserSegments > 0 && impactPresentation.laserVisible,
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
    'each committed virtual rifle round reaches the shared world-impact presentation',
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
