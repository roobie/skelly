// biome-ignore-all lint/correctness/noNodejsModules: standalone maintained browser test starts Vite and Chrome.
// biome-ignore-all lint/style/noProcessEnv: test executable and evidence destination are runner configuration.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser contract assertions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';
import { holdAction, pressAction } from './input-actions.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const [, , mode] = process.argv;
assert.ok(mode === 'traversal' || mode === 'lighting', 'choose traversal or lighting');
const root = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = resolve(process.env.STAIRS_ARTIFACT_DIR ?? 'test-results/stairs');
const RAISED_CABIN = { template: 'stairs_cabin', position: [82, 27, 55], rotation: 0 };
await mkdir(artifacts, { recursive: true });
const vite = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'stairs-test-observation',
      enforce: 'pre',
      transform(code, id) {
        if (mode === 'lighting' && id.endsWith('/src/core/authoredSite.ts')) {
          // Post-admission fixture: a deliberate 6 m raise is not valid authored cut/fill.
          // Keep its lot at shared ground, exposing the lower west wall for slot contrast.
          const anchor = '    const s = scale.blockSize;';
          const lot = 'lotOf(building, rect)';
          assert.equal(code.split(anchor).length, 2);
          assert.equal(code.split(lot).length, 2);
          return code
            .replace(
              anchor,
              `${anchor}\n    const raisedCabin = ${JSON.stringify(RAISED_CABIN)};\n    layout = {...layout, buildings: [...layout.buildings, raisedCabin]};`,
            )
            .replace(lot, '{...lotOf(building, rect), ...(building === raisedCabin ? {floor: layout.ground} : {})}');
        }
        if (id.endsWith('/src/render/skylight.ts')) {
          // Test-only reference: identical scene with diffuse sky visibility forced to one.
          assert.ok(code.includes('shader.uniforms.uSkyVolume = this.texture;'));
          assert.ok(code.includes('float skyVisibility() {'));
          return code
            .replace(
              'shader.uniforms.uSkyVolume = this.texture;',
              'shader.uniforms.uSkyVolume = this.texture;\nshader.uniforms.uSkyProofControl = (globalThis.skyProofControl ??= {value:0});',
            )
            .replace(
              'float skyVisibility() {',
              'uniform float uSkyProofControl;\nfloat skyVisibility() {\n  if (uSkyProofControl > 0.5) return 1.0;',
            );
        }
        if (!id.endsWith('/src/game/play.ts')) {
          return;
        }
        const marker = 'startRealFrames(frame);';
        assert.ok(code.includes(marker));
        return `import { doorPanel as stairsDoorPanel } from '../core/blockEntities.ts';\n${code.replace(
          marker,
          `Object.assign(globalThis,{stairsWitness:{engine,session,input,body,entities,queue,doorPanel:stairsDoorPanel,performHandUse,getNotice:()=>notice,get noclip(){return debugTools?.noclip??false;}},d7Review:{input,session,held:view.held,engine,camera,debugTools,inventory}});\n${marker}`,
        )}`;
      },
    },
  ],
});
let browser;
try {
  await vite.listen();
  const { port } = vite.httpServer.address();
  browser = await launchChromium(mode === 'traversal' ? 'stairs-traversal' : 'stairs-lighting', {
    headless: process.env.BROWSER_HEADED !== '1',
  });
  // Traversal screenshots are diagnostic, not pixel oracles: avoid paying full SwiftShader frame cost.
  const page = await browser.newPage({
    viewport: mode === 'traversal' ? { width: 640, height: 400 } : { width: 1280, height: 800 },
  });
  const errors = [];
  const states = [];
  const helpDialogs = [];
  page.on('dialog', async (dialog) => {
    helpDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.addInitScript(() => {
    globalThis.nativeGateEvents = [];
    for (const type of ['keydown', 'keyup']) {
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
  const stageId = mode === 'traversal' ? 'stairs-traversal' : 'stairs-lighting';
  await page.goto(
    browserStageUrl(stageId, `http://127.0.0.1:${port}/?site=stair_demo&seed=1&radius=32&debug=1&time=12:00`),
  );
  await page.waitForFunction(
    () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
    undefined,
    {
      timeout: 60_000,
    },
  );
  await page.locator('#go').click();
  await page.waitForFunction(() => globalThis.stairsWitness, undefined, { timeout: 60_000 });
  if (mode === 'traversal') {
    await page.waitForFunction(() => Boolean(document.pointerLockElement));
    const verifyGate = async (locked) => {
      const before = await page.evaluate(() => globalThis.stairsWitness.session.sim.godMode);
      const gate = await page.evaluate(
        `import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.chords('debug.gate')[0])`,
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
  await page.waitForFunction(
    (lighting) =>
      [[96, 32, 96], [128, 32, 96], ...(lighting ? [[160, 32, 96]] : [])].every(([x, y, z]) =>
        globalThis.stairsWitness.engine.meshes.group.children.some(
          (mesh) => mesh.position.x === x && mesh.position.y === y && mesh.position.z === z,
        ),
      ),
    mode === 'lighting',
    { timeout: 60_000 },
  );
  if (mode === 'lighting') {
    await page.evaluate(() => {
      const runtime = globalThis.d7Review;
      globalThis.d7Observed = { frames: [], outsideMood: 0, initialPost: runtime.engine.mood.post };
      const renderMood = runtime.engine.mood.render.bind(runtime.engine.mood);
      const renderHands = runtime.held.render.bind(runtime.held);
      const render = runtime.engine.renderer.render.bind(runtime.engine.renderer);
      let active;
      runtime.engine.mood.render = (callback) => {
        active = { post: runtime.engine.mood.post, hands: 0, targets: [], sequence: [] };
        try {
          return renderMood(callback);
        } finally {
          globalThis.d7Observed.frames.push(active);
          globalThis.d7Observed.frames = globalThis.d7Observed.frames.slice(-12);
          active = undefined;
        }
      };
      runtime.held.render = (...args) => {
        if (active) {
          active.hands += 1;
        } else {
          globalThis.d7Observed.outsideMood += 1;
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
        globalThis.d7Observed.frames = [];
        globalThis.d7Review.engine.mood.setPost(enabled);
      }, post);
      await page.waitForFunction(() => globalThis.d7Observed.frames.length >= 3);
      const proof = await page.evaluate(() => ({
        frames: globalThis.d7Observed.frames.slice(-3),
        outsideMood: globalThis.d7Observed.outsideMood,
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
    await page.evaluate(() => globalThis.d7Review.engine.mood.setPost(globalThis.d7Observed.initialPost));
  }
  // The contrast witnesses measure only the world, never the debug hover label or HUD.
  await page.addStyleTag({ content: 'body > :not(#view) { visibility: hidden !important; }' });
  const stage = async (fixturePosition, fixtureYaw = -Math.PI / 2) => {
    // Fixtures are positioned only BEFORE each independent scenario, never across a flight during traversal.
    await page.evaluate(
      ({ position, yaw }) => {
        const { session, input, noclip } = globalThis.stairsWitness;
        assertNoNoclip();
        function assertNoNoclip() {
          if (noclip) {
            throw new Error('noclip must be OFF');
          }
        }
        session.body.pos = [...position];
        session.body.vel = [0, 0, 0];
        session.body.onGround = true;
        input.yaw = yaw;
        input.pitch = 0;
      },
      { position: fixturePosition, yaw: fixtureYaw },
    );
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
        zombies: [...session.zombieStore.entries()].map(([id, z]) => ({
          id,
          pos: [...z.body.pos],
          mode: z.mode,
          lastPerceived: z.lastPerceived,
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
  const shot = (label) => page.screenshot({ path: resolve(artifacts, `${label}.png`) });
  const walk = async (actionId, targetX, ascending, targetFeet) => {
    const release = await holdAction(page, actionId);
    try {
      const keyDownTime = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
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
        {
          seconds: 10,
          from: keyDownTime,
          label: `arrival ${actionId} x=${targetX}`,
          record: state,
          stop: release,
        },
      );
      const start = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
      // Same three-second physical bound, now simulation seconds rather than renderer wall time.
      // The outer stage remains capped at 300 s; no retry or larger stage cap.
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
      await release();
      await state(`walk/settle failure ${actionId} x=${targetX} feet=${targetFeet}: ${error}`);
      throw error;
    } finally {
      await release();
    }
  };
  const openResidentDoor = async (residentId) => {
    const approach = await page.evaluate((id) => {
      const { session, entities } = globalThis.stairsWitness;
      const resident = session.zombieStore.get(id);
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
      const distanceToResident = (entity) =>
        Math.hypot(...centre(entity).map((value, axis) => value - resident.body.pos[axis]));
      const [door] = doors.sort((a, b) => distanceToResident(a) - distanceToResident(b));
      if (!door) {
        throw new Error('stairs_house resident has no closed ordinary door nearby');
      }
      const [cx, , cz] = centre(door);
      const normal = { n: [0, 1], s: [0, 1], e: [1, 0], w: [1, 0] }[door.facing];
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
      const panel = doorPanel(entities.byUid(uid), 0.5);
      const c = Math.cos(panel.rotationY);
      const s = Math.sin(panel.rotationY);
      const dx = panel.pivot[0] + c * panel.center[0] + s * panel.center[2] - body.pos[0] * 0.5;
      const dz = panel.pivot[2] - s * panel.center[0] + c * panel.center[2] - body.pos[2] * 0.5;
      const dy = panel.pivot[1] + panel.center[1] - (body.pos[1] * 0.5 + 1.62);
      input.yaw = Math.atan2(-dx, -dz);
      input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }, approach.uid);
    const started = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
    await pressAction(page, 'world.interact');
    const result = await page.waitForFunction(
      ({ targetUid, until }) => {
        const { session, entities } = globalThis.stairsWitness;
        const door = entities.byUid(targetUid);
        return door.open || session.sim.time >= until ? { open: door.open } : false;
      },
      { targetUid: approach.uid, until: started + 3 },
      { timeout: 0, polling: 50 },
    );
    assert.equal((await result.jsonValue()).open, true, "world interaction opens the resident's ordinary closed door");
  };
  const walkTo = async (target, label) => {
    const start = await page.evaluate((destination) => {
      const { input, session, body } = globalThis.stairsWitness;
      input.yaw = Math.atan2(-(destination[0] - body.pos[0]), -(destination[2] - body.pos[2]));
      input.pitch = 0;
      return session.sim.time;
    }, target);
    const releaseForward = await holdAction(page, 'movement.forward');
    try {
      await waitForSimulation(
        page,
        ({ target: destination, from, seconds }) => {
          const { body, session, input, engine } = globalThis.stairsWitness;
          const dx = destination[0] - body.pos[0];
          const dz = destination[2] - body.pos[2];
          input.yaw = Math.atan2(-dx, -dz);
          const distance = Math.hypot(dx, dz);
          const reached = distance < 0.5;
          const terminal = reached || session.sim.paused || session.sim.time - from >= seconds;
          if (!terminal) {
            return { time: session.sim.time, paused: session.sim.paused, reached, distance };
          }
          const supportCell = (position) => [
            Math.floor(position[0]),
            Math.floor(position[1] - 1),
            Math.floor(position[2]),
          ];
          const playerSupport = supportCell(body.pos);
          const targetSupport = supportCell(destination);
          const intent = input.intent();
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
              yaw: input.yaw,
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
            residents: [...session.zombieStore.entries()].map(([, resident]) => ({
              position: [...resident.body.pos],
              mode: resident.mode,
            })),
          };
        },
        { target, from: start, seconds: 12 },
        { seconds: 12, from: start, label, record: state, stop: releaseForward },
      );
    } finally {
      await releaseForward();
    }
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
      const normal = { n: [0, 1], s: [0, 1], e: [1, 0], w: [1, 0] }[door.facing];
      const side = Math.sign((body.pos[0] - cx) * normal[0] + (body.pos[2] - cz) * normal[1]) || 1;
      body.pos = [cx + side * normal[0] * 2.4, cy, cz + side * normal[1] * 2.4];
      body.vel = [0, 0, 0];
      const panel = doorPanel(door, 0.5);
      const c = Math.cos(panel.rotationY);
      const s = Math.sin(panel.rotationY);
      const dx = panel.pivot[0] + c * panel.center[0] + s * panel.center[2] - body.pos[0] * 0.5;
      const dz = panel.pivot[2] - s * panel.center[0] + c * panel.center[2] - body.pos[2] * 0.5;
      const dy = panel.pivot[1] + panel.center[1] - (body.pos[1] * 0.5 + 1.62);
      input.yaw = Math.atan2(-dx, -dz);
      input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return door.uid;
    });
    const releaseSprint = await holdAction(page, 'movement.sprint');
    try {
      assert.equal(await page.evaluate(() => globalThis.stairsWitness.input.intent().sprint), true);
      await pressAction(page, 'world.interact');
    } finally {
      await releaseSprint();
    }
    const sprintStarted = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
    const sprintResult = await page.waitForFunction(
      ({ uid, until }) => {
        const { session, entities } = globalThis.stairsWitness;
        const door = entities.byUid(uid);
        return door.open || session.sim.time >= until
          ? { open: door.open, notice: globalThis.stairsWitness.getNotice() }
          : false;
      },
      { uid: sprintDoor, until: sprintStarted + 3 },
      { timeout: 0, polling: 50 },
    );
    assert.equal((await sprintResult.jsonValue()).open, true, 'world interaction opens a door while sprinting');
    await page.evaluate((uid) => {
      const { body, input, entities, doorPanel } = globalThis.stairsWitness;
      const door = entities.byUid(uid);
      const panel = doorPanel(door, 0.5);
      const c = Math.cos(panel.rotationY);
      const s = Math.sin(panel.rotationY);
      const dx = panel.pivot[0] + c * panel.center[0] + s * panel.center[2] - body.pos[0] * 0.5;
      const dz = panel.pivot[2] - s * panel.center[0] + c * panel.center[2] - body.pos[2] * 0.5;
      const dy = panel.pivot[1] + panel.center[1] - (body.pos[1] * 0.5 + 1.62);
      input.yaw = Math.atan2(-dx, -dz);
      input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }, sprintDoor);
    await pressAction(page, 'world.interact');
    const doorValue = async (propertyName, expectedValue) => {
      const deadline = (await page.evaluate(() => globalThis.stairsWitness.session.sim.time)) + 3;
      const result = await page.waitForFunction(
        ({ uid: targetUid, propertyName: targetProperty, expectedValue: desiredValue, deadline: simDeadline }) => {
          const { session, entities } = globalThis.stairsWitness;
          const door = entities.byUid(targetUid);
          const currentValue = targetProperty === 'locked' ? door.lock?.locked : door[targetProperty];
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
      const wrongDefinition = {
        ...session.inventory.registry.items.get('shed_key'),
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
        const resident = session.zombieStore.get(id);
        const residentPosition = resident ? [...resident.body.pos] : null;
        const residentGroundedAtUpper = Boolean(
          resident?.body.onGround && Math.abs(resident.body.pos[1] - upperLanding[1]) < 0.01,
        );
        const lowerTarget = resident ? [resident.body.pos[0], lowerLanding[1], resident.body.pos[2]] : null;
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
    const approachStart = await page.evaluate(() => globalThis.stairsWitness.session.sim.time);
    const releaseForward = await holdAction(page, 'movement.forward');
    try {
      await waitForSimulation(
        page,
        (id) => {
          const { body, session } = globalThis.stairsWitness;
          const target = session.zombieStore.get(id)?.lastPerceived;
          const distance = target
            ? Math.hypot(target[0] - body.pos[0], target[1] - body.pos[1], target[2] - body.pos[2])
            : Number.POSITIVE_INFINITY;
          return { time: session.sim.time, paused: session.sim.paused, reached: distance < 1, distance };
        },
        residentId,
        {
          seconds: 8,
          from: approachStart,
          label: 'resident hears the player at the open doorway',
          record: state,
          stop: releaseForward,
        },
      );
    } finally {
      await releaseForward();
    }
    await walkTo([117, 51, 116], 'return through the open door to the stair hall');
    await walkTo([121, 51, 115], 'return to upper stair landing');
    await page.evaluate(() => {
      globalThis.stairsWitness.input.yaw = -Math.PI / 2;
      globalThis.stairsWitness.input.pitch = 0;
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
  } else {
    await stage([134, 35.0001, 115]);
    const residents = () =>
      page.evaluate(() => {
        const { engine } = globalThis.stairsWitness;
        return [engine.skylight.at([67, 17.6, 57.5]), engine.skylight.at([83, 23.6, 57.5])];
      });
    const first = await residents();
    assert.deepEqual(first, [0, 0]);
    // This cabin's padded top is 64, in an all-air chunk: only real data events clear its load-time cache.
    const raisedOutdoor = await page.evaluate(() => globalThis.stairsWitness.engine.skylight.at([81.5, 28, 59]));
    assert.equal(raisedOutdoor, 1);
    const dark = await shot('cellar-dark');
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
    const mouse5 = () =>
      page.evaluate(() =>
        document
          .querySelector('#view canvas')
          .dispatchEvent(
            new PointerEvent('pointerdown', { button: 4, buttons: 16, pointerType: 'mouse', bubbles: true }),
          ),
      );
    await mouse5();
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => globalThis.stairsWitness.session.inventory.hands.left.on), true);
    const lit = await shot('cellar-beam');
    const luminance = async (png, cropHeight = 240) =>
      page.evaluate(
        async ({ data, height }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 480, 260, 240, height, 0, 0, 240, height);
          const pixels = ctx.getImageData(0, 0, 240, height).data;
          let sum = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
          }
          return sum / (240 * height * 3);
        },
        { data: png.toString('base64'), height: cropHeight },
      );
    lightProof = { dark: await luminance(dark), beam: await luminance(lit) };
    assert.ok(lightProof.dark < 15, JSON.stringify(lightProof));
    assert.ok(lightProof.beam > lightProof.dark + 10, JSON.stringify(lightProof));
    await mouse5();
    await stage([166, 47.0001, 115]);
    const second = await residents();
    assert.deepEqual(second, first);
    const secondDark = await luminance(await shot('second-cellar-dark'));
    assert.ok(secondDark < 15, JSON.stringify({ secondDark }));
    residentProof = { first, second, secondDark, raisedOutdoor };
    await stage([125, 43.0001, 118]);
    await page.evaluate(() => {
      globalThis.stairsWitness.input.pitch = -0.3;
    });
    await page.waitForTimeout(700);
    const outdoor = await shot('outdoor-normal');
    await page.evaluate(() => {
      globalThis.skyProofControl.value = 1;
    });
    await page.waitForTimeout(200);
    const outdoorReference = await shot('outdoor-sky-one');
    await page.evaluate(() => {
      globalThis.skyProofControl.value = 0;
    });
    // The west-wall window excludes the floor/wall AO corner and hands scene.
    outdoorProof = { normal: await luminance(outdoor, 160), reference: await luminance(outdoorReference, 160) };
    assert.ok(Math.abs(outdoorProof.normal - outdoorProof.reference) < 1.5, JSON.stringify(outdoorProof));

    // Same local field cell: first cabin's west side is buried, raised cabin's west side is exposed.
    // A missing atlas offset reads the dark first-slot cell despite the CPU sample being lit.
    const contrast = await page.evaluate(() => {
      const { engine } = globalThis.stairsWitness;
      return [engine.skylight.at([65.75, 18.75, 59.25]), engine.skylight.at([81.75, 24.75, 59.25])];
    });
    assert.deepEqual(contrast, [0, 1], 'second-slot witness requires different same-local-cell values');
    await stage([157, 43.0001, 118]);
    await page.evaluate(() => {
      globalThis.stairsWitness.input.pitch = Math.atan2(3.25, 7);
    });
    await page.waitForTimeout(700);
    const secondWall = await shot('second-slot-wall-normal');
    await page.evaluate(() => {
      globalThis.skyProofControl.value = 1;
    });
    await page.waitForTimeout(200);
    const secondWallReference = await shot('second-slot-wall-sky-one');
    await page.evaluate(() => {
      globalThis.skyProofControl.value = 0;
    });
    secondSlotProof = {
      contrast,
      normal: await luminance(secondWall, 160),
      reference: await luminance(secondWallReference, 160),
    };
    await writeFile(resolve(artifacts, 'second-slot.json'), JSON.stringify(secondSlotProof, null, 2));
    assert.ok(Math.abs(secondSlotProof.normal - secondSlotProof.reference) < 1.5, JSON.stringify(secondSlotProof));
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(artifacts, 'result.json'),
    JSON.stringify({ mode, states, lightProof, outdoorProof, residentProof, secondSlotProof, errors }, null, 2),
  );
} finally {
  await browser?.close();
  await vite.close();
}
