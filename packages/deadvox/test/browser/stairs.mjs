// biome-ignore-all lint/correctness/noNodejsModules: standalone maintained browser test starts Vite and Chrome.
// biome-ignore-all lint/style/noProcessEnv: test executable and evidence destination are runner configuration.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser contract assertions.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
/** @import { Vec3 } from '@skelly/engine/world' */

import { launchChromium } from './chromium.mjs';
import { gameUrl, inlineStartMod, stageLookBaseline } from './gameUrl.mjs';
import { holdAction, pressAction } from './input-actions.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { skySelectionProof } from './sky-selection.mjs';
import { initializeSkyTiming, skyTimingPlugin, summarizeSkyTiming } from './sky-timing.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';
import { addCamoWitnessTemplate, CAMO_WITNESS, injectSiteFixture, RAISED_CABIN } from './stairs-fixture.mjs';
import { waitForWorldLoaded } from './world-loading.mjs';

const [, , mode] = process.argv;
assert.ok(
  mode === 'traversal' ||
    mode === 'lighting-cellar' ||
    mode === 'lighting-residents' ||
    mode === 'lighting-outdoor' ||
    mode === 'lighting-atlas' ||
    mode === 'camo',
  'choose traversal, lighting-cellar, lighting-residents, lighting-outdoor, lighting-atlas or camo',
);
const isLightingMode =
  mode === 'lighting-cellar' ||
  mode === 'lighting-residents' ||
  mode === 'lighting-outdoor' ||
  mode === 'lighting-atlas';
const root = fileURLToPath(new URL('../..', import.meta.url));
const noonStart = {
  density: null,
  id: 'stairs_noon_start',
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
  site: 'stair_demo',
  skills: {},
  startTimeGameTimeOfDay: '12:00',
  storeys: 1,
  wounds: [],
};
const artifacts = resolve(process.env.STAIRS_ARTIFACT_DIR ?? 'test-results/stairs');
const lightingScale = mode === 'lighting-cellar' ? 0.5 : 1;
const pixelCrop = {
  x: 480 * lightingScale,
  y: 260 * lightingScale,
  width: 240 * lightingScale,
  height: 240 * lightingScale,
};
let failedPhase;
const timePhase = async (phase, action) => {
  process.stdout.write(`STAIRS_PHASE ${JSON.stringify({ phase })}\n`);
  const start = performance.now();
  try {
    return await action();
  } catch (error) {
    failedPhase ??= phase;
    throw error;
  } finally {
    process.stdout.write(
      `STAIRS_TIMING ${JSON.stringify({ phase, milliseconds: Math.round(performance.now() - start) })}\n`,
    );
  }
};
const timeIfLighting = (phase, action) => (isLightingMode ? timePhase(phase, action) : action());
const postFrameProgress = () => {
  const observed = globalThis.postFrameObserved;
  if (!observed || observed.setPostRealMs === null) {
    return null;
  }
  return {
    mode: 'lighting-residents',
    post: observed.post,
    observedFrames: observed.frames.length,
    engineRenderFrame: globalThis.d7Review.engine.renderer.info.render.frame,
    engineRenderFrameAtSetPost: observed.renderFrameAtSetPost,
    renderEntries: observed.renderEntries,
    renderExits: observed.renderExits,
    sinceSetPostRealMs: Math.round(performance.now() - observed.setPostRealMs),
  };
};
const hasSkyControl = isLightingMode || mode === 'camo';
const arrivalObservation =
  mode === 'camo'
    ? `
const arrival = globalThis.stairsWitness.camoArrival = {firstMeshRealMs:null,readyRealMs:null,renderedFrames:0,pendingFrames:0};
const beforeRender = engine.scene.onBeforeRender;
engine.scene.onBeforeRender = function(...args) {
  beforeRender.apply(this,args);
  if(args[2] !== engine.camera) return;
  const s = engine.config.scale.blockSize;
  if(Math.hypot(engine.camera.position.x/s-155,engine.camera.position.z/s-122)>1) return;
  if(!engine.meshes.origins().some(([x,y,z])=>x===128&&y===32&&z===96)) return;
  const point=[151.5,43.5,121.5];
  const fields=engine.skylight.inspect().filter(({bounds})=>point.every((v,a)=>v>=bounds.min[a]&&v<bounds.max[a]));
  if(!fields.length) throw new Error('Camo arrival witness has no eligible field');
  arrival.renderedFrames++;
  arrival.firstMeshRealMs ??= performance.now();
  if(fields.every(field=>field.current)) arrival.readyRealMs ??= performance.now();
  else arrival.pendingFrames++;
};
`
    : '';
