// biome-ignore-all lint/correctness/noNodejsModules: maintained standalone Vite/Chrome contract.
// biome-ignore-all lint/style/noProcessEnv: runner supplies executable and artifact destination.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative consumer/presentation assertions.
// biome-ignore-all lint/correctness/noUnresolvedImports: page-evaluated imports address Vite URLs, not Node files.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { pressAction } from './input-actions.mjs';
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
          `let proofReadCalls=0; const proofOpen=reading.open; reading.open=(value)=>{proofReadCalls++;proofOpen(value);}; Object.assign(globalThis,{readingWitness:{engine,session,input,body,screen,reading,eye,lookedAt,get readCalls(){return proofReadCalls;},get mainMenuOpen(){return mainMenuOpen;}}});\n${marker}`,
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
  if (mode === 'consumer') {
    await page.locator('.input-options > summary').click();
    await page.locator('[data-binding-id="world.interact"] button').click();
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(
      async () =>
        (await import('/src/game/inputBindings.ts')).inputBindings.chords('world.interact')[0].code === 'KeyJ',
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
      undefined,
      { timeout: 60_000 },
    );
    assert.equal(
      await page.evaluate(
        async () => (await import('/src/game/inputBindings.ts')).inputBindings.chords('world.interact')[0].code,
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
        clickTrace: globalThis.readingClickTrace ?? [],
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
    await aim('crate');
    const searchStart = await page.evaluate(() => globalThis.readingWitness.session.sim.time);
    const interactLabel = await page.evaluate(async () =>
      (await import('/src/game/inputBindings.ts')).inputBindings.label('world.interact'),
    );
    await page.waitForFunction(
      (label) => document.querySelector('#prompt').textContent.startsWith(`${label}: `),
      interactLabel,
    );
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
    await uiClick(note);
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
    await page.keyboard.press('1');
    const readButton = page.getByRole('button', { name: /^Read/ });
    await readButton.waitFor();
    // Observe the real pre-click focus, never manufacture a focus for the restore assertion.
    const previousFocus = await page.evaluateHandle(() => document.activeElement);
    await page.evaluate(() => {
      globalThis.readingClickTrace = [];
      for (const type of ['pointerdown', 'pointerup', 'click']) {
        document.addEventListener(
          type,
          (event) => {
            const { input, reading } = globalThis.readingWitness;
            const target = document.elementFromPoint(input.cursorX, input.cursorY);
            globalThis.readingClickTrace.push({
              type,
              trusted: event.isTrusted,
              target: target?.textContent?.trim().slice(0, 80),
              cursor: [input.cursorX, input.cursorY],
              readingOpen: reading.isOpen,
            });
          },
          true,
        );
      }
    });
    await record('before Read click');
    await uiClick(readButton);
    await record('after Read click');
    try {
      await page.locator('#reading').waitFor({ state: 'visible' });
    } catch (error) {
      await record(`Read click failure: ${error}`);
      await page.screenshot({ path: resolve(artifacts, 'read-click-failure.png') });
      throw error;
    }
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
    await page.keyboard.press('u');
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
    assert.equal(await page.evaluate(() => globalThis.readingWitness.screen.isOpen), true);
    assert.equal(await previousFocus.evaluate((element) => element === document.activeElement), true);
    await previousFocus.dispose();
    await page.keyboard.press('Tab');
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
    await page.keyboard.press('F9');
    await page.waitForFunction(() => globalThis.readingWitness.session.sim.paused);
    await pressAction(page, 'world.interact');
    await page.keyboard.press('1');
    const menu = await record('pause menu F and quickbar');
    assert.equal(menu.readingOpen, false);
    assert.equal(menu.paused, true);
    assert.equal(menu.inventoryOpen, false);
    assert.deepEqual(menu.jobs, []);
    await page.keyboard.press('F9');
    await page.waitForFunction(() => !globalThis.readingWitness.session.sim.paused);
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
    proof = { before, during, escaped, menu };
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
