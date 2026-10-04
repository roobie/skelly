// biome-ignore-all lint/correctness/noNodejsModules: standalone maintained browser contract starts Vite/Chrome.
// biome-ignore-all lint/style/noProcessEnv: runner supplies executable and artifact directory.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser contract assertions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import('playwright');
const root = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = resolve(process.env.READING_ARTIFACT_DIR ?? 'test-results/reading');
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
        assert.ok(code.includes(marker));
        return code.replace(
          marker,
          `let proofReadCalls=0; const proofOpen=reading.open; reading.open=(value)=>{proofReadCalls++;proofOpen(value);}; Object.assign(globalThis,{readingWitness:{engine,session,input,body,screen,reading,eye,lookedAt,get readCalls(){return proofReadCalls;}}});\n${marker}`,
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
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(
    `http://127.0.0.1:${port}/?site=testHouse&seed=1&radius=16&time=12:00&post=0&sunshadow=0&torchshadow=0`,
  );
  await page.waitForFunction(() => globalThis.readingWitness, undefined, { timeout: 60_000 });
  await page.locator('#go').click();
  await page.waitForFunction(
    () =>
      globalThis.readingWitness.input.locked &&
      [...globalThis.readingWitness.engine.entities.all].some((entity) => entity.type === 'crate'),
    undefined,
    { timeout: 60_000 },
  );
  // Ordinary keyboard movement from the real spawn, not a placed/moved note fixture.
  const startX = await page.evaluate(() => globalThis.readingWitness.body.pos[0]);
  await page.keyboard.down('w');
  await page.waitForFunction((x) => globalThis.readingWitness.body.pos[0] >= x, startX + 9, { timeout: 30_000 });
  await page.keyboard.up('w');
  const aim = async (type) =>
    page.evaluate((id) => {
      const { engine, input, eye } = globalThis.readingWitness;
      const entity = [...engine.entities.all].find((value) => value.type === id);
      if (!entity) {
        throw new Error(`Missing ${id}`);
      }
      const target = entity.pos.map((value, axis) => value + entity.size[axis] / 2);
      const origin = eye();
      const dx = target[0] - origin[0];
      const dy = target[1] - origin[1];
      const dz = target[2] - origin[2];
      input.yaw = Math.atan2(-dx, -dz);
      input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }, type);
  await aim('crate');
  await page.waitForFunction(() => globalThis.readingWitness.lookedAt()?.type === 'crate');
  await page.keyboard.press('f');
  await page.waitForFunction(
    () => [...globalThis.readingWitness.engine.entities.all].find((entity) => entity.type === 'crate')?.searched,
    undefined,
    { timeout: 30_000 },
  );
  // F's existing search interaction already opens the inventory.
  assert.equal(await page.evaluate(() => globalThis.readingWitness.screen.isOpen), true);
  await page.locator('.inv-item').filter({ hasText: 'Placeholder note' }).waitFor();
  const uiClick = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const rect = await locator.boundingBox();
    assert.ok(rect);
    // Native presses through the shipped locked-menu cursor forwarding, not inventory.move.
    await page.evaluate(
      ({ x, y }) => {
        const { input } = globalThis.readingWitness;
        input.cursorX = x;
        input.cursorY = y;
      },
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    );
    await page.mouse.down();
    await page.mouse.up();
  };
  await uiClick(page.locator('.inv-item').filter({ hasText: 'Placeholder note' }));
  await page.keyboard.press('h');
  await page.waitForFunction(
    () => Object.values(globalThis.readingWitness.session.inventory.hands).some((item) => item?.type === 'sample_note'),
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press('1'); // Bind the note through the real inventory quickbar command.
  const readButton = page.getByRole('button', { name: /^Read/ });
  await readButton.waitFor();
  await readButton.focus();
  await uiClick(readButton);
  await page.locator('#reading').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#reading h1').innerText(), 'Placeholder — a folded note');
  assert.ok((await page.locator('.reading-text').innerText()).includes('NOT PLAYTEST LORE'));
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'dialog');
  const before = await page.evaluate(() => {
    const { session, input, body } = globalThis.readingWitness;
    const item = Object.values(session.inventory.hands).find((value) => value?.type === 'sample_note');
    return {
      time: session.sim.time,
      position: [...body.pos],
      walking: input.walking,
      uid: item.uid,
      count: item.count,
      readCalls: globalThis.readingWitness.readCalls,
    };
  });
  await page.keyboard.press('u');
  await page.keyboard.press('1');
  await page.keyboard.press('=');
  await uiClick(page.locator('.reading-text'));
  await page.keyboard.press('z');
  await page.keyboard.press('r');
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  const during = await page.evaluate(() => {
    const { session, input, body, reading } = globalThis.readingWitness;
    const item = Object.values(session.inventory.hands).find((value) => value?.type === 'sample_note');
    return {
      time: session.sim.time,
      position: [...body.pos],
      walking: input.walking,
      uid: item.uid,
      count: item.count,
      open: reading.isOpen,
      jobs: session.queue.jobs.length,
      readCalls: globalThis.readingWitness.readCalls,
    };
  });
  assert.ok(during.time > before.time, 'reading runs the world like inventory');
  assert.deepEqual([during.position[0], during.position[2]], [before.position[0], before.position[2]]);
  assert.equal(during.walking, before.walking);
  assert.equal(during.uid, before.uid);
  assert.equal(during.count, before.count);
  assert.equal(during.jobs, 0);
  assert.equal(during.readCalls, before.readCalls);
  assert.equal(during.open, true);
  await page.screenshot({ path: resolve(artifacts, 'note-reading.png') });
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#reading').isVisible(), false);
  assert.equal(await page.evaluate(() => globalThis.readingWitness.screen.isOpen), true);
  assert.ok((await page.evaluate(() => document.activeElement?.textContent?.trim())).startsWith('Read'));
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => globalThis.readingWitness.input.menuPointer), false);
  await page.evaluate(() => {
    globalThis.readingWitness.input.yaw = -Math.PI / 2;
    globalThis.readingWitness.input.pitch = 0;
  });
  await page.keyboard.down('s');
  await page.waitForFunction((x) => globalThis.readingWitness.body.pos[0] <= x, startX + 3, { timeout: 30_000 });
  await page.keyboard.up('s');
  await aim('sample_sign');
  await page.waitForFunction(() => globalThis.readingWitness.lookedAt()?.type === 'sample_sign');
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
  if (!escaped.locked) {
    await page.locator('#go').click();
  }
  await page.waitForFunction(() => globalThis.readingWitness.input.locked);
  // View-only sizing fixture at the admitted caps; no instance/save text or domain mutation.
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
  const readingLayout = async () =>
    page.evaluate(() => {
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
  const sizes = [];
  const checkSize = async (viewport) => {
    await page.setViewportSize(viewport);
    const layout = await readingLayout();
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
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
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
  await page.evaluate(() => globalThis.readingWitness.reading.open({ title: 'Main menu close', text: 'Placeholder' }));
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
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(artifacts, 'result.json'),
    JSON.stringify({ before, during, escaped, sizes, endVisible, errors }, null, 2),
  );
} finally {
  await browser?.close();
  await vite.close();
}
