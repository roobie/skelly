// biome-ignore-all lint/suspicious/noMisplacedAssertion: browser contract helpers assert the observed game state
// biome-ignore-all lint/performance/noAwaitInLoops: the ready wait counts consecutive frames, one after another
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { aimVehiclePart, parkCursorOn } from './craft-catalogue-flow.mjs';
import { inlineStartMod } from './gameUrl.mjs';
import { pressAction, tapAction } from './input-actions.mjs';

/** @import { Locator, Page } from 'playwright' */

/** The fire engine locker whose shutter the flow raises, and an item its load-out stows. */
const locker = { shutter: 'locker_shutter_mid_near', stowed: 'crowbar' };

const ground = 20;

/**
 * A quiet flat site with only a fire engine on it, and the player standing at its near mid locker, so looting the
 * locker needs no walk and no world work first.
 */
export const vehicleLockerStart = {
  ...inlineStartMod('fixture.vehicle-locker', {
    allSkills: 10,
    debugOnly: true,
    density: null,
    id: 'vehicle_locker_start',
    kit: [],
    recipes: [],
    seed: 1,
    site: 'vehicleLocker',
    skills: {},
    startTimeGameTimeOfDay: '12:00',
    wounds: [],
  }),
  layouts: [
    {
      id: 'vehicleLocker',
      demo: true,
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      bounds: { x0: -32, z0: -32, x1: 32, z1: 32 },
      ground,
      terrain: [],
      buildings: [],
      woodlands: [],
      tracks: [],
      // Faces the engine's near side, beside the mid locker.
      player: { position: [0, ground + 0.5, -3], bearing: 0 },
      actors: [],
      vehicles: [
        {
          blueprint: 'fire_engine',
          placementKey: 'fixture.vehicle-locker.fire-engine',
          position: [0, ground, 0],
          facing: 's',
        },
      ],
    },
  ],
};

/**
 * Presses an inventory item as a player would. Under pointer lock a mouse move would carry the drawn cursor off the
 * item, so the press happens where the cursor is parked; without the lock it is an ordinary click.
 * @param {Page} page
 * @param {Locator} locator
 */
const pressItem = async (page, locator) => {
  const hidden = await page.locator('#game-cursor').evaluate((/** @type {HTMLElement} */ cursor) => cursor.hidden);
  if (hidden) {
    await locator.click();
    return;
  }
  await parkCursorOn(page, locator);
  await page.mouse.down();
  await page.mouse.up();
};

/**
 * Boots the start at `url` and waits until play is ready and stays so, since the boot's ready transition closes any
 * open screen.
 * @param {Page} page
 * @param {string} url
 */
const bootToPlay = async (page, url) => {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#overlay');
    const loading = document.querySelector('#world-loading');
    return (
      globalThis.skellyPlayTest &&
      overlay instanceof HTMLElement &&
      overlay.hidden &&
      loading instanceof HTMLElement &&
      loading.hidden &&
      loading.dataset.state === 'ready'
    );
  });
  await page.evaluate(async () => {
    for (;;) {
      const flips = globalThis.foregripFitTest.readyFlips;
      let held = 0;
      while (held < 30) {
        await new Promise(requestAnimationFrame);
        held = globalThis.skellyPlayTest.worldLoading.ready ? held + 1 : 0;
      }
      if (globalThis.foregripFitTest.readyFlips === flips) {
        return;
      }
    }
  });
};

/**
 * A tap of the use key on the aimed shutter raises it in the sim and redraws its vehicle.
 * @param {Page} page
 * @param {string} fittingId
 */
