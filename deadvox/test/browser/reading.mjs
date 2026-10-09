// biome-ignore-all lint/correctness/noNodejsModules: maintained standalone Vite/Chrome contract.
// biome-ignore-all lint/style/noProcessEnv: runner may supply the browser executable and artifact destination.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative consumer/presentation assertions.
// biome-ignore-all lint/correctness/noUnresolvedImports: page-evaluated imports address Vite URLs, not Node files.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';
import { holdAction as holdInputAction, pressAction } from './input-actions.mjs';
import { dispatchMenuPointerClick, dispatchMenuPointerMove } from './menu-pointer.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const [, , mode] = process.argv;
assert.ok(mode === 'consumer' || mode === 'lifecycle', 'choose consumer or lifecycle');
const root = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = resolve(process.env.READING_ARTIFACT_DIR ?? `test-results/reading-${mode}`);
await mkdir(artifacts, { recursive: true });
const vite = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'reading-observation',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/game/play.ts')) {
          return;
        }
        const marker = 'startRealFrames(frame);';
        assert.equal(code.split(marker).length, 2);
        return code.replace(
          marker,
          `let proofReadCalls=0; const proofOpen=reading.open; reading.open=(value,...args)=>{proofReadCalls++;proofOpen(value,...args);}; Object.assign(globalThis,{readingWitness:{engine,session,input,body,screen,reading,eye,lookedAt,useTarget,get readCalls(){return proofReadCalls;},get mainMenuOpen(){return mainMenuOpen;}}});\n${marker}`,
        );
      },
    },
  ],
});
let browser;
try {
  await vite.listen();
  const { port } = vite.httpServer.address();
  browser = await launchChromium('reading', { headless: true });
  const page = await browser.newPage({
    viewport: mode === 'consumer' ? { width: 640, height: 400 } : { width: 1280, height: 800 },
  });
  const errors = [];
  const states = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(
    browserStageUrl(
      'reading',
      `http://127.0.0.1:${port}/?site=testHouse&seed=1&radius=16&time=12:00&post=0&sunshadow=0&torchshadow=0`,
    ),
    { waitUntil: 'domcontentloaded' },
  );
  try {
    await page.waitForFunction(
      () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
      undefined,
      { timeout: 60_000 },
    );
  } catch (error) {
    const readiness = await page
      .evaluate(() => ({
        status: document.querySelector('#save-status')?.textContent,
        go: document.querySelector('#go')?.getAttribute('aria-disabled'),
        errors: document.querySelector('#errors')?.textContent,
      }))
      .catch((failure) => ({ evaluationError: String(failure) }));
    throw new Error(`Reading title did not become ready: ${JSON.stringify({ readiness, errors })}`, { cause: error });
  }
  if (mode === 'consumer') {
    await page.locator('.input-options > summary').click();
    await page.locator('[data-binding-id="world.interact"] button').click();
    // KeyJ is the new chord being captured; world.interact still resolves to the old key until capture commits.
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(
      "import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.chords('world.interact')[0].code === 'KeyJ')",
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
      undefined,
      { timeout: 60_000 },
    );
    assert.equal(
      await page.evaluate(
        "import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.chords('world.interact')[0].code)",
      ),
      'KeyJ',
      'settings rebind persists across reload',
    );
  }
  await page.locator('#go').click();
  await page.waitForFunction(() => globalThis.readingWitness, undefined, { timeout: 60_000 });
  await page.waitForFunction(
    () =>
      globalThis.readingWitness.input.locked &&
      !globalThis.readingWitness.session.sim.paused &&
      [...globalThis.readingWitness.engine.entities.all].some((entity) => entity.type === 'crate'),
    undefined,
    { timeout: 60_000 },
  );
  const record = async (label) => {
    const state = await page.evaluate(() => {
      const { session, input, body, screen, reading, mainMenuOpen, readCalls } = globalThis.readingWitness;
      return {
        time: session.sim.time,
        paused: session.sim.paused,
        position: [...body.pos],
        velocity: [...body.vel],
        onGround: body.onGround,
        locked: input.locked,
        menuPointer: input.menuPointer,
        mainMenuOpen,
        readingOpen: reading.isOpen,
        inventoryOpen: screen.isOpen,
        selected: screen.selected?.uid,
        jobs: session.queue.jobs.map((job) => ({ label: job.label, elapsed: job.elapsed, duration: job.duration })),
        cursor: [input.cursorX, input.cursorY],
        readCalls,
      };
    });
    states.push({ label, ...state });
    await writeFile(resolve(artifacts, 'states.json'), JSON.stringify(states, null, 2));
    return state;
  };
  const uiClick = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const rect = await locator.boundingBox();
    assert.ok(rect);
    const target = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const cursor = await page.evaluate(() => {
      const { input } = globalThis.readingWitness;
      return { x: input.cursorX, y: input.cursorY };
    });
    await page.evaluate(dispatchMenuPointerMove, {
      canvasSelector: '#view',
      movementX: target.x - cursor.x,
      movementY: target.y - cursor.y,
    });
    await page.evaluate(dispatchMenuPointerClick, { canvasSelector: '#view' });
  };
  const holdAction = async (actionId, run) => {
    const release = await holdInputAction(page, actionId);
    try {
      await run();
    } finally {
      await release();
    }
  };
  let proof;
  if (mode === 'consumer') {
    await pressAction(page, 'ui.main-menu-toggle');
    const interactionOption = await page.evaluate(
      "import('/src/ui/hudOptions.ts').then(({ HUD_OPTION_KEYS }) => HUD_OPTION_KEYS.indexOf('interaction'))",
    );
    assert.ok(interactionOption >= 0);
    const interactionCheckbox = page.locator('#hud-options input[type="checkbox"]').nth(interactionOption);
    // The prompt oracle requires player-enabled hints, not a particular HUD default.
    if (!(await interactionCheckbox.isChecked())) {
      await uiClick(interactionCheckbox);
    }
    assert.equal(await interactionCheckbox.isChecked(), true);
    const handlingOption = await page.evaluate(
      "import('/src/ui/hudOptions.ts').then(({ HUD_OPTION_KEYS }) => HUD_OPTION_KEYS.indexOf('handling'))",
    );
    assert.ok(handlingOption >= 0);
    const handlingCheckbox = page.locator('#hud-options input[type="checkbox"]').nth(handlingOption);
    if (await handlingCheckbox.isChecked()) {
      await uiClick(handlingCheckbox);
    }
    assert.equal(await handlingCheckbox.isChecked(), false);
    await pressAction(page, 'ui.main-menu-toggle');
    const crouchBeforeToggle = await page.evaluate(() => globalThis.readingWitness.session.crouching);
    await pressAction(page, 'player.crouch-toggle');
    await page.waitForFunction(
      (crouchingAtDispatch) => globalThis.readingWitness.session.crouching !== crouchingAtDispatch,
      crouchBeforeToggle,
    );
    await pressAction(page, 'player.crouch-toggle');
    await page.waitForFunction(
      (crouchingAtDispatch) => globalThis.readingWitness.session.crouching === crouchingAtDispatch,
      crouchBeforeToggle,
    );
    const walk = async (actionId, targetX, increasing) => {
      const from = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
      const release = await holdInputAction(page, actionId);
      try {
        await waitForSimulation(
          page,
          ({ x, up }) => {
            const { session, body } = globalThis.readingWitness;
            return {
              time: session.sim.time,
              paused: session.sim.paused,
              reached: up ? body.pos[0] >= x : body.pos[0] <= x,
            };
          },
          { x: targetX, up: increasing },
          {
            seconds: 10,
            from,
            label: `walk ${actionId} to ${targetX}`,
            record,
            stop: release,
          },
        );
      } finally {
        await release();
      }
    };
    const startX = await page.evaluate(() => globalThis.readingWitness.body.pos[0]);
    await walk('movement.forward', startX + 10, true);
    const aim = async (type) => {
      const target = await page.evaluate((id) => {
        const { engine, input, eye } = globalThis.readingWitness;
        const entity = [...engine.entities.all].find((value) => value.type === id);
        const at = entity.pos.map((value, axis) => value + entity.size[axis] / 2);
        const origin = eye();
        const [dx, dy, dz] = at.map((value, axis) => value - origin[axis]);
        input.yaw = Math.atan2(-dx, -dz);
        input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        return { pos: entity.pos, size: entity.size, origin, aim: [dx, dy, dz], yaw: input.yaw, pitch: input.pitch };
      }, type);
      await record(`aim ${type}`);
      const hit = await page.evaluate(() => globalThis.readingWitness.lookedAt()?.type);
      assert.equal(hit, type, JSON.stringify({ target, hit }));
    };
    const chairApproachX = await page.evaluate(() => {
      const { engine } = globalThis.readingWitness;
      const chair = [...engine.entities.all].find((entity) => entity.type === 'chair');
      if (!chair) {
        throw new Error('test house has no restable chair');
      }
      return chair.pos[0] - 2;
    });
    await walk('movement.forward', chairApproachX, true);
    await aim('chair');
    const chairUid = await page.evaluate(() => globalThis.readingWitness.lookedAt().uid);
    const interruptRest = async (label) => {
      const from = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
      await page.evaluate(() => globalThis.readingWitness.session.sim.hurt(1, 'rest continuation fixture'));
      await waitForSimulation(
        page,
        () => {
          const { session } = globalThis.readingWitness;
          return {
            time: session.sim.time,
            paused: session.sim.paused,
            reached: session.sim.compression.interruption !== undefined,
          };
        },
        undefined,
        { seconds: 5, from, label, record },
      );
    };
    assert.ok(await page.evaluate(() => globalThis.readingWitness.session.sim.needs.fatigue > 0));
    await pressAction(page, 'world.interact');
    await page.waitForFunction((uid) => {
      const { session } = globalThis.readingWitness;
      return session.rest.action?.kind === 'rest' && session.rest.action.furnitureUid === uid;
    }, chairUid);
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.sim.compression.active), true);
    const crouchingDuringRest = await page.evaluate(() => globalThis.readingWitness.session.crouching);
    const crouchGuardStart = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
    await pressAction(page, 'player.crouch-toggle');
    await waitForSimulation(
      page,
      (until) => {
        const { session } = globalThis.readingWitness;
        return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time >= until };
      },
      crouchGuardStart + 0.1,
      {
        seconds: 0.1,
        from: crouchGuardStart,
        label: 'rest keeps the crouch action locked through simulated progress',
        record,
      },
    );
    assert.equal(
      await page.evaluate(() => globalThis.readingWitness.session.crouching),
      crouchingDuringRest,
      'long-action lock suppresses the crouch action',
    );
    await interruptRest('rest stop interruption');
    await pressAction(page, 'handling.stop');
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.rest.action), undefined);
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.sim.compression.interruption), undefined);
    await pressAction(page, 'world.interact');
    await page.waitForFunction((uid) => {
      const { session } = globalThis.readingWitness;
      return session.rest.action?.kind === 'rest' && session.rest.action.furnitureUid === uid;
    }, chairUid);
    await interruptRest('rest continue interruption');
    await pressAction(page, 'compression.continue');
    await page.waitForFunction((uid) => {
      const { session } = globalThis.readingWitness;
      return (
        session.sim.compression.active &&
        session.sim.compression.interruption === undefined &&
        session.rest.action?.furnitureUid === uid
      );
    }, chairUid);
    await pressAction(page, 'handling.stop');
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.rest.action), undefined);
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.sim.compression.active), false);
    const rampFrom = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
    await waitForSimulation(
      page,
      () => {
        const { sim } = globalThis.readingWitness.session;
        return { time: sim.time, paused: sim.paused, reached: !sim.compression.locksInput };
      },
      undefined,
      { seconds: 5, from: rampFrom, label: 'rest cancellation returns input at normal speed', record },
    );
    const bedUid = await page.evaluate(() => {
      const { body, engine } = globalThis.readingWitness;
      const furniture = [...engine.entities.registry.furniture.values()].find((value) => value.rest?.sleep);
      if (!furniture) {
        throw new Error('Sleep input fixture has no sleepable furniture');
      }
      const entity = engine.entities.add({
        type: furniture.id,
        pos: [Math.floor(body.pos[0]) + 2, Math.floor(body.pos[1]), Math.floor(body.pos[2]) + 1],
        size: furniture.size,
        facing: 'n',
      });
      if (!entity) {
        throw new Error('Could not place the sleep input fixture');
      }
      return entity.uid;
    });
    const sleepRefusal = await page.evaluate((uid) => {
      const { session } = globalThis.readingWitness;
      return session.rest.start('sleep', uid);
    }, bedUid);
    assert.equal(sleepRefusal, undefined);
    await page.waitForFunction((uid) => {
      const { session } = globalThis.readingWitness;
      return session.rest.action?.kind === 'sleep' && session.rest.action.furnitureUid === uid;
    }, bedUid);
    const sleeping = await page.evaluate(() => {
      const { body, session } = globalThis.readingWitness;
      return { position: [...body.pos], time: session.sim.time };
    });
    await pressAction(page, 'world.interact');
    await pressAction(page, 'handling.stop');
    await holdAction('movement.forward', () =>
      waitForSimulation(
        page,
        (until) => {
          const { session } = globalThis.readingWitness;
          return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time >= until };
        },
        sleeping.time + 0.5,
        { seconds: 2, from: sleeping.time, label: 'sleep ignores movement and stop keys', record },
      ),
    );
    const stillSleeping = await page.evaluate(() => {
      const { body, session } = globalThis.readingWitness;
      return {
        position: [...body.pos],
        active: session.sim.compression.active,
        action: session.rest.action?.kind,
      };
    });
    assert.deepEqual(stillSleeping.position, sleeping.position);
    assert.equal(stillSleeping.active, true);
    assert.equal(stillSleeping.action, 'sleep');
    const wakeStart = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
    await page.evaluate(() => globalThis.readingWitness.session.sim.hurt(1, 'sleep interruption fixture'));
    await waitForSimulation(
      page,
      () => {
        const { session } = globalThis.readingWitness;
        return {
          time: session.sim.time,
          paused: session.sim.paused,
          reached:
            session.rest.action === undefined &&
            !session.sim.compression.active &&
            session.sim.compression.interruption === undefined &&
            !session.sim.compression.locksInput,
        };
      },
      undefined,
      { seconds: 5, from: wakeStart, label: 'an interruption wakes the player from sleep', record },
    );
    const awakened = await page.evaluate(() => {
      const { session } = globalThis.readingWitness;
      return {
        action: session.rest.action,
        active: session.sim.compression.active,
        interruption: session.sim.compression.interruption,
        locksInput: session.sim.compression.locksInput,
      };
    });
    assert.equal(awakened.action, undefined);
    assert.equal(awakened.active, false);
    assert.equal(awakened.interruption, undefined);
    assert.equal(awakened.locksInput, false);
    await page.evaluate(() => {
      globalThis.readingWitness.input.yaw = -Math.PI / 2;
      globalThis.readingWitness.input.pitch = 0;
    });
    // A walk ends when the stage releases the key, a wall-clock-dependent time after its condition holds, so it
    // overshoots. Stopping abreast of the crate keeps any overshoot inside use reach.
    const crateX = await page.evaluate(() => {
      const crate = [...globalThis.readingWitness.engine.entities.all].find((entity) => entity.type === 'crate');
      return crate.pos[0] + crate.size[0] / 2;
    });
    await walk('movement.back', crateX, false);
    await aim('crate');
    const searchStart = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
    const interactLabel = await page.evaluate(
      "import('/src/game/inputBindings.ts').then(({ inputBindings }) => inputBindings.label('world.interact'))",
    );
    await page.waitForFunction((label) => document.querySelector('#prompt').textContent.includes(label), interactLabel);
    await pressAction(page, 'world.interact');
    await waitForSimulation(
      page,
      () => {
        const { session } = globalThis.readingWitness;
        return {
          time: session.sim.time,
          paused: session.sim.paused,
          reached: [...session.inventory.entities.all].some((entity) => entity.type === 'crate' && entity.searched),
        };
      },
      undefined,
      { seconds: 5, from: searchStart, label: 'crate search (2.25 simulated seconds)', record },
    );
    assert.equal(await page.evaluate(() => globalThis.readingWitness.screen.isOpen), true);
    const note = page.locator('.inv-item').filter({ hasText: 'Placeholder note' });
    await note.waitFor();
    const noteRowUid = Number(await note.getAttribute('data-uid'));
    const itemCount = await page.evaluate(() => globalThis.readingWitness.screen.order.length);
    for (let step = 0; step < itemCount; step += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: selection must advance through the real keyboard action one row at a time.
      const selectedUid = await page.evaluate(() => globalThis.readingWitness.screen.selected?.uid);
      if (selectedUid === noteRowUid) {
        break;
      }
      await pressAction(page, 'inventory.next');
      await page.waitForFunction(
        (previousUid) => globalThis.readingWitness.screen.selected?.uid !== previousUid,
        selectedUid,
      );
    }
    assert.equal(
      await page.evaluate(() => globalThis.readingWitness.screen.selected?.uid),
      noteRowUid,
      'keyboard selection reaches the note row',
    );
    await page.waitForFunction((uid) => {
      const row = [...document.querySelectorAll('.inv-item[data-uid]')].find(
        (candidate) => candidate.dataset.uid === String(uid),
      );
      if (!row?.getClientRects().length) {
        return false;
      }
      const rect = row.getBoundingClientRect();
      const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      if (!(centre.x >= 0 && centre.x < innerWidth && centre.y >= 0 && centre.y < innerHeight)) {
        return false;
      }
      for (let parent = row.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clipsX = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX);
        const clipsY = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY);
        if (!(clipsX || clipsY)) {
          continue;
        }
        const bounds = parent.getBoundingClientRect();
        const left = bounds.left + parent.clientLeft;
        const top = bounds.top + parent.clientTop;
        const right = left + parent.clientWidth;
        const bottom = top + parent.clientHeight;
        if (
          (clipsX && !(centre.x >= left && centre.x <= right)) ||
          (clipsY && !(centre.y >= top && centre.y <= bottom))
        ) {
          return false;
        }
      }
      return document.elementFromPoint(centre.x, centre.y)?.closest('.inv-item') === row;
    }, noteRowUid);
    const noteLayout = await note.evaluate((row) => {
      const rect = row.getBoundingClientRect();
      const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const clips = [];
      for (let parent = row.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clipsX = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX);
        const clipsY = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY);
        if (!(clipsX || clipsY)) {
          continue;
        }
        const bounds = parent.getBoundingClientRect();
        const left = bounds.left + parent.clientLeft;
        const top = bounds.top + parent.clientTop;
        const right = left + parent.clientWidth;
        const bottom = top + parent.clientHeight;
        clips.push({
          className: String(parent.className),
          bounds: { left, top, right, bottom },
          scroll: {
            left: parent.scrollLeft,
            top: parent.scrollTop,
            width: parent.scrollWidth,
            height: parent.scrollHeight,
          },
          containsCentre:
            (!clipsX || (centre.x >= left && centre.x <= right)) &&
            (!clipsY || (centre.y >= top && centre.y <= bottom)),
        });
      }
      const hit = document.elementFromPoint(centre.x, centre.y);
      return {
        row: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        viewport: { width: innerWidth, height: innerHeight },
        centreInViewport: centre.x >= 0 && centre.x < innerWidth && centre.y >= 0 && centre.y < innerHeight,
        clips,
        hit: hit && { tag: hit.tagName, className: String(hit.className) },
        hitIsRow: hit?.closest('.inv-item') === row,
      };
    });
    assert.ok(
      noteLayout.centreInViewport && noteLayout.clips.every((clip) => clip.containsCentre) && noteLayout.hitIsRow,
      `note row must be visible and topmost at its centre: ${JSON.stringify(noteLayout)}`,
    );
    await uiClick(note);
    const noteSelection = await page.evaluate(() => {
      const { input, screen } = globalThis.readingWitness;
      const target = document.elementFromPoint(input.cursorX, input.cursorY);
      return {
        selected: screen.selected?.type,
        target: target && { tag: target.tagName, className: String(target.className), text: target.textContent },
      };
    });
    assert.equal(noteSelection.selected, 'sample_note', `pointer selected the note: ${JSON.stringify(noteSelection)}`);
    const handStart = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
    await pressAction(page, 'inventory.hands');
    await waitForSimulation(
      page,
      () => {
        const { session } = globalThis.readingWitness;
        return {
          time: session.sim.time,
          paused: session.sim.paused,
          reached: Object.values(session.inventory.hands).some((item) => item?.type === 'sample_note'),
        };
      },
      undefined,
      { seconds: 5, from: handStart, label: 'note to hand', record },
    );
    const noteUid = await page.evaluate(
      () =>
        Object.values(globalThis.readingWitness.session.inventory.hands).find((item) => item?.type === 'sample_note')
          .uid,
    );
    await pressAction(page, 'quickbar.assign.1');
    const assignedUid = await page.evaluate((uid) => {
      const { session } = globalThis.readingWitness;
      if (session.quickbar.slots[0] !== uid) {
        session.frame(1 / 60);
      }
      return session.quickbar.slots[0];
    }, noteUid);
    assert.equal(assignedUid, noteUid, 'quickbar assignment is applied at the next player tick');
    await pressAction(page, 'ui.inventory-toggle');
    assert.equal(await page.evaluate(() => globalThis.readingWitness.screen.isOpen), false);
    // Observe the real pre-open focus, never manufacture a focus for the restore assertion.
    const previousFocus = await page.evaluateHandle(() => document.activeElement);
    await holdAction('quickbar.use.1', () => page.locator('#reading').waitFor({ state: 'visible' }));
    assert.equal(await page.locator('#reading h1').innerText(), 'Placeholder — a folded note');
    assert.ok((await page.locator('.reading-text').innerText()).includes('NOT PLAYTEST LORE'));
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'dialog');
    const itemState = () =>
      page.evaluate(() => {
        const { session, input, body, reading, readCalls } = globalThis.readingWitness;
        const item = Object.values(session.inventory.hands).find((value) => value?.type === 'sample_note');
        return {
          time: session.sim.time,
          position: [...body.pos],
          walking: input.walking,
          uid: item.uid,
          count: item.count,
          open: reading.isOpen,
          jobs: session.queue.jobs.length,
          readCalls,
        };
      });
    const before = await itemState();
    await pressAction(page, 'quickbar.use.1');
    await pressAction(page, 'hand.use-off');
    await uiClick(page.locator('.reading-text'));
    await pressAction(page, 'movement.walk-toggle');
    await pressAction(page, 'firearm.reload');
    await holdAction('movement.forward', () =>
      waitForSimulation(
        page,
        (until) => {
          const { session } = globalThis.readingWitness;
          return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time >= until };
        },
        before.time + 0.5,
        { seconds: 2, from: before.time, label: 'live world while reading', record },
      ),
    );
    const during = await itemState();
    assert.ok(during.time >= before.time + 0.5);
    assert.deepEqual([during.position[0], during.position[2]], [before.position[0], before.position[2]]);
    for (const field of ['walking', 'uid', 'count', 'readCalls']) {
      assert.equal(during[field], before[field]);
    }
    assert.equal(during.jobs, 0);
    assert.equal(during.open, true);
    await page.screenshot({ path: resolve(artifacts, 'note-reading.png') });
    await pressAction(page, 'reading.close');
    assert.equal(await page.locator('#reading').isVisible(), false);
    assert.equal(await page.evaluate(() => globalThis.readingWitness.screen.isOpen), false);
    assert.equal(await previousFocus.evaluate((element) => element === document.activeElement), true);
    await previousFocus.dispose();
    const readingBook = await page.evaluate(() => {
      const { session } = globalThis.readingWitness;
      const bookDefinition = [...session.inventory.registry.items.entries()].find(
        ([, definition]) => definition.book && definition.readable,
      );
      if (!bookDefinition) {
        throw new Error('No readable book definition is available for the reading fixture');
      }
      const book = session.inventory.create(bookDefinition[0]);
      if (!session.inventory.add(book, { kind: 'hand', side: 'left' })) {
        throw new Error('Could not place the reading fixture in a free hand');
      }
      return { uid: book.uid, name: session.inventory.name(book) };
    });
    await pressAction(page, 'ui.inventory-toggle');
    const bookRow = page.locator(`.inv-item[data-uid="${readingBook.uid}"]`);
    await bookRow.waitFor({ state: 'visible' });
    await uiClick(bookRow);
    await pressAction(page, 'quickbar.assign.2');
    await page.waitForFunction((uid) => globalThis.readingWitness.session.quickbar.slots[1] === uid, readingBook.uid);
    await pressAction(page, 'ui.inventory-toggle');
    await holdAction('quickbar.use.2', () => page.locator('#reading').waitFor({ state: 'visible' }));
    const advanceReading = async () => {
      const beforeTime = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
      await waitForSimulation(
        page,
        (until) => {
          const { session } = globalThis.readingWitness;
          return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time >= until };
        },
        beforeTime + 0.2,
        { seconds: 3, from: beforeTime, label: 'book reading progress', record },
      );
    };
    const readProgress = () =>
      page.evaluate(() => {
        const { value, max } = document.querySelector('.reading-progress') ?? {};
        const { job } = globalThis.readingWitness.session.sim.actions;
        return {
          value,
          max,
          elapsed: job?.jobType === 'reading' ? job.elapsed : undefined,
          duration: job?.jobType === 'reading' ? job.duration : undefined,
          stopped: job?.stopped,
        };
      });
    await page.locator('.reading-progress').waitFor({ state: 'visible' });
    const whenOpened = await readProgress();
    await advanceReading();
    const beforeClose = await readProgress();
    assert.ok(whenOpened.value !== undefined && beforeClose.value !== undefined);
    assert.ok(beforeClose.value > whenOpened.value, JSON.stringify({ whenOpened, beforeClose }));
    assert.ok(beforeClose.max !== undefined && beforeClose.max > beforeClose.value);
    assert.ok(beforeClose.elapsed !== undefined);
    assert.equal(beforeClose.max, beforeClose.duration);
    await pressAction(page, 'reading.close');
    assert.equal(await page.locator('#reading').isVisible(), false);
    const stoppedOnClose = await readProgress();
    assert.equal(stoppedOnClose.stopped, true);
    assert.ok(stoppedOnClose.elapsed >= beforeClose.value);
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.sim.compression.locksInput), false);
    try {
      await holdAction('quickbar.use.2', () => page.locator('#reading').waitFor({ state: 'visible' }));
    } catch (error) {
      const state = await page.evaluate((uid) => {
        const { session, input, screen, reading, mainMenuOpen } = globalThis.readingWitness;
        return {
          bookLocation: session.inventory.locate(session.inventory.itemByUid(uid)),
          quickbar: [...session.quickbar.slots],
          job: session.sim.actions.job,
          queue: session.queue.jobs,
          readingOpen: reading.isOpen,
          mainMenuOpen,
          paused: session.sim.paused,
          locked: input.locked,
          inventoryOpen: screen.isOpen,
          notice: document.body.innerText.slice(-500),
        };
      }, readingBook.uid);
      throw new Error(`Could not reopen the same book after closing it: ${JSON.stringify(state)}`, { cause: error });
    }
    const reopened = await readProgress();
    assert.ok(reopened.elapsed >= stoppedOnClose.elapsed);
    assert.ok(reopened.value >= stoppedOnClose.elapsed);
    // Face along the clear lane before walking away, not at the crate the last aim chose: the walk's length
    // depends on when the stage releases the key, and the walk to the sign must start on the lane.
    await page.evaluate(() => {
      globalThis.readingWitness.input.yaw = -Math.PI / 2;
      globalThis.readingWitness.input.pitch = 0;
    });
    const beforeMove = await page.evaluate(() => ({
      position: [...globalThis.readingWitness.body.pos],
      time: globalThis.readingWitness.session.sim.time,
    }));
    await holdAction('movement.forward', async () => {
      await page.waitForFunction(() => document.querySelector('#reading').hidden);
      await waitForSimulation(
        page,
        (until) => {
          const { session } = globalThis.readingWitness;
          return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time >= until };
        },
        beforeMove.time + 0.2,
        { seconds: 3, from: beforeMove.time, label: 'walking away from reading', record },
      );
    });
    const afterMove = await page.evaluate(() => ({
      position: [...globalThis.readingWitness.body.pos],
      stopped: globalThis.readingWitness.session.sim.actions.job?.stopped,
      compression: globalThis.readingWitness.session.sim.compression.active,
    }));
    assert.ok(
      Math.hypot(afterMove.position[0] - beforeMove.position[0], afterMove.position[2] - beforeMove.position[2]) > 0.01,
    );
    assert.equal(afterMove.stopped, true);
    assert.equal(afterMove.compression, false);
    const signX = await page.evaluate(() => {
      const sign = [...globalThis.readingWitness.engine.entities.all].find((entity) => entity.type === 'sample_sign');
      return sign.pos[0] + sign.size[0] / 2;
    });
    await walk('movement.back', signX, false);
    await aim('sample_sign');
    await pressAction(page, 'world.interact');
    await page.locator('#reading').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#reading h1').innerText(), 'Placeholder — a wooden sign');
    await pressAction(page, 'ui.main-menu-toggle');
    await page.waitForFunction(() => globalThis.readingWitness.session.sim.paused);
    const menu = await record('pause while reading');
    assert.equal(menu.readingOpen, false);
    assert.equal(menu.paused, true);
    assert.equal(menu.inventoryOpen, false);
    assert.equal(menu.menuPointer, true);
    assert.deepEqual(menu.jobs, []);
    assert.equal(await page.locator('#reading').isVisible(), false);
    await pressAction(page, 'ui.main-menu-toggle');
    await page.waitForFunction(() => !globalThis.readingWitness.session.sim.paused);
    const pageResumed = await record('resume with reading hidden');
    assert.equal(pageResumed.readingOpen, false);
    assert.equal(pageResumed.menuPointer, false);
    assert.equal(await page.locator('#reading').isVisible(), false);
    // A hidden reading surface must not capture F after resume.
    await pressAction(page, 'world.interact');
    await page.locator('#reading').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#reading h1').innerText(), 'Placeholder — a wooden sign');
    await page.screenshot({ path: resolve(artifacts, 'sign-reading.png') });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#reading').isVisible(), false);
    const escaped = await page.evaluate(() => ({
      locked: globalThis.readingWitness.input.locked,
      overlayHidden: document.querySelector('#overlay').hidden,
    }));
    assert.equal(escaped.overlayHidden, escaped.locked);
    proof = { before, during, escaped, menu, resumed: pageResumed };
  } else {
    // Pure view fixture: no pickup/handling/movement claimed here.
    const marker = 'END-OF-READING';
    await page.evaluate(
      (end) =>
        globalThis.readingWitness.reading.open({
          title: 'T'.repeat(120),
          text:
            ('long'.repeat(1000) + '\n\nPaper paragraph & literal entity &copy;.\n\n'.repeat(400)).slice(
              0,
              12_000 - end.length,
            ) + end,
        }),
      marker,
    );
    const sizes = [];
    const checkSize = async (viewport) => {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const paper = document.querySelector('.reading-paper');
        const text = document.querySelector('.reading-text');
        const button = paper.querySelector('button');
        const box = paper.getBoundingClientRect();
        const putAway = button.getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          buttonBottom: putAway.bottom,
          font: Number.parseFloat(getComputedStyle(text).fontSize),
          client: text.clientHeight,
          scroll: text.scrollHeight,
          horizontal: text.scrollWidth > text.clientWidth,
          text: text.textContent,
        };
      });
      assert.ok(
        layout.left >= 0 && layout.right <= layout.width && layout.top >= 0 && layout.bottom <= layout.height,
        JSON.stringify(layout),
      );
      assert.ok(layout.buttonBottom <= layout.height);
      assert.ok(layout.font >= 18);
      assert.ok(layout.client >= 64 && layout.scroll > layout.client);
      assert.equal(layout.horizontal, false);
      assert.equal(layout.text.length, 12_000);
      assert.ok(layout.text.includes('&copy;'));
      assert.equal(await page.locator('.reading-text img').count(), 0);
      sizes.push({ ...layout, text: undefined });
      await page.screenshot({ path: resolve(artifacts, `reading-${viewport.width}x${viewport.height}.png`) });
    };
    await checkSize({ width: 360, height: 640 });
    await checkSize({ width: 800, height: 600 });
    await pressAction(page, 'reading.first');
    await pressAction(page, 'reading.page-down');
    assert.ok(await page.locator('.reading-text').evaluate((text) => text.scrollTop > 0));
    await pressAction(page, 'reading.first');
    const textBox = await page.locator('.reading-text').boundingBox();
    await page.evaluate(
      ({ x, y }) => {
        globalThis.readingWitness.input.cursorX = x;
        globalThis.readingWitness.input.cursorY = y;
      },
      { x: textBox.x + textBox.width / 2, y: textBox.y + textBox.height / 2 },
    );
    await page.mouse.wheel(0, 200);
    await page.waitForFunction(() => document.querySelector('.reading-text').scrollTop > 0);
    await pressAction(page, 'reading.last');
    const endVisible = await page.locator('.reading-text').evaluate((text, end) => {
      const node = document.createTreeWalker(text, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(node, node.textContent.length - end.length);
      range.setEnd(node, node.textContent.length);
      const last = range.getBoundingClientRect();
      const box = text.getBoundingClientRect();
      return last.top >= box.top && last.bottom <= box.bottom + 1;
    }, marker);
    assert.equal(endVisible, true);
    await uiClick(page.getByRole('button', { name: 'Put away reading' }));
    assert.equal(await page.locator('#reading').isVisible(), false);
    await page.evaluate(() =>
      globalThis.readingWitness.reading.open({ title: 'Main menu close', text: 'Placeholder' }),
    );
    await pressAction(page, 'ui.main-menu-toggle');
    assert.equal(await page.locator('#reading').isVisible(), false);
    assert.equal(await page.locator('#overlay').isVisible(), true);
    await pressAction(page, 'ui.main-menu-toggle');
    await page.waitForFunction(() => globalThis.readingWitness.input.locked);
    await page.evaluate(() => globalThis.readingWitness.reading.open({ title: 'Pointer loss', text: 'Placeholder' }));
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(
      () => !(globalThis.readingWitness.input.locked || globalThis.readingWitness.reading.isOpen),
    );
    assert.equal(await page.locator('#overlay').isVisible(), true);
    await page.locator('#go').click();
    await page.waitForFunction(() => globalThis.readingWitness.input.locked);
    await page.evaluate(() => {
      globalThis.readingWitness.reading.open({ title: 'Death closes paper', text: 'Placeholder' });
      globalThis.readingWitness.session.sim.hurt(9999, 'reading browser fixture');
    });
    await page.locator('#death').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#reading').isVisible(), false);
    proof = { sizes, endVisible };
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(artifacts, 'result.json'), JSON.stringify({ mode, ...proof, states, errors }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}
