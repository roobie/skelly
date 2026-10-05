// biome-ignore-all lint/correctness/noNodejsModules: maintained standalone Vite/Chrome contract.
// biome-ignore-all lint/style/noProcessEnv: runner supplies executable and artifact destination.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative consumer/presentation assertions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { dispatchMenuPointerClick, dispatchMenuPointerMove } from './menu-pointer.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageArgs, browserStageUrl } from './stage-mode.mjs';

const { chromium } = await import('playwright');
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
        const marker = 'startPlayFrames(frame);';
        assert.equal(code.split(marker).length, 2);
        return code.replace(
          marker,
          `let proofReadCalls=0; const proofOpen=reading.open; reading.open=(value)=>{proofReadCalls++;proofOpen(value);}; Object.assign(globalThis,{readingWitness:{engine,session,input,body,screen,reading,eye,lookedAt,useTarget,playKeys,get readCalls(){return proofReadCalls;},get mainMenuOpen(){return mainMenuOpen;}}});\n${marker}`,
        );
      },
    },
  ],
});
let browser;
try {
  await vite.listen();
  const { port } = vite.httpServer.address();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    headless: true,
    args: browserStageArgs('reading'),
  });
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
  );
  await page.waitForFunction(
    () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
    undefined,
    {
      timeout: 60_000,
    },
  );
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
  let proof;
  if (mode === 'consumer') {
    const walk = async (key, targetX, increasing) => {
      const from = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
      await page.keyboard.down(key);
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
          { seconds: 10, from, label: `walk ${key} to ${targetX}`, record, stop: () => page.keyboard.up(key) },
        );
      } finally {
        await page.keyboard.up(key);
      }
    };
    const startX = await page.evaluate(() => globalThis.readingWitness.body.pos[0]);
    await walk('w', startX + 10, true);
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
    await walk('w', chairApproachX, true);
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
    await page.keyboard.press('f');
    await page.waitForFunction((uid) => {
      const { session } = globalThis.readingWitness;
      return session.rest.action?.kind === 'rest' && session.rest.action.furnitureUid === uid;
    }, chairUid);
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.sim.compression.active), true);
    await interruptRest('rest stop interruption');
    await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.rest.action), undefined);
    assert.equal(await page.evaluate(() => globalThis.readingWitness.session.sim.compression.interruption), undefined);
    await page.keyboard.press('f');
    await page.waitForFunction((uid) => {
      const { session } = globalThis.readingWitness;
      return session.rest.action?.kind === 'rest' && session.rest.action.furnitureUid === uid;
    }, chairUid);
    await interruptRest('rest continue interruption');
    await page.keyboard.press('c');
    await page.waitForFunction((uid) => {
      const { session } = globalThis.readingWitness;
      return (
        session.sim.compression.active &&
        session.sim.compression.interruption === undefined &&
        session.rest.action?.furnitureUid === uid
      );
    }, chairUid);
    await page.keyboard.press('f');
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
    await page.evaluate((uid) => {
      const { engine, useTarget, playKeys } = globalThis.readingWitness;
      const furniture = engine.entities.byUid(uid);
      if (!furniture) {
        throw new Error('Sleep input fixture disappeared');
      }
      useTarget(furniture); // F on the anchor does not end sleep.
      playKeys('KeyX'); // X does not end sleep.
    }, bedUid);
    const sleeping = await page.evaluate(() => {
      const { body, session } = globalThis.readingWitness;
      return { position: [...body.pos], time: session.sim.time };
    });
    await page.keyboard.press('f');
    await page.keyboard.press('x');
    await page.keyboard.down('w');
    try {
      await waitForSimulation(
        page,
        (until) => {
          const { session } = globalThis.readingWitness;
          return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time >= until };
        },
        sleeping.time + 0.5,
        { seconds: 2, from: sleeping.time, label: 'sleep ignores movement and stop keys', record },
      );
    } finally {
      await page.keyboard.up('w');
    }
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
    await walk('s', startX + 10, false);
    await aim('crate');
    const searchStart = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
    await page.keyboard.press('f');
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
    await uiClick(note);
    const handStart = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
    await page.keyboard.press('h');
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
    await page.keyboard.press('1');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => globalThis.readingWitness.screen.isOpen), false);
    // Observe the real pre-open focus, never manufacture a focus for the restore assertion.
    const previousFocus = await page.evaluateHandle(() => document.activeElement);
    await page.keyboard.down('1');
    await page.locator('#reading').waitFor({ state: 'visible' });
    await page.keyboard.up('1');
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
    await page.keyboard.press('1');
    await page.keyboard.press('=');
    await uiClick(page.locator('.reading-text'));
    await page.keyboard.press('z');
    await page.keyboard.press('r');
    await page.keyboard.down('w');
    try {
      await waitForSimulation(
        page,
        (until) => {
          const { session } = globalThis.readingWitness;
          return { time: session.sim.time, paused: session.sim.paused, reached: session.sim.time >= until };
        },
        before.time + 0.5,
        { seconds: 2, from: before.time, label: 'live world while reading', record },
      );
    } finally {
      await page.keyboard.up('w');
    }
    const during = await itemState();
    assert.ok(during.time >= before.time + 0.5);
    assert.deepEqual([during.position[0], during.position[2]], [before.position[0], before.position[2]]);
    for (const field of ['walking', 'uid', 'count', 'readCalls']) {
      assert.equal(during[field], before[field]);
    }
    assert.equal(during.jobs, 0);
    assert.equal(during.open, true);
    await page.screenshot({ path: resolve(artifacts, 'note-reading.png') });
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#reading').isVisible(), false);
    assert.equal(await page.evaluate(() => globalThis.readingWitness.screen.isOpen), false);
    assert.equal(await previousFocus.evaluate((element) => element === document.activeElement), true);
    await previousFocus.dispose();
    await page.evaluate(() => {
      globalThis.readingWitness.input.yaw = -Math.PI / 2;
      globalThis.readingWitness.input.pitch = 0;
    });
    const signX = await page.evaluate(() => {
      const sign = [...globalThis.readingWitness.engine.entities.all].find((entity) => entity.type === 'sample_sign');
      return sign.pos[0] + sign.size[0] / 2;
    });
    await walk('s', signX, false);
    await aim('sample_sign');
    await page.keyboard.press('f');
    await page.locator('#reading').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#reading h1').innerText(), 'Placeholder — a wooden sign');
    await page.keyboard.press('F9');
    await page.waitForFunction(() => globalThis.readingWitness.session.sim.paused);
    const menu = await record('pause while reading');
    assert.equal(menu.readingOpen, false);
    assert.equal(menu.paused, true);
    assert.equal(menu.inventoryOpen, false);
    assert.equal(menu.menuPointer, true);
    assert.deepEqual(menu.jobs, []);
    assert.equal(await page.locator('#reading').isVisible(), false);
    await page.keyboard.press('F9');
    await page.waitForFunction(() => !globalThis.readingWitness.session.sim.paused);
    const resumed = await record('resume with reading hidden');
    assert.equal(resumed.readingOpen, false);
    assert.equal(resumed.menuPointer, false);
    assert.equal(await page.locator('#reading').isVisible(), false);
    // A hidden reading surface must not capture F after resume.
    await page.keyboard.press('f');
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
    proof = { before, during, escaped, menu, resumed };
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
    await page.keyboard.press('Home');
    await page.keyboard.press('PageDown');
    assert.ok(await page.locator('.reading-text').evaluate((text) => text.scrollTop > 0));
    await page.keyboard.press('Home');
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
    await page.keyboard.press('End');
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
    await page.keyboard.press('F9');
    assert.equal(await page.locator('#reading').isVisible(), false);
    assert.equal(await page.locator('#overlay').isVisible(), true);
    await page.keyboard.press('F9');
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