const raiseShutter = async (page, fittingId) => {
  const { vehicleId } = await aimVehiclePart(page, { fittingId });
  const before = await page.evaluate(
    (id) => ({
      drawn: globalThis.skellyPlayTest.view.vehicles.groupFor(id)?.uuid,
      notice: globalThis.skellyPlayTest.notice,
    }),
    vehicleId,
  );
  await tapAction(page, 'world.interact');
  // A refusal ends the wait as a raise does, so a refused tap fails here with its own words.
  const settled = await page.waitForFunction(
    ({ id, part, notice }) => {
      const { session, notice: now } = globalThis.skellyPlayTest;
      const state = {
        open: session.inventory.vehicles.get(id)?.fittings.find((fitting) => fitting.id === part)?.open === true,
        refused: now === notice ? null : now,
      };
      return (state.open || state.refused !== null) && state;
    },
    { id: vehicleId, part: fittingId, notice: before.notice },
  );
  assert.deepEqual(await settled.jsonValue(), { open: true, refused: null }, 'the shutter rises in the sim');
  await page.waitForFunction(({ id, drawn }) => globalThis.skellyPlayTest.view.vehicles.groupFor(id)?.uuid !== drawn, {
    id: vehicleId,
    drawn: before.drawn,
  });
  return vehicleId;
};

/**
 * A raised shutter opens the locker behind it as a container in "Around you", and its stowed item goes to the hands.
 * With `output`, shots show the raised shutter, the listed locker and the take.
 * @param {{ page: Page; url: string; output: string | undefined }} options
 */
export const vehicleLockerFlow = async ({ page, url, output }) => {
  // Every wait follows a world boot or a frame, whose duration scales with machine load, so a hung wait ends at the
  // CI step's timeout instead of a Playwright timer.
  page.setDefaultTimeout(0);
  if (output) {
    mkdirSync(output, { recursive: true });
  }
  const began = performance.now();
  /** @param {string} step */
  const reached = (step) =>
    process.stdout.write(`vehicle locker: ${step} at ${Math.round(performance.now() - began)} ms\n`);
  await bootToPlay(page, url);
  reached('in play');
  await page.evaluate(() => globalThis.skellyPlayTest.input.lock());
  const vehicleId = await raiseShutter(page, locker.shutter);
  reached('shutter raised');
  if (output) {
    await page.screenshot({ path: join(output, 'vehicle-locker-shutter.png') });
  }
  const { container, item } = await page.evaluate(
    ({ id, shutter, stowed }) => {
      const fitting = globalThis.skellyPlayTest.session.inventory.vehicles
        .get(id)
        ?.fittings.find((candidate) => candidate.behind === shutter);
      const held = fitting?.item.pockets?.flat().find((placed) => placed.item.type === stowed);
      return { container: fitting?.item.uid, item: held?.item.uid };
    },
    { id: vehicleId, ...locker },
  );
  assert.ok(container !== undefined && item !== undefined, `the shutter closes away a locker with a ${locker.stowed}`);
  await pressAction(page, 'ui.inventory-toggle');
  await pressAction(page, 'ui.inventory-tab-items');
  const listed = page.locator(`#inventory [data-pane="around"] [data-put-container="item:${container}"]`);
  await listed.waitFor();
  reached('locker listed');
  if (output) {
    await listed.screenshot({ path: join(output, 'vehicle-locker-around.png') });
  }
  await pressItem(page, listed.locator(`[data-uid="${item}"]`));
  await page.waitForFunction((uid) => document.querySelector(`#inventory [data-uid="${uid}"].selected`), item);
  await tapAction(page, 'inventory.hands');
  const moved = await page.waitForFunction(
    ({ uid, from }) => {
      const { inventory } = globalThis.skellyPlayTest.session;
      const held = inventory.itemByUid(uid);
      const at = held && inventory.locate(held);
      return (
        at &&
        !(at.kind === 'pocket' && at.owner.uid === from) && {
          inHand: Object.values(inventory.hands).some((hand) => hand?.uid === uid),
        }
      );
    },
    { uid: item, from: container },
  );
  assert.deepEqual(await moved.jsonValue(), { inHand: true }, `the ${locker.stowed} leaves the locker for the hands`);
  if (output) {
    await page.locator('#inventory').screenshot({ path: join(output, 'vehicle-locker-taken.png') });
  }
  reached(`the ${locker.stowed} in hand`);
};
