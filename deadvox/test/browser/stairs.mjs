// biome-ignore-all lint/correctness/noNodejsModules: standalone maintained browser test starts Vite and Chrome.
// biome-ignore-all lint/style/noProcessEnv: test executable and evidence destination are runner configuration.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser contract assertions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright');

import { createServer } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = resolve(process.env.STAIRS_ARTIFACT_DIR ?? 'test-results/stairs');
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
        if (!id.endsWith('/src/game/play.ts')) {
          return;
        }
        const marker = 'startPlayFrames(frame);';
        assert.ok(code.includes(marker));
        return code.replace(
          marker,
          `Object.assign(globalThis,{stairsWitness:{engine,session,input,body,get noclip(){return debugTools?.noclip??false;}}});\n${marker}`,
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
    headless: true,
    executablePath: process.env.CHROME_BIN,
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
  const states = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(`http://127.0.0.1:${port}/?site=stair_demo&seed=1&radius=32&debug=1&time=12:00`);
  await page.waitForFunction(() => globalThis.stairsWitness, undefined, { timeout: 60_000 });
  await page.locator('#go').click();
  await page.waitForFunction(
    () =>
      [
        [96, 32, 96],
        [128, 32, 96],
      ].every(([x, y, z]) =>
        globalThis.stairsWitness.engine.meshes.group.children.some(
          (mesh) => mesh.position.x === x && mesh.position.y === y && mesh.position.z === z,
        ),
      ),
    undefined,
    { timeout: 60_000 },
  );
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
    await page.waitForTimeout(200);
  };
  const state = async (label) => {
    const value = await page.evaluate(() => {
      const { body, noclip, engine, session, input } = globalThis.stairsWitness;
      return {
        position: [...body.pos],
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
    assert.equal(value.noclip, false);
    assert.equal(value.locked, true);
    assert.equal(value.contentErrors, '');
    states.push({ label, ...value });
    return value;
  };
  const shot = (label) => page.screenshot({ path: resolve(artifacts, `${label}.png`) });
  const walk = async (key, targetX, ascending) => {
    await page.keyboard.down(key);
    await page.waitForFunction(
      ({ x, increasing }) =>
        increasing ? globalThis.stairsWitness.body.pos[0] >= x : globalThis.stairsWitness.body.pos[0] <= x,
      { x: targetX, increasing: ascending },
      { timeout: 30_000 },
    );
    await page.keyboard.up(key);
    await page.waitForTimeout(500);
  };
  await stage([112, 43.0001, 115]);
  await state('house lower landing');
  await walk('w', 121, true);
  assert.ok(Math.abs((await state('house upstairs walked')).position[1] - 51) < 0.01);
  await page.evaluate(() => {
    globalThis.stairsWitness.input.yaw = Math.PI / 2;
    globalThis.stairsWitness.input.pitch = -0.3;
  });
  await page.waitForTimeout(150);
  await shot('house-upstairs-looking-down');
  await page.evaluate(() => {
    globalThis.stairsWitness.input.yaw = -Math.PI / 2;
    globalThis.stairsWitness.input.pitch = 0;
  });
  await walk('s', 112, false);
  assert.ok(Math.abs((await state('house downstairs walked')).position[1] - 43) < 0.01);
  await shot('house-downstairs');
  await stage([143, 43.0001, 115]);
  await walk('s', 134, false);
  assert.ok(Math.abs((await state('cellar lower landing walked')).position[1] - 35) < 0.01);
  const dark = await shot('cellar-dark');
  await page.evaluate(() => {
    const { session } = globalThis.stairsWitness;
    session.inventory.hands.left = session.inventory.create('flashlight');
    session.inventory.version += 1;
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
  const luminance = async (png) =>
    page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 480, 260, 240, 240, 0, 0, 240, 240);
      const pixels = ctx.getImageData(0, 0, 240, 240).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
      }
      return sum / (240 * 240 * 3);
    }, png.toString('base64'));
  const lightProof = { dark: await luminance(dark), beam: await luminance(lit) };
  assert.ok(lightProof.dark < 8, JSON.stringify(lightProof));
  assert.ok(lightProof.beam > lightProof.dark + 10, JSON.stringify(lightProof));
  await mouse5();
  await walk('w', 143, true);
  assert.ok(Math.abs((await state('cabin ground landing walked back')).position[1] - 43) < 0.01);
  const actor = async (label, playerY, npcY) => {
    await stage([121, playerY + 0.0001, 122], Math.PI);
    await page.evaluate((fixtureY) => {
      const { session } = globalThis.stairsWitness;
      const [[, z]] = [...session.zombieStore.entries()];
      z.body.pos = [121, fixtureY + 0.0001, 122];
      z.body.vel = [0, 0, 0];
      z.home = [...z.body.pos];
      z.mode = 'idle';
      z.modeTimer = 10;
      z.lastPerceived = undefined;
      z.searchAnchor = undefined;
      session.playPlayerSound('gunshot');
    }, npcY);
    await page.waitForTimeout(3000);
    const observed = await state(label);
    assert.ok(Math.abs(observed.zombies[0].pos[1] - npcY) < 0.01);
    assert.ok(Math.abs(observed.position[1] - playerY) < 0.01);
    await page.evaluate((caption) => {
      let el = document.getElementById('stairs-evidence');
      if (!el) {
        el = document.createElement('div');
        el.id = 'stairs-evidence';
        el.style.cssText =
          'position:fixed;left:20px;top:60px;background:#111e;color:white;padding:12px;font:16px monospace;z-index:9999';
        document.body.append(el);
      }
      el.textContent = `${caption} — actual heights retained; no stair route discovered`;
    }, label);
    await shot(label);
  };
  await actor('NPC-upstairs-player-below', 43, 51);
  await actor('NPC-downstairs-player-above', 51, 43);
  assert.deepEqual(errors, []);
  await writeFile(resolve(artifacts, 'result.json'), JSON.stringify({ states, lightProof, errors }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}
