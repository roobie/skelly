// biome-ignore-all lint/correctness/noNodejsModules: browser assertions run in Node.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser flow.
import assert from 'node:assert/strict';

export const worldRepairFlow = async (page, origin) => {
  await page.goto(`${origin}/test/browser/world-repair.html`);
  await page.waitForFunction(() => Boolean(globalThis.worldRepairTest));
  await page.setViewportSize({ width: 360, height: 540 });
  const snapshot = () => page.evaluate(() => globalThis.worldRepairTest.inventory.snapshotState());
  const before = await snapshot();
  await page.locator('[data-enter-world]').click();
  assert.equal(await page.evaluate(() => globalThis.worldRepairTest.aimedEntity()), undefined);
  await page.locator('[data-fixture-text]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => globalThis.worldRepairTest.look.yaw), 0, 'text focus keeps world aim');
  await page.locator('[data-world-action="inspect"]').focus();
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => globalThis.worldRepairTest.surface.update(2));
  await page.keyboard.up('ArrowRight');
  assert.equal(
    await page.evaluate(() => {
      const f = globalThis.worldRepairTest;
      return f.aimedEntity() === f.target.uid;
    }),
    true,
    'keyboard reaches the initially un-aimed target with the ordinary ray',
  );
  await page.keyboard.down('Enter');
  const details = page.locator('[data-world-action="details"]');
  assert.equal(await details.evaluate((button) => button === document.activeElement), true);
  await page.keyboard.down('Enter');
  assert.equal(await page.locator('[data-world-action="confirm"]').count(), 0, 'held Enter does not enter details');
  await page.keyboard.up('Enter');
  await page.keyboard.press('ArrowDown');
  assert.equal(
    await page.locator('[data-world-action="back"]').evaluate((button) => button === document.activeElement),
    true,
  );
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  assert.ok((await page.locator('.craft-components').count()) > 0, 'details reuse requirement rows');
  const confirm = page.locator('[data-world-action="confirm"]');
  const geometry = await confirm.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return {
      focused: button === document.activeElement,
      visible: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button,
    };
  });
  assert.deepEqual(
    geometry,
    { focused: true, visible: true, hit: true },
    'narrow detail action is focused and clickable',
  );
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  assert.deepEqual(await snapshot(), before, 'inspection and Back do not spend');
  assert.deepEqual(await page.evaluate(() => globalThis.worldRepairTest.intents), []);

  await page.locator('[data-enter-world]').click();
  await page.locator('[data-world-action="inspect"]').click();
  await details.click();
  await confirm.click();
  const mouseIntent = await page.evaluate(() => globalThis.worldRepairTest.intents[0]);
  assert.equal(mouseIntent.kind, 'craft.repair-entity');
  await page.locator('[data-enter-world]').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => globalThis.worldRepairTest.intents), [mouseIntent, mouseIntent]);
  assert.deepEqual(await snapshot(), before, 'recording owner does not start work');

  await page.locator('[data-enter-world]').click();
  await page.keyboard.press('Enter');
  await page.keyboard.down('Enter');
  await page.evaluate(() => globalThis.dispatchEvent(new Event('blur')));
  assert.equal(await page.locator('#world-repair').isHidden(), true);
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  assert.equal(await page.evaluate(() => globalThis.worldRepairTest.intents.length), 2, 'focus return never confirms');
};