await mkdir(artifacts, { recursive: true });
const vite = await createStageServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    skyTimingPlugin(),
    {
      name: 'stairs-test-observation',
      enforce: 'pre',
      transform(code, id) {
        if (mode === 'camo' && id.endsWith('/mods/skelly.deadvox.scenario.stairs/templates-stairs.json')) {
          return addCamoWitnessTemplate(code);
        }
        if (mode === 'camo' && id.endsWith('/mods/skelly.manufactured-blocks/manufactured-blocks.json')) {
          const content = JSON.parse(code);
          const camo = content.blocks.find(({ pattern }) => pattern === 'camo');
          assert.ok(camo);
          camo.color = '#b8b5a3';
          camo.patternPalette = ['#b8b5a3', '#b8b5a3', '#b8b5a3', '#b8b5a3'];
          camo.patternWashout = 1;
          return JSON.stringify(content);
        }
        if (mode !== 'traversal' && id.endsWith('/engine/src/core/authoredSite.ts')) {
          let transformed = injectSiteFixture(code, isLightingMode ? RAISED_CABIN : CAMO_WITNESS);
          if (isLightingMode) {
            const lot = 'lotOf(building, rect)';
            assert.equal(code.split(lot).length, 2);
            transformed = transformed.replace(
              lot,
              '{...lotOf(building, rect), ...(building === siteFixture ? {floor: layout.ground} : {})}',
            );
          }
          return transformed;
        }
        if (hasSkyControl && id.endsWith('/src/render/skylight.ts')) {
          // Test-only reference: identical scene with diffuse sky visibility forced to one.
          assert.ok(code.includes('shader.uniforms.uSkyVolume = this.texture;'));
          assert.ok(code.includes('vec2 skyVisibility(out bool unbuilt) {'));
          return code
            .replace(
              'shader.uniforms.uSkyVolume = this.texture;',
              'shader.uniforms.uSkyVolume = this.texture;\nshader.uniforms.uSkyProofControl = (globalThis.skyProofControl ??= {value:0});',
            )
            .replace(
              'vec2 skyVisibility(out bool unbuilt) {',
              'uniform float uSkyProofControl;\nvec2 skyVisibility(out bool unbuilt) {\n  if (uSkyProofControl > 0.5) { unbuilt = false; return vec2(1.0); }',
            );
        }
        if (!id.endsWith('/src/presentation/play.ts')) {
          return;
        }
        const marker = 'startRealFrames(frame);';
        assert.ok(code.includes(marker));
        return `import { doorPanel as stairsDoorPanel } from '@skelly/engine/internal/core/blockEntities.ts';\n${code.replace(
          marker,
          `Object.assign(globalThis,{stairsWitness:{engine,session,input,body,entities,queue,doorPanel:stairsDoorPanel,performHandUse:router.performHandUse,getNotice:()=>notice,get noclip(){return debugTools?.noclip??false;}},d7Review:{input,session,held:view.held,engine,camera,debugTools,inventory}});\n${arrivalObservation}\n${marker}`,
        )}`;
      },
    },
  ],
});
let browser;
let page;
const errors = [];
try {
  await timeIfLighting('vite-listen', () => vite.listen());
  const port = listeningPort(vite);
  const stageName = {
    traversal: 'stairs-traversal',
    camo: 'stairs-camo',
    'lighting-cellar': 'stairs-lighting-cellar',
    'lighting-residents': 'stairs-lighting-residents',
    'lighting-outdoor': 'stairs-lighting-outdoor',
    'lighting-atlas': 'stairs-lighting-atlas',
  }[mode];
  browser = await timeIfLighting('browser-launch', () =>
    launchChromium(stageName, {
      headless: process.env.BROWSER_HEADED !== '1',
    }),
  );
  // A clip does not reduce WebGL frame cost; the brightness witness keeps the same normalized crop.
  const viewport = isLightingMode
    ? { width: 1280 * lightingScale, height: 800 * lightingScale }
    : { width: 640, height: 400 };
  page = await browser.newPage({ viewport });
  const states = [];
  const helpDialogs = [];
  page.on('dialog', async (dialog) => {
    helpDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.addInitScript(initializeSkyTiming);
  if (mode === 'camo') {
    await page.addInitScript(() => {
      globalThis.camoPointerRequests = [];
      globalThis.camoPointerEvents = [];
      for (const type of /** @type {const} */ (['pointerlockchange', 'pointerlockerror'])) {
        document.addEventListener(type, () => {
          globalThis.camoPointerEvents.push({ type, locked: Boolean(document.pointerLockElement) });
        });
      }
      const exit = document.exitPointerLock;
      document.exitPointerLock = function () {
        globalThis.camoPointerEvents.push({ type: 'exit', stack: new Error('Pointer lock explicitly released').stack });
        return exit.call(this);
      };
      const request = Element.prototype.requestPointerLock;
      Element.prototype.requestPointerLock = function (...args) {
        globalThis.camoPointerRequests.push({
          active: navigator.userActivation.isActive,
          playMounted: Boolean(globalThis.stairsWitness),
        });
        return request.apply(this, args);
      };
    });
  }
  await page.addInitScript(() => {
    globalThis.nativeGateEvents = [];
    for (const type of /** @type {const} */ (['keydown', 'keyup'])) {
      document.addEventListener(type, (event) => {
        globalThis.nativeGateEvents.push({
          type,
          code: event.code,
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
          repeat: event.repeat,
          locked: Boolean(document.pointerLockElement),
        });
      });
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  const stageId = stageName;
  let selectionEvidence;
  await timeIfLighting('game-boot', async () => {
    await page.goto(
      browserStageUrl(
        stageId,
        gameUrl(`http://127.0.0.1:${port}`, {
          startMod: inlineStartMod('fixture.stairs.noon', noonStart),
          harness: mode === 'camo' ? { skyRoute: 1 } : {},
          hash: { ...stageLookBaseline, debug: true, seed: 1, radius: 32 },
        }),
      ),
    );
    await page.waitForFunction(
      () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
      undefined,
      { timeout: 60_000 },
    );
    if (mode === 'lighting-cellar') {
      const undergroundSun = await timePhase('buried-sun-receiver-rule', () =>
        page.evaluate(async (path) => (await import(path)).undergroundSunProof(), '/test/browser/underground-sun.ts'),
      );
      process.stdout.write(`UNDERGROUND_SUN ${JSON.stringify(undergroundSun)}\n`);
      await timePhase('far-sun-receiver-rule', () =>
        page.evaluate(async (path) => (await import(path)).farSunProof(), '/test/farSun.ts'),
      );
      const beamDaylight = await timePhase('closed-roof-beam-daylight', () =>
        page.evaluate(async (path) => (await import(path)).beamDaylightProof(), '/test/browser/beam-daylight.ts'),
      );
      process.stdout.write(`BEAM_DAYLIGHT ${JSON.stringify(beamDaylight)}\n`);
      const markerLighting = await page.evaluate(async () => {
        // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this browser-origin URL.
        const { interactionMarkerLightingProof } = await import('/test/browser/interaction-marker-lighting.ts');
        return interactionMarkerLightingProof();
      });
      process.stdout.write(`MARKER_LIGHTING ${JSON.stringify(markerLighting)}\n`);
      assert.equal(markerLighting.dark.marker, markerLighting.dark.surface, 'no self-lit outline in full darkness');
      assert.ok(markerLighting.night.surface > markerLighting.dark.surface, 'night surface sample is nonempty');
      assert.ok(
        markerLighting.night.marker <= markerLighting.night.surface * 2,
        'night outline stays near its surface light',
      );
      for (const lit of [markerLighting.lampLit, markerLighting.flashlightLit]) {
        assert.ok(lit.changed > 0, 'lit outline contributes visible pixels');
        assert.ok(lit.marker > markerLighting.night.marker, 'lamp and flashlight illuminate the outline');
        assert.ok(lit.surface > markerLighting.night.surface, 'the light also illuminates the surface');
      }
      const flare = await timePhase('night-vision-flare-pixels', () =>
        page.evaluate(
          async (path) => (await import(path)).nightVisionFlareProof(),
          '/test/browser/night-vision-flare.ts',
        ),
      );
      process.stdout.write(`NIGHT_VISION_FLARE ${JSON.stringify(flare)}\n`);
      assert.ok(flare.flared.brightness > flare.plain.brightness, 'the flare brightens the goggles view');
      assert.ok(flare.flared.spread < flare.plain.spread, 'the flare pales the tint towards white');
      assert.ok(flare.halo > flare.corner, "a halo brightens its light's place more than the crop's far corner");
    }
    if (mode === 'lighting-outdoor') {
      await timePhase('mood-output-display-order', () =>
        page.evaluate(async (path) => (await import(path)).moodOutputProof(), '/test/browser/mood-output.ts'),
      );
      await timePhase('surface-pattern-numeric-safety', () =>
        page.evaluate(
          async (path) => (await import(path)).surfacePatternMathProof(),
          '/test/browser/surface-pattern-math.ts',
        ),
      );
      // The owned GL proof must not contend with an unrelated full-size game render loop.
      selectionEvidence = await timePhase('owned-sky-selection', () => skySelectionProof(page));
    }
    await page.locator('#go').click();
    await page.waitForFunction(() => globalThis.stairsWitness, undefined, { timeout: 60_000 });
  });
  if (mode === 'camo') {
    const requests = await page.evaluate(() => globalThis.camoPointerRequests);
    assert.deepEqual(requests, [{ active: true, playMounted: false }], 'capture the gesture before world construction');
    await timePhase('camo-world-ready', () => waitForWorldLoaded(page));
    // Readiness belongs to the page, not an animation-frame poll delayed by software GL work.
    // The enclosing stage deadline still bounds a missing signal.
    await timePhase('camo-pointer-lock', () =>
      page.evaluate(
        () =>
          new Promise((/** @type {(value: void) => void} */ done, reject) => {
            const cleanup = () => {
              document.removeEventListener('pointerlockchange', check);
              document.removeEventListener('pointerlockerror', fail);
            };
            function check() {
              if (document.pointerLockElement) {
                cleanup();
                done();
              }
            }
            function fail() {
              cleanup();
              reject(new Error('Camo pointer lock request failed'));
            }
            document.addEventListener('pointerlockchange', check);
            document.addEventListener('pointerlockerror', fail);
            check();
          }),
      ),
    );
    const diagnostic = await timePhase('camo-sky-route-evidence', () =>
      page.evaluate(
        () =>
          new Promise((/** @type {(value: string) => void} */ done) => {
            const routeRoot = document.getElementById('sky-route-root');
            if (!routeRoot) {
              throw new Error('No #sky-route-root is on the page');
            }
            const observer = new MutationObserver(check);
            function check() {
              const panel = document.querySelector('[data-sky-route]');
              if (panel instanceof HTMLElement && panel.dataset.state === 'complete') {
                const evidence = panel.querySelector('textarea');
                if (!evidence) {
                  throw new Error('The sky route panel has no evidence textarea');
                }
                observer.disconnect();
                done(evidence.value);
              }
            }
            observer.observe(routeRoot, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ['data-state'],
            });
            check();
          }),
      ),
    );
    assert.equal(JSON.parse(diagnostic).geometry, null, 'a rejected route must not probe an unrelated scene');
    assert.equal(
      JSON.parse(diagnostic).status,
      'wrong-start',
      'the hardware route rejects fixture geometry rather than reporting a valid camp run',
    );
    assert.equal(
      JSON.parse(diagnostic).cold.lightingP99RealMs,
      null,
      'a rejected empty route cannot report zero-cost timing success',
    );
    await page.evaluate(() => {
      const panel = document.querySelector('[data-sky-route]');
      if (!panel) {
        throw new Error('No sky route panel is on the page');
      }
      panel.remove();
    });
  }
  if (mode === 'traversal') {
    await timePhase('world-ready', () => waitForWorldLoaded(page));
    await page.waitForFunction(() => Boolean(document.pointerLockElement));
    const verifyGate = async (locked) => {
      const before = await page.evaluate(() => globalThis.stairsWitness.session.sim.godMode);
      const gate = await page.evaluate(
        `import('/src/product/input.ts').then(({ inputBindings }) => inputBindings.chords('debug.gate')[0])`,
      );
      await page.evaluate(() => {
        globalThis.nativeGateEvents.length = 0;
      });
      await pressAction(page, 'debug.god-toggle', { includeGate: false });
      assert.equal(
        await page.evaluate(() => globalThis.stairsWitness.session.sim.godMode),
        before,
        'plain debug key cannot author',
      );
      await pressAction(page, 'debug.god-toggle');
      assert.equal(
        await page.evaluate(() => globalThis.stairsWitness.session.sim.godMode),
        !before,
        'held gate toggles the public owner exactly once',
      );
      await pressAction(page, 'debug.god-toggle', { includeGate: false });
      assert.equal(
        await page.evaluate(() => globalThis.stairsWitness.session.sim.godMode),
        !before,
        'release cannot latch the gate',
      );
      const delivered = await page.evaluate(() => globalThis.nativeGateEvents);
      const gateEvents = delivered.filter((event) => event.code === gate.code);
      assert.equal(gateEvents.length, 2);
      assert.ok(gateEvents.every((event) => event.trusted && event.locked === locked));
      assert.ok(gateEvents.some((event) => event.type === 'keydown' && event.prevented));
      assert.ok(gateEvents.some((event) => event.type === 'keyup'));
      assert.equal(await page.evaluate(() => document.hasFocus()), true);
      assert.equal(page.context().pages().length, 1, 'no Help tab or window');
      assert.deepEqual(helpDialogs, [], 'no Help dialog');
      states.push({
        label: `native debug gate ${locked ? 'locked' : 'unlocked'}`,
        before,
        after: !before,
        delivered,
        headed: process.env.BROWSER_HEADED === '1',
        backend: process.env.BROWSER_KEY_BACKEND ?? 'Playwright',
      });
      await writeFile(resolve(artifacts, 'gate-input.json'), JSON.stringify(states, null, 2));
    };
    await verifyGate(true);
    await page.evaluate(() => globalThis.stairsWitness.input.unlock());
    await page.waitForFunction(() => !document.pointerLockElement);
    await verifyGate(false);
    await page.locator('#go').click();
    await page.waitForFunction(() => Boolean(document.pointerLockElement));
    if (!(await page.evaluate(() => globalThis.stairsWitness.session.sim.godMode))) {
      await pressAction(page, 'debug.god-toggle');
    }
    assert.equal(await page.evaluate(() => globalThis.stairsWitness.session.sim.godMode), true);
  }
  if (isLightingMode) {
    // Play drops action input until the world is ready, so a scenario press sent during loading is lost.
    await timePhase('world-ready', () => waitForWorldLoaded(page));
  }
  await timeIfLighting('initial-mesh-ready', () =>
    page.waitForFunction(
      (lighting) =>
        [[96, 32, 96], [128, 32, 96], ...(lighting ? [[160, 32, 96]] : [])].every(([x, y, z]) =>
          globalThis.stairsWitness.engine.meshes
            .origins()
            .some(([chunkX, chunkY, chunkZ]) => chunkX === x && chunkY === y && chunkZ === z),
        ),
      isLightingMode,
      { timeout: 60_000 },
    ),
  );
  if (isLightingMode) {
    const shaderErrors = errors.filter((error) => error.includes('THREE.WebGLProgram: Shader Error'));
    assert.deepEqual(shaderErrors, [], 'chunk shaders compile before the lighting pixel checks');
    if (mode === 'lighting-residents') {
      await page.evaluate(() => {
        const runtime = globalThis.d7Review;
        globalThis.postFrameObserved = {
          frames: [],
          outsideMood: 0,
          initialPost: runtime.engine.mood.post,
          post: null,
          setPostRealMs: null,
          renderFrameAtSetPost: null,
          renderEntries: 0,
          renderExits: 0,
        };
        const renderMood = runtime.engine.mood.render.bind(runtime.engine.mood);
        const renderHands = runtime.held.render.bind(runtime.held);
        const render = runtime.engine.renderer.render.bind(runtime.engine.renderer);
        let active;
        runtime.engine.mood.render = (callback) => {
          globalThis.postFrameObserved.renderEntries += 1;
          active = { post: runtime.engine.mood.post, hands: 0, targets: [], sequence: [] };
          try {
            return renderMood(callback);
          } finally {
            globalThis.postFrameObserved.frames.push(active);
            globalThis.postFrameObserved.frames = globalThis.postFrameObserved.frames.slice(-12);
            active = undefined;
            globalThis.postFrameObserved.renderExits += 1;
          }
        };
        runtime.held.render = (...args) => {
          if (active) {
            active.hands += 1;
          } else {
            globalThis.postFrameObserved.outsideMood += 1;
          }
          return renderHands(...args);
        };
        runtime.engine.renderer.render = (scene, camera) => {
          if (active) {
            let sceneKind = 'post';
            if (scene === runtime.held.scene) {
              sceneKind = 'hands';
            } else if (scene === runtime.engine.scene) {
              sceneKind = 'world';
            }
            active.sequence.push(sceneKind);
            if (scene === runtime.held.scene) {
              active.targets.push(Boolean(runtime.engine.renderer.getRenderTarget()));
            }
          }
          return render(scene, camera);
        };
      });
      for (const post of [true, false]) {
        // biome-ignore lint/performance/noAwaitInLoops: Post modes need ordered measurements from the same renderer.
        await page.evaluate((enabled) => {
          const observed = globalThis.postFrameObserved;
          observed.frames = [];
          observed.post = enabled;
          observed.renderEntries = 0;
          observed.renderExits = 0;
          observed.renderFrameAtSetPost = globalThis.d7Review.engine.renderer.info.render.frame;
          observed.setPostRealMs = performance.now();
          globalThis.d7Review.engine.mood.setPost(enabled);
        }, post);
        await page.waitForFunction(() => globalThis.postFrameObserved.frames.length >= 3);
        process.stdout.write(`STAIRS_POST_FRAMES ${JSON.stringify(await page.evaluate(postFrameProgress))}\n`);
        const proof = await page.evaluate(() => ({
          frames: globalThis.postFrameObserved.frames.slice(-3),
          outsideMood: globalThis.postFrameObserved.outsideMood,
        }));
        await test(`Post=${post}: one held draw inside Mood with the correct render target`, () => {
          assert.equal(proof.outsideMood, 0);
          for (const frame of proof.frames) {
            assert.equal(frame.post, post);
            assert.equal(frame.hands, 1);
            assert.deepEqual(frame.targets, [post]);
            assert.equal(frame.sequence[0], 'world');
            assert.equal(frame.sequence[1], 'hands');
          }
        });
      }
      await page.evaluate(() => globalThis.d7Review.engine.mood.setPost(globalThis.postFrameObserved.initialPost));
    }
  }
  // The contrast witnesses measure only the world, never the debug hover label or HUD.
  await page.addStyleTag({ content: 'body > :not(#view) { visibility: hidden !important; }' });
  const stage = async (fixturePosition, fixtureYaw = -Math.PI / 2, fixturePitch = 0, { captureFrame = false } = {}) => {
    // Fixtures are positioned only BEFORE each independent scenario, never across a flight during traversal.
    const stagedFrame = await page.evaluate(
      (
        /** @type {{ position: Vec3; yaw: number; pitch: number; captureFrame: boolean }} */ {
          position,
          yaw,
          pitch,
          captureFrame: shouldCaptureFrame,
        },
      ) => {
        const { engine, session, input, noclip } = globalThis.stairsWitness;
        assertNoNoclip();
        function assertNoNoclip() {
          if (noclip) {
            throw new Error('noclip must be OFF');
          }
        }
        session.body.pos = [...position];
        session.body.vel = [0, 0, 0];
        session.body.onGround = true;
        input.controls.yaw = yaw;
        input.controls.pitch = pitch;
        return shouldCaptureFrame ? engine.renderer.info.render.frame : null;
      },
      { position: fixturePosition, yaw: fixtureYaw, pitch: fixturePitch, captureFrame },
    );
    if (mode === 'traversal') {
      const settleFrom = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
      await waitForSimulation(
        page,
        (from) => {
          const { body, session } = globalThis.stairsWitness;
          const elapsed = session.sim.time - from;
          const velocity = Math.hypot(...body.vel);
          const grounded = body.onGround;
          const atRest = velocity < 0.1;
          return {
            time: session.sim.time,
            paused: session.sim.paused,
            reached: elapsed > 0 && grounded && atRest,
            elapsed,
            grounded,
            atRest,
            velocity,
          };
        },
        settleFrom,
        { seconds: 1, from: settleFrom, label: 'fixture placement grounded at rest', record: state },
      );
    }
    return stagedFrame;
  };
  const state = async (label, details) => {
    const value = await page.evaluate(() => {
      const { body, noclip, engine, session, input } = globalThis.stairsWitness;
      return {
        position: [...body.pos],
        velocity: [...body.vel],
        onGround: body.onGround,
        simulationTime: session.sim.time,
        paused: session.sim.paused,
        noclip,
        locked: input.locked,
        contentErrors: engine.contentErrors,
        zombies: [...session.actorStore.entries()].map(([id, z]) => ({
          id,
          pos: [...z.body.pos],
          mode: z.agent?.mode,
          lastPerceived: z.agent?.lastPerceived,
        })),
      };
    });
    states.push({ label, ...value, ...(details ? { details } : {}) });
    await writeFile(resolve(artifacts, 'states.json'), JSON.stringify(states, null, 2));
    assert.equal(value.noclip, false);
    assert.equal(value.locked, true);
    assert.equal(value.contentErrors, '');
    return value;
  };
  const shot = (label, crop = false) =>
    page.screenshot({
      path: resolve(artifacts, `${label}.png`),
      ...(crop ? { clip: pixelCrop } : {}),
    });
  const luminance = async (png, cropHeight) =>
    page.evaluate(
      async ({ data, cropHeight: sampleHeight }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = sampleHeight ?? image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('The luminance canvas has no 2D context');
        }
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          sum += (pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0);
        }
        return sum / ((pixels.length / 4) * 3);
      },
      { data: png.toString('base64'), cropHeight },
    );
  const waitForSkyFields = async (points) => {
    try {
      await page.waitForFunction((samples) => {
        const { engine } = globalThis.stairsWitness;
        if (!engine.skylight) {
          return false;
        }
        const blocks = samples.map((point) => point.map((value) => value / engine.config.scale.blockSize));
        const fields = engine.skylight.inspect().filter(({ bounds }) =>
          blocks.some((point) =>
            point.every((value, axis) => {
              const min = bounds.min[axis];
              const max = bounds.max[axis];
              return min !== undefined && max !== undefined && value >= min && value < max;
            }),
          ),
        );
        return fields.length > 0 && fields.every((field) => field.current);
      }, points);
    } catch (error) {
      const evidence = await page.evaluate(() => ({
        camera: globalThis.stairsWitness.engine.camera.position.toArray(),
        fields: globalThis.stairsWitness.engine.skylight?.inspect().map(({ volume, ...field }) => field),
        stats: globalThis.stairsWitness.engine.skylight?.stats,
        timing: { events: globalThis.skyTiming.events, jobs: globalThis.skyTiming.jobs },
      }));
      evidence.timing = summarizeSkyTiming(evidence.timing);
      await writeFile(resolve(artifacts, `field-wait-${mode}.json`), JSON.stringify({ points, ...evidence }, null, 2));
      process.stdout.write(`SKY_FIELD_WAIT_FAILURE ${JSON.stringify({ points, ...evidence })}\n`);
      throw error;
    }
  };
  const camoWallPixels = async (png) =>
    page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('The camo pixel canvas has no 2D context');
      }
      context.drawImage(image, 0, 0);
      const { engine } = globalThis.stairsWitness;
      const {
        camera,
        config: {
          scale: { blockSize },
        },
      } = engine;
      camera.updateMatrixWorld(true);
      const project = ([x, y, z]) => {
        const point = [x * blockSize, y * blockSize, z * blockSize, 1];
        /** @returns {[number, number, number, number]} */
        const multiply = (m, v) => [
          m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
          m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
          m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
          m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
        ];
        const { elements: projection } = camera.projectionMatrix;
        const { elements: worldToCamera } = camera.matrixWorldInverse;
        const clip = multiply(projection, multiply(worldToCamera, point));
        return {
          x: ((clip[0] / clip[3]) * 0.5 + 0.5) * canvas.width,
          y: (0.5 - (clip[1] / clip[3]) * 0.5) * canvas.height,
        };
      };
      const sampleLuminance = (point) => {
        const { x, y } = project(point);
        if (x < 2 || y < 2 || x >= canvas.width - 2 || y >= canvas.height - 2) {
          throw new Error(`camo AO sample is outside the screenshot: ${x},${y}`);
        }
        const pixels = context.getImageData(Math.round(x) - 1, Math.round(y) - 1, 3, 3).data;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          sum += (pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0);
        }
        return { x, y, luminance: sum / ((pixels.length / 4) * 3) };
      };
      return {
        corner: sampleLuminance([151, 43.1, 121.1]),
        middle: sampleLuminance([151, 43.5, 121.5]),
      };
    }, png.toString('base64'));
  const waitForRenderedFrame = async () => {
    const before = await page.evaluate(() => globalThis.stairsWitness.engine.renderer.info.render.frame);
    await page.waitForFunction((frame) => globalThis.stairsWitness.engine.renderer.info.render.frame > frame, before);
  };
  const lightingCellarProofs = async () => {
    await stage([134, 35.0001, 115]);
    await timePhase('cellar-placement-render', waitForRenderedFrame);
    const captureFrame = await page.evaluate(() => {
      const { engine } = globalThis.stairsWitness;
      const gl = engine.renderer.getContext();
      return {
        viewport: [innerWidth, innerHeight],
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        camera: engine.camera.position.toArray(),
        renderedFrame: engine.renderer.info.render.frame,
      };
    });
    process.stdout.write(`CELLAR_CAPTURE_FRAME ${JSON.stringify({ ...captureFrame, crop: pixelCrop })}\n`);
    await waitForSkyFields([[81.5, 28, 59]]);
    const raisedOutdoor = await page.evaluate(() => globalThis.stairsWitness.engine.skylight?.at([81.5, 28, 59]));
    assert.equal(raisedOutdoor, 1);
    const lightProof = await timePhase('cellar-dark-beam-pixels', async () => {
      const dark = await timePhase('cellar-dark-capture', () => shot('cellar-dark', true));
      await page.evaluate(() => {
        const { session } = globalThis.stairsWitness;
        for (const side of ['left', 'right']) {
          const held = session.inventory.hands[side];
          if (held && !session.inventory.consume(held, held.count)) {
            throw new Error(`Could not clear ${side} fixture hand`);
          }
        }
        const flashlight = session.inventory.create('flashlight');
        if (!session.inventory.add(flashlight, { kind: 'hand', side: 'left' })) {
          throw new Error('Could not place fixture flashlight in hand');
        }
      });
      // A tap: the flashlight has a choice of actions, so its use runs on release.
      const mouse5 = () =>
        page.evaluate(() => {
          const canvas = document.querySelector('#view canvas');
          if (!canvas) {
            throw new Error('No #view canvas is on the page');
          }
          canvas.dispatchEvent(
            new PointerEvent('pointerdown', { button: 4, buttons: 16, pointerType: 'mouse', bubbles: true }),
          );
          canvas.dispatchEvent(
            new PointerEvent('pointerup', { button: 4, buttons: 0, pointerType: 'mouse', bubbles: true }),
          );
        });
      await mouse5();
      await page.waitForFunction(() => {
        const { session, engine } = globalThis.stairsWitness;
        return (
          session.inventory.hands.left?.on &&
          engine.scene.children.some(
            (light) =>
              'isSpotLight' in light &&
              light.isSpotLight === true &&
              'intensity' in light &&
              typeof light.intensity === 'number' &&
              light.intensity > 0,
          )
        );
      });
      await waitForRenderedFrame();
      assert.equal(await page.evaluate(() => globalThis.stairsWitness.session.inventory.hands.left?.on), true);
      const lit = await timePhase('cellar-hand-capture', () => shot('cellar-beam', true));
      await page.evaluate(() => {
        const { session } = globalThis.stairsWitness;
        const previous = session.inventory.worn.head;
        if (previous && !session.inventory.consume(previous, previous.count)) {
          throw new Error('Could not clear fixture head slot');
        }
        const headlamp = session.inventory.create('headlamp');
        if (!session.inventory.add(headlamp, { kind: 'worn' })) {
          throw new Error('Could not wear fixture headlamp');
        }
        const reason = session.survival.toggleWornLights();
        if (reason) {
          throw new Error(reason);
        }
      });
      await page.waitForFunction(
        () =>
          globalThis.stairsWitness.engine.scene.children.filter(
            (light) =>
              'isSpotLight' in light &&
              light.isSpotLight === true &&
              'intensity' in light &&
              typeof light.intensity === 'number' &&
              light.intensity > 0,
          ).length === 2,
      );
      await waitForRenderedFrame();
      const both = await timePhase('cellar-combined-capture', () => shot('cellar-both-beams', true));
      await page.evaluate(() => {
        const { session } = globalThis.stairsWitness;
        const flashlight = session.inventory.hands.left;
        if (!flashlight) {
          throw new Error('The fixture flashlight left the hand');
        }
        const reason = session.survival.use(flashlight);
        if (reason) {
          throw new Error(reason);
        }
      });
      await page.waitForFunction(
        () =>
          globalThis.stairsWitness.engine.scene.children.filter(
            (light) =>
              'isSpotLight' in light &&
              light.isSpotLight === true &&
              'intensity' in light &&
              typeof light.intensity === 'number' &&
              light.intensity > 0,
          ).length === 1,
      );
      await waitForRenderedFrame();
      const worn = await timePhase('cellar-worn-capture', () => shot('cellar-worn-beam', true));
      const proof = {
        dark: await luminance(dark),
        beam: await luminance(lit),
        worn: await luminance(worn),
        both: await luminance(both),
      };
      assert.ok(proof.dark < 15, JSON.stringify(proof));
      assert.ok(proof.beam > proof.dark + 10, JSON.stringify(proof));
      assert.ok(proof.both > Math.max(proof.beam, proof.worn), JSON.stringify(proof));
      return proof;
    });
    await test('Brightness sampling uses actual image dimensions and preserves top-row crops', async () => {
      const data = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The brightness fixture canvas has no 2D context');
        }
        context.fillStyle = 'rgb(90, 90, 90)';
        context.fillRect(0, 0, 2, 1);
        context.fillStyle = 'rgb(30, 30, 30)';
        context.fillRect(0, 1, 2, 1);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      const png = Buffer.from(data, 'base64');
      assert.equal(await luminance(png), 60);
      assert.equal(await luminance(png, 1), 90);
    });
    return { lightProof, raisedOutdoor };
  };
  const lightingResidentProofs = async () => {
    await stage([134, 35.0001, 115]);
    const residents = () =>
      page.evaluate(() => {
        const { skylight } = globalThis.stairsWitness.engine;
        if (!skylight) {
          throw new Error('The resident fixture has no sky fields');
        }
        return [skylight.at([67, 17.6, 57.5]), skylight.at([83, 23.6, 57.5])];
      });
    await timePhase('resident-field-readiness', () =>
      waitForSkyFields([
        [67, 17.6, 57.5],
        [83, 23.6, 57.5],
      ]),
    );
    const first = await timePhase('first-resident-samples', residents);
    assert.deepEqual(first, [0, 0]);
    await stage([166, 47.0001, 115]);
    const second = await timePhase('second-resident-samples', residents);
    assert.deepEqual(second, first);
    const secondDark = await luminance(await shot('second-cellar-dark', true));
    assert.ok(secondDark < 15, JSON.stringify({ secondDark }));
    return { residentProof: { first, second, secondDark } };
  };
  const lightingOutdoorProofs = async () => {
    const selection = selectionEvidence;
    assert.ok(selection, 'the owned shader proof completed before entering Play');
    assert.ok(selection.requested > 0 && selection.completed === selection.requested, 'owned worker jobs completed');
    assert.ok(selection.oracleCanopy > 0 && selection.oracleCanopy < 1, 'lateral diffuse paths exist under the canopy');
    const { room: unbuiltRoom } = selection.pending;
    assert.ok(
      unbuiltRoom.cpu > 0 && unbuiltRoom.cpu <= selection.unbuiltSkyCap,
      'a field with no result yet draws dimmed, at or below its cap',
    );
    assert.ok(Math.abs(unbuiltRoom.cpu - unbuiltRoom.shader) <= 1 / 255, 'CPU and shader draw the same fallback');
    for (const phase of [selection.ready, selection.evicted]) {
      assert.deepEqual(
        phase.room,
        { cpu: 0, shader: 0 },
        'sealed resident / known roofed nonresident room is not full sky',
      );
      assert.deepEqual(phase.canopy, { cpu: 1, shader: 1 }, 'noncandidate canopy keeps the old estimate');
    }
    assert.deepEqual(selection.pending.canopy, { cpu: 1, shader: 1 }, 'an unbuilt field does not dim noncandidates');
    assert.deepEqual(selection.ready.above, { cpu: 1, shader: 1 }, 'known air above a current roof is open');
    assert.deepEqual(selection.ready.overlap, selection.ready.room, 'overlapping fence and room select the same field');
    assert.ok(
      selection.canopyColumnHeight >= 0,
      'the known noncandidate canopy column is covered by the height texture',
    );
    assert.deepEqual(selection.roofFree, { cpu: 1, shader: 1 }, 'completed roof-free discovery is not stuck pending');
    assert.deepEqual(
      selection.editedPending,
      { cpu: 0, shader: 0 },
      'an edited resident room keeps its committed darkness',
    );
    assert.ok(
      selection.editedReady.cpu > 0 && selection.editedReady.shader > 0,
      'the accepted opening admits diffuse sky',
    );
    assert.ok(
      Math.abs(selection.editedReady.cpu - selection.editedReady.shader) <= 1 / 255,
      'the replacement agrees on CPU/shader',
    );
    const outdoorProof = await timePhase('outdoor-sky-equivalence', async () => {
      await stage([125, 43.0001, 118]);
      await waitForSkyFields([[62.5, 21.5, 59]]);
      await page.evaluate(() => {
        globalThis.stairsWitness.input.controls.pitch = -0.3;
      });
      await waitForRenderedFrame();
      const outdoor = await shot('outdoor-normal', true);
      await page.evaluate(() => {
        globalThis.skyProofControl.value = 1;
      });
      await waitForRenderedFrame();
      const outdoorReference = await shot('outdoor-sky-one', true);
      await page.evaluate(() => {
        globalThis.skyProofControl.value = 0;
      });
      const proof = { normal: await luminance(outdoor, 160), reference: await luminance(outdoorReference, 160) };
      assert.ok(Math.abs(proof.normal - proof.reference) < 1.5, JSON.stringify(proof));
      return proof;
    });
    return { outdoorProof, selection };
  };
  const lightingAtlasProofs = async () => {
    const secondSlotProof = await timePhase('atlas-slot-wall-equivalence', async () => {
      const frameAtStage = await stage([157, 43.0001, 118], undefined, undefined, { captureFrame: true });
      await waitForSkyFields([
        [65.75, 18.75, 59.25],
        [81.75, 24.75, 59.25],
      ]);
      const contrast = await page.evaluate(() => {
        const { skylight } = globalThis.stairsWitness.engine;
        if (!skylight) {
          throw new Error('The atlas fixture has no sky fields');
        }
        return [skylight.at([65.75, 18.75, 59.25]), skylight.at([81.75, 24.75, 59.25])];
      });
      assert.deepEqual(contrast, [0, 1], 'second-slot witness requires different same-local-cell values');
      await page.waitForFunction(
        (frame) => globalThis.stairsWitness.engine.renderer.info.render.frame > frame,
        frameAtStage,
      );
      const raisedCabinVisibility = await page.evaluate(() =>
        globalThis.stairsWitness.engine.skylight?.at([83, 23.6, 57.5]),
      );
      assert.equal(raisedCabinVisibility, 0, 'raised cabin field is resident at the atlas stage');
      await page.evaluate(() => {
        globalThis.stairsWitness.input.controls.pitch = Math.atan2(3.25, 7);
      });
      await waitForRenderedFrame();
      const secondWall = await shot('second-slot-wall-normal', true);
      await page.evaluate(() => {
        globalThis.skyProofControl.value = 1;
      });
      await waitForRenderedFrame();
      const secondWallReference = await shot('second-slot-wall-sky-one', true);
      await page.evaluate(() => {
        globalThis.skyProofControl.value = 0;
      });
      const proof = {
        contrast,
        normal: await luminance(secondWall, 160),
        reference: await luminance(secondWallReference, 160),
      };
      await writeFile(resolve(artifacts, 'second-slot.json'), JSON.stringify(proof, null, 2));
      assert.ok(Math.abs(proof.normal - proof.reference) < 1.5, JSON.stringify(proof));
      return proof;
    });
    return { secondSlotProof };
  };
  if (mode === 'camo') {
    await stage([155, 43.0001, 122], Math.PI / 2, -0.2);
    await waitForSkyFields([
      [75.75, 21.55, 60.55],
      [75.75, 21.75, 60.75],
    ]);
    const originalModes = await page.evaluate(() => {
      const { engine } = globalThis.stairsWitness;
      return { linear: engine.meshes.linearColorsOn, patterns: engine.meshes.patternsOn, film: engine.mood.film };
    });
    const setShaderLook = async (linear, patterns) => {
      const before = await page.evaluate(() => globalThis.stairsWitness.engine.renderer.info.render.frame);
      await page.evaluate(
        ({ linear: useLinearColors, patterns: usePatterns }) => {
          const { engine } = globalThis.stairsWitness;
          engine.meshes.setLinearColors(useLinearColors);
          engine.meshes.setPatterns(usePatterns);
        },
        { linear, patterns },
      );
      await page.waitForFunction((frame) => globalThis.stairsWitness.engine.renderer.info.render.frame > frame, before);
    };
    let camoAo;
    try {
      // Animated film grain makes independent lighting samples compare different noise realizations.
      await page.evaluate(() => globalThis.stairsWitness.engine.mood.setFilm(false));
      await setShaderLook(true, true);
      const captureState = () =>
        page.evaluate(() => {
          const { engine, session } = globalThis.stairsWitness;
          return {
            realMs: performance.now(),
            frame: engine.renderer.info.render.frame,
            camera: engine.camera.position.toArray(),
            body: [...session.body.pos],
            velocity: [...session.body.vel],
            calendar: session.sim.calendar,
            meshes: engine.meshes.count,
            film: engine.mood.film,
            grain: engine.mood.filmGrain?.strength,
            grainSeed: engine.mood.filmGrain?.seed,
            stats: { ...engine.skylight?.stats },
            fields: engine.skylight?.inspect().map(({ volume, ...field }) => field),
            jobs: globalThis.skyTiming.jobs
              .filter((job) => !job.receivedAbsoluteRealMs)
              .map((job) => ({ id: job.id, type: job.type, key: job.key })),
          };
        });
      const captureStates = { patternedBefore: await captureState() };
      const patterned = await camoWallPixels(await shot('camo-ao-patterned'));
      captureStates.patternedAfter = await captureState();
      const referenceFrame = await page.evaluate(() => {
        globalThis.skyProofControl.value = 1;
        return globalThis.stairsWitness.engine.renderer.info.render.frame;
      });
      await page.waitForFunction(
        (frame) => globalThis.stairsWitness.engine.renderer.info.render.frame > frame,
        referenceFrame,
      );
      captureStates.mainBefore = await captureState();
      const mainEstimate = await camoWallPixels(await shot('camo-ao-main-estimate'));
      captureStates.mainAfter = await captureState();
      await page.evaluate(() => {
        globalThis.skyProofControl.value = 0;
      });
      await setShaderLook(true, false);
      const plain = await camoWallPixels(await shot('camo-ao-plain'));
      const ratio = ({ corner, middle }) => corner.luminance / middle.luminance;
      camoAo = {
        patterned,
        mainEstimate,
        captureStates,
        plain,
        patternedRatio: ratio(patterned),
        plainRatio: ratio(plain),
        timing: summarizeSkyTiming(
          await page.evaluate(() => ({ events: globalThis.skyTiming.events, jobs: globalThis.skyTiming.jobs })),
        ),
        arrival: await page.evaluate(() => {
          const arrival = globalThis.stairsWitness.camoArrival;
          if (arrival.firstMeshRealMs === null || arrival.readyRealMs === null || arrival.renderedFrames === 0) {
            throw new Error('Missing camo arrival observation');
          }
          const startupFirstMesh = globalThis.skyTiming.events.find((event) => event.kind === 'first-mesh');
          const { engineReadyAbsoluteRealMs } = globalThis.skyTiming;
          return {
            ...arrival,
            timeOriginRealMs: performance.timeOrigin,
            meshToReadyRealMs: arrival.readyRealMs - arrival.firstMeshRealMs,
            startupFirstMesh,
            engineReadyAbsoluteRealMs,
            // Null where a time is missing, as the evidence's JSON writes the NaN that arithmetic would give.
            engineToFirstMeshRealMs:
              startupFirstMesh === undefined || engineReadyAbsoluteRealMs === undefined
                ? null
                : startupFirstMesh.absoluteRealMs - engineReadyAbsoluteRealMs,
          };
        }),
      };
      process.stdout.write(`CAMO_SKY_EVIDENCE ${JSON.stringify(camoAo)}\n`);
    } finally {
      await page.evaluate(() => {
        globalThis.skyProofControl.value = 0;
      });
      await page.evaluate((film) => globalThis.stairsWitness.engine.mood.setFilm(film), originalModes.film);
      await setShaderLook(originalModes.linear, originalModes.patterns);
    }
    await writeFile(resolve(artifacts, 'camo-inner-corner-ao.json'), JSON.stringify(camoAo, null, 2));
    await test('settled open-pit brightness matches the main full-sky estimate', () => {
      for (const point of ['corner', 'middle']) {
        assert.ok(
          Math.abs(camoAo.patterned[point].luminance - camoAo.mainEstimate[point].luminance) < 1.5,
          JSON.stringify(camoAo),
        );
      }
    });
    await test('camo preserves corner AO relative to the same plain block face', () => {
      assert.ok(camoAo.plainRatio < 0.9, JSON.stringify(camoAo));
      assert.ok(Math.abs(camoAo.patternedRatio - camoAo.plainRatio) < 0.08, JSON.stringify(camoAo));
    });
  }
  const walk = async (actionId, targetX, ascending, targetFeet) => {
    try {
      await waitForSimulation(
        page,
        ({ x, increasing }) => {
          const { body, session } = globalThis.stairsWitness;
          return {
            time: session.sim.time,
            paused: session.sim.paused,
            reached: increasing ? body.pos[0] >= x : body.pos[0] <= x,
          };
        },
        { x: targetX, increasing: ascending },
        { seconds: 10, label: `arrival ${actionId} x=${targetX}`, record: state, hold: actionId },
      );
      const start = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
      await waitForSimulation(
        page,
        (feet) => {
          const { body, session } = globalThis.stairsWitness;
          const supported = body.onGround && Math.abs(body.pos[1] - feet) < 0.01;
          return { time: session.sim.time, paused: session.sim.paused, reached: supported, supported };
        },
        targetFeet,
        { seconds: 3, from: start, label: `settle ${actionId} x=${targetX} feet=${targetFeet}`, record: state },
      );
    } catch (error) {
      await state(`walk/settle failure ${actionId} x=${targetX} feet=${targetFeet}: ${error}`);
      throw error;
    }
  };
  const openResidentDoor = async (residentId) => {
    const approach = await page.evaluate((id) => {
      const { session, entities } = globalThis.stairsWitness;
      const resident = session.actorStore.get(id);
      if (!resident) {
        throw new Error('stairs_house resident is not streamed');
      }
      const doors = [...entities.all].filter(
        (entity) => entities.defOf(entity).door && !entity.open && !entity.lock?.locked,
      );
      const centre = (entity) => [
        entity.pos[0] + entity.size[0] / 2,
        entity.pos[1],
        entity.pos[2] + entity.size[2] / 2,
      ];
      const distanceToResident = (entity) => {
        const [x, y, z] = centre(entity);
        const [rx, ry, rz] = resident.body.pos;
        return Math.hypot(x - rx, y - ry, z - rz);
      };
      const [door] = doors.sort((a, b) => distanceToResident(a) - distanceToResident(b));
      if (!door) {
        throw new Error('stairs_house resident has no closed ordinary door nearby');
      }
      const [cx, , cz] = centre(door);
      /** @type {Record<string, [number, number]>} */
      const normals = { n: [0, 1], s: [0, 1], e: [1, 0], w: [1, 0] };
      const normal = normals[door.facing];
      if (!normal) {
        throw new Error(`The resident door faces no compass side: ${door.facing}`);
      }
      const residentSide =
        Math.sign((resident.body.pos[0] - cx) * normal[0] + (resident.body.pos[2] - cz) * normal[1]) || 1;
      return {
        uid: door.uid,
        position: [cx - residentSide * normal[0] * 2.4, resident.body.pos[1], cz - residentSide * normal[1] * 2.4],
      };
    }, residentId);
    await walkTo(approach.position, 'walk from the landing to the closed resident door');
    await page.evaluate((uid) => {
      const { body, input, entities, doorPanel } = globalThis.stairsWitness;
      const door = entities.byUid(uid);
      if (!door) {
        throw new Error('The resident door left the world');
      }
      const panel = doorPanel(door, 0.5);
      const c = Math.cos(panel.rotationY);
      const s = Math.sin(panel.rotationY);
      const dx = panel.pivot[0] + c * panel.center[0] + s * panel.center[2] - body.pos[0] * 0.5;
      const dz = panel.pivot[2] - s * panel.center[0] + c * panel.center[2] - body.pos[2] * 0.5;
      const dy = panel.pivot[1] + panel.center[1] - (body.pos[1] * 0.5 + 1.62);
      input.controls.yaw = Math.atan2(-dx, -dz);
      input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }, approach.uid);
    const started = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
    await pressAction(page, 'world.interact');
    const result = await page.waitForFunction(
      ({ targetUid, until }) => {
        const { session, entities } = globalThis.stairsWitness;
        const open = entities.byUid(targetUid)?.open;
        return open || session.sim.time >= until ? { open } : false;
      },
      { targetUid: approach.uid, until: started + 3 },
      { timeout: 0, polling: 50 },
    );
    assert.equal((await result.jsonValue()).open, true, "world interaction opens the resident's ordinary closed door");
  };
  const walkTo = async (target, label) => {
    const start = await page.evaluate((destination) => {
      const { input, session, body } = globalThis.stairsWitness;
      input.controls.yaw = Math.atan2(-(destination[0] - body.pos[0]), -(destination[2] - body.pos[2]));
      input.controls.pitch = 0;
      return session.sim.time;
    }, target);
    await waitForSimulation(
      page,
      ({ target: destination, from, seconds }) => {
        const { body, session, input, engine } = globalThis.stairsWitness;
        const dx = destination[0] - body.pos[0];
        const dz = destination[2] - body.pos[2];
        input.controls.yaw = Math.atan2(-dx, -dz);
        const distance = Math.hypot(dx, dz);
        const reached = distance < 0.5;
        const terminal = reached || session.sim.paused || session.sim.time - from >= seconds;
        if (!terminal) {
          return { time: session.sim.time, paused: session.sim.paused, reached, distance };
        }
        /** @returns {Vec3} */
        const supportCell = (position) => [
          Math.floor(position[0]),
          Math.floor(position[1] - 1),
          Math.floor(position[2]),
        ];
        const playerSupport = supportCell(body.pos);
        const targetSupport = supportCell(destination);
        const intent = input.controls.intent();
        return {
          time: session.sim.time,
          paused: session.sim.paused,
          reached,
          distance,
          position: [...body.pos],
          target: [...destination],
          onGround: body.onGround,
          velocity: [...body.vel],
          path: {
            from: [body.pos[0], body.pos[2]],
            to: [destination[0], destination[2]],
            delta: [dx, dz],
            yaw: input.controls.yaw,
            forward: intent.forward,
            sprint: intent.sprint,
          },
          readiness: {
            playerColumnGenerated: engine.streamer.isReady(body.pos[0], body.pos[2]),
            playerColumnUnmeshed: engine.streamer.unmeshedColumns(body.pos[0], body.pos[2], 0),
            playerSupport: engine.isSolid(...playerSupport),
            targetColumnGenerated: engine.streamer.isReady(destination[0], destination[2]),
            targetColumnUnmeshed: engine.streamer.unmeshedColumns(destination[0], destination[2], 0),
            targetSupport: engine.isSolid(...targetSupport),
          },
          residents: [...session.actorStore.entries()].map(([, resident]) => ({
            position: [...resident.body.pos],
            mode: resident.agent?.mode,
          })),
        };
      },
      { target, from: start, seconds: 12 },
      { seconds: 12, from: start, label, record: state, hold: 'movement.forward' },
    );
    const settleStart = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
    await waitForSimulation(
      page,
      ({ target: destination, from, seconds }) => {
        const { body, session, engine } = globalThis.stairsWitness;
        const reached = body.onGround && Math.abs(body.pos[1] - destination[1]) < 0.01;
        const terminal = reached || session.sim.paused || session.sim.time - from >= seconds;
        if (!terminal) {
          return { time: session.sim.time, paused: session.sim.paused, reached };
        }
        /** @type {Vec3} */
        const supportCell = [Math.floor(destination[0]), Math.floor(destination[1] - 1), Math.floor(destination[2])];
        return {
          time: session.sim.time,
          paused: session.sim.paused,
          reached,
          position: [...body.pos],
          target: [...destination],
          feet: body.pos[1],
          onGround: body.onGround,
          velocity: [...body.vel],
          readiness: {
            targetColumnGenerated: engine.streamer.isReady(destination[0], destination[2]),
            targetColumnUnmeshed: engine.streamer.unmeshedColumns(destination[0], destination[2], 0),
            targetSupport: engine.isSolid(...supportCell),
          },
        };
      },
      { target, from: settleStart, seconds: 4 },
      {
        seconds: 4,
        from: settleStart,
        label: `${label}: settle after releasing forward input`,
        record: state,
      },
    );
  };
  let lightProof;
  let outdoorProof;
  let residentProof;
  let secondSlotProof;
  let raisedOutdoor;
  if (mode === 'traversal') {
    const sprintDoor = await page.evaluate(() => {
      const { body, input, entities, doorPanel } = globalThis.stairsWitness;
      const doors = [...entities.all].filter((entity) => entities.defOf(entity).door && !entity.lock && !entity.open);
      const centre = (entity) => [
        entity.pos[0] + entity.size[0] / 2,
        entity.pos[1],
        entity.pos[2] + entity.size[2] / 2,
      ];
      const distance2 = (entity) => (centre(entity)[0] - body.pos[0]) ** 2 + (centre(entity)[2] - body.pos[2]) ** 2;
      const [door] = doors.sort((a, b) => distance2(a) - distance2(b));
      if (!door) {
        throw new Error('stair_demo has no streamed, ordinary door');
      }
      const [cx, cy, cz] = centre(door);
      /** @type {Record<string, [number, number]>} */
      const normals = { n: [0, 1], s: [0, 1], e: [1, 0], w: [1, 0] };
      const normal = normals[door.facing];
      if (!normal) {
        throw new Error(`The stair_demo door faces no compass side: ${door.facing}`);
      }
      const side = Math.sign((body.pos[0] - cx) * normal[0] + (body.pos[2] - cz) * normal[1]) || 1;
      body.pos = [cx + side * normal[0] * 2.4, cy, cz + side * normal[1] * 2.4];
      body.vel = [0, 0, 0];
      const panel = doorPanel(door, 0.5);
      const c = Math.cos(panel.rotationY);
      const s = Math.sin(panel.rotationY);
      const dx = panel.pivot[0] + c * panel.center[0] + s * panel.center[2] - body.pos[0] * 0.5;
      const dz = panel.pivot[2] - s * panel.center[0] + c * panel.center[2] - body.pos[2] * 0.5;
      const dy = panel.pivot[1] + panel.center[1] - (body.pos[1] * 0.5 + 1.62);
      input.controls.yaw = Math.atan2(-dx, -dz);
      input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return door.uid;
    });
    const releaseSprint = await holdAction(page, 'movement.sprint');
    try {
      assert.equal(await page.evaluate(() => globalThis.stairsWitness.input.controls.intent().sprint), true);
      await pressAction(page, 'world.interact');
    } finally {
      await releaseSprint();
    }
    const sprintStarted = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
    const sprintResult = await page.waitForFunction(
      ({ uid, until }) => {
        const { session, entities } = globalThis.stairsWitness;
        const open = entities.byUid(uid)?.open;
        return open || session.sim.time >= until ? { open, notice: globalThis.stairsWitness.getNotice() } : false;
      },
      { uid: sprintDoor, until: sprintStarted + 3 },
      { timeout: 0, polling: 50 },
    );
    assert.equal((await sprintResult.jsonValue()).open, true, 'world interaction opens a door while sprinting');
    await page.evaluate((uid) => {
      const { body, input, entities, doorPanel } = globalThis.stairsWitness;
      const door = entities.byUid(uid);
      if (!door) {
        throw new Error('The sprint door left the world');
      }
      const panel = doorPanel(door, 0.5);
      const c = Math.cos(panel.rotationY);
      const s = Math.sin(panel.rotationY);
      const dx = panel.pivot[0] + c * panel.center[0] + s * panel.center[2] - body.pos[0] * 0.5;
      const dz = panel.pivot[2] - s * panel.center[0] + c * panel.center[2] - body.pos[2] * 0.5;
      const dy = panel.pivot[1] + panel.center[1] - (body.pos[1] * 0.5 + 1.62);
      input.controls.yaw = Math.atan2(-dx, -dz);
      input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }, sprintDoor);
    await pressAction(page, 'world.interact');
    const doorValue = async (propertyName, expectedValue) => {
      const deadline = (await page.evaluate(() => globalThis.stairsWitness.session.sim.time)) + 3;
      const result = await page.waitForFunction(
        ({ uid: targetUid, propertyName: targetProperty, expectedValue: desiredValue, deadline: simDeadline }) => {
          const { session, entities } = globalThis.stairsWitness;
          const door = entities.byUid(targetUid);
          const currentValue = targetProperty === 'locked' ? door?.lock?.locked : door?.[targetProperty];
          return currentValue === desiredValue || session.sim.time >= simDeadline ? { currentValue } : false;
        },
        { uid: sprintDoor, propertyName, expectedValue, deadline },
        { timeout: 0, polling: 50 },
      );
      return (await result.jsonValue()).currentValue;
    };
    assert.equal(await doorValue('open', false), false, 'world interaction closes the same door');
    await page.evaluate((uid) => {
      const { entities, session } = globalThis.stairsWitness;
      const fixture = structuredClone(entities.snapshotState());
      const door = fixture.entities.find((entity) => entity.uid === uid);
      if (!door) {
        throw new Error('Door fixture is missing');
      }
      door.lock = { id: 'test_shed', locked: false };
      entities.restoreState(fixture);
      const shedKey = session.inventory.registry.items.get('shed_key');
      if (!shedKey) {
        throw new Error('The shed_key item is not registered');
      }
      const wrongDefinition = {
        ...shedKey,
        id: 'stairs_wrong_key',
        name: 'Wrong key',
        key: { lock: 'other' },
      };
      session.inventory.registry.items.set(wrongDefinition.id, wrongDefinition);
      const key = session.inventory.create('shed_key');
      session.inventory.add(key, { kind: 'hand', side: 'right' });
    }, sprintDoor);
    await page.evaluate(() => globalThis.stairsWitness.performHandUse('right'));
    assert.equal(await doorValue('locked', true), true, 'activating the matching held key locks its door');
    await page.evaluate(() => globalThis.stairsWitness.performHandUse('right'));
    assert.equal(await doorValue('locked', false), false, 'activating the matching held key unlocks its door');
    await page.evaluate(() => {
      const { body, session } = globalThis.stairsWitness;
      const current = session.inventory.hands.right;
      if (current) {
        session.inventory.move(current, { kind: 'pile', pos: body.pos });
      }
      const key = session.inventory.create('stairs_wrong_key');
      session.inventory.add(key, { kind: 'hand', side: 'right' });
    });
    const wrongKey = await page.evaluate((uid) => {
      const { entities, performHandUse, getNotice } = globalThis.stairsWitness;
      performHandUse('right');
      return { notice: getNotice(), locked: entities.byUid(uid)?.lock?.locked };
    }, sprintDoor);
    assert.ok(wrongKey.notice, 'a wrong held key gives a refusal reason');
    assert.equal(wrongKey.locked, false, 'wrong-key refusal leaves the door unlocked');
    await stage([112, 43.0001, 115]);
    const houseLower = await state('house lower landing');
    const residentId = houseLower.zombies[0]?.id;
    assert.ok(Number.isSafeInteger(residentId), 'stairs_house streams its authored resident');
    await walk('movement.forward', 121, true, 51);
    const houseUpper = await state('house upstairs walked');
    const residentAtUpper = houseUpper.zombies.find(({ id }) => id === residentId);
    assert.ok(residentAtUpper && residentAtUpper.pos[1] > houseLower.position[1]);
    const upperAnchorStart = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
    const upperAnchor = await waitForSimulation(
      page,
      ({ id, lowerLanding, upperLanding, from, seconds }) => {
        const { engine, session } = globalThis.stairsWitness;
        const resident = session.actorStore.get(id);
        const residentPosition = resident ? [...resident.body.pos] : null;
        const residentGroundedAtUpper = Boolean(
          resident?.body.onGround && Math.abs(resident.body.pos[1] - upperLanding[1]) < 0.01,
        );
        const lowerTarget = resident ? [resident.body.pos[0], lowerLanding[1], resident.body.pos[2]] : null;
        /** @returns {Vec3} */
        const supportCell = (position) => [
          Math.floor(position[0]),
          Math.floor(position[1] - 1),
          Math.floor(position[2]),
        ];
        const middleStair = [
          Math.floor((lowerLanding[0] + upperLanding[0]) / 2),
          Math.floor((lowerLanding[1] + upperLanding[1]) / 2 - 1),
          Math.floor((lowerLanding[2] + upperLanding[2]) / 2),
        ];
        const collisionCells = [lowerLanding, middleStair, upperLanding, ...(lowerTarget ? [lowerTarget] : [])].map(
          supportCell,
        );
        const collisionReady = collisionCells.map((cell) => engine.isSolid(...cell));
        const reached = residentGroundedAtUpper && collisionReady.every(Boolean);
        const terminal = reached || session.sim.paused || session.sim.time - from >= seconds;
        return {
          time: session.sim.time,
          paused: session.sim.paused,
          reached,
          ...(terminal
            ? {
                residentPosition,
                residentGroundedAtUpper,
                target: lowerTarget,
                collisionCells,
                collisionReady,
                terrainGenerated: lowerTarget ? engine.streamer.isReady(lowerTarget[0], lowerTarget[2]) : false,
              }
            : {}),
        };
      },
      {
        id: residentId,
        lowerLanding: houseLower.position,
        upperLanding: houseUpper.position,
        from: upperAnchorStart,
        seconds: 8,
      },
      {
        seconds: 8,
        from: upperAnchorStart,
        label: 'upper resident and lower-floor/stair collision ready',
        record: state,
      },
    );
    await state('upper resident and lower-floor/stair collision ready', { upperAnchor });
    await openResidentDoor(residentId);
    await waitForSimulation(
      page,
      (id) => {
        const { body, session } = globalThis.stairsWitness;
        const target = session.actorStore.get(id)?.agent?.lastPerceived;
        const distance = target
          ? Math.hypot(target[0] - body.pos[0], target[1] - body.pos[1], target[2] - body.pos[2])
          : Number.POSITIVE_INFINITY;
        return { time: session.sim.time, paused: session.sim.paused, reached: distance < 1, distance };
      },
      residentId,
      {
        seconds: 8,
        label: 'resident hears the player at the open doorway',
        record: state,
        hold: 'movement.forward',
      },
    );
    await walkTo([117, 51, 116], 'return through the open door to the stair hall');
    await walkTo([121, 51, 115], 'return to upper stair landing');
    await page.evaluate(() => {
      globalThis.stairsWitness.input.controls.yaw = -Math.PI / 2;
      globalThis.stairsWitness.input.controls.pitch = 0;
    });
    await walk('movement.back', 112, false, 43);
    await state('house downstairs walked');
    const lowerFloorTarget = upperAnchor.target;
    const releaseResidentSprint = await holdAction(page, 'movement.sprint');
    try {
      // The resident can chase down the stairs; keep the target projected from its grounded upstairs position.
      await walkTo(lowerFloorTarget, 'sprint below resident on the lower floor');
    } finally {
      await releaseResidentSprint();
    }
    const settleStart = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
    await waitForSimulation(
      page,
      () => {
        const { body, session } = globalThis.stairsWitness;
        return {
          time: session.sim.time,
          paused: session.sim.paused,
          reached: Math.hypot(body.vel[0], body.vel[2]) < 0.1,
          speed: Math.hypot(body.vel[0], body.vel[2]),
        };
      },
      undefined,
      {
        seconds: 4,
        from: settleStart,
        label: 'come to rest under the resident',
        record: state,
      },
    );
    await state('player rests under the upstairs resident');

    await stage([143, 43.0001, 115]);
    await walk('movement.back', 134, false, 35);
    assert.ok(Math.abs((await state('cellar lower landing walked')).position[1] - 35) < 0.01);

    await walk('movement.forward', 143, true, 43);
    assert.ok(Math.abs((await state('cabin ground landing walked back')).position[1] - 43) < 0.01);
  } else if (mode === 'lighting-cellar') {
    ({ lightProof, raisedOutdoor } = await timePhase('lighting-cellar-proofs', lightingCellarProofs));
  } else if (mode === 'lighting-residents') {
    ({ residentProof } = await timePhase('lighting-resident-proofs', lightingResidentProofs));
  } else if (mode === 'lighting-outdoor') {
    ({ outdoorProof } = await lightingOutdoorProofs());
    await page.close();
    await vite.close();
  } else if (mode === 'lighting-atlas') {
    ({ secondSlotProof } = await lightingAtlasProofs());
  }
  assert.deepEqual(errors, []);
  const resultFile = isLightingMode ? `result-${mode}.json` : 'result.json';
  await writeFile(
    resolve(artifacts, resultFile),
    JSON.stringify(
      { mode, states, lightProof, outdoorProof, residentProof, secondSlotProof, raisedOutdoor, errors },
      null,
      2,
    ),
  );
} catch (error) {
  process.stderr.write(
    `STAIRS_FAILURE ${JSON.stringify({ phase: failedPhase, errors, postFrames: await page?.evaluate(postFrameProgress).catch(() => null), pointer: await page?.evaluate(() => ({ requests: globalThis.camoPointerRequests, events: globalThis.camoPointerEvents, loading: document.getElementById('world-loading')?.dataset.state })).catch(() => null) })}\n`,
  );
  throw error;
} finally {
  await timeIfLighting('page-close', async () => page?.close());
  await timeIfLighting('browser-close', async () => browser?.close());
  await timeIfLighting('vite-close', () => vite.close());
}
