// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const selectFixtureMods = async (page) => {
  const path = fileURLToPath(new URL('../fixtures/mods/browser-mod.json', import.meta.url));
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  await page.locator('#mods-start').waitFor();
  assert.equal(await page.locator('#view canvas').count(), 0, 'mod selection precedes engine creation');
  await page.locator('#mods-screen input[type=file]').setInputFiles(path);
  await page.locator('[data-mod-source="mod-1/browser-mod.json"]').waitFor();
  const paste = async (data) => {
    await page.getByRole('textbox', { name: 'Mod JSON or URL' }).fill(data);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  };
  await paste(
    JSON.stringify({
      id: 'earlier-mod',
      version: '1',
      tier: 'theme',
      product: false,
      dependencies: [],
      overrides: [],
      items: [{ ...fixture.items[0], id: `${fixture.items[0].id}_earlier`, name: 'Earlier addition' }],
    }),
  );
  await paste('{');
  assert.equal(await page.locator('#mods-start').isDisabled(), true, 'enabled broken JSON blocks startup');
  const invalid = page.locator('[data-mod-source="mod-3/pasted.json"]');
  assert.notEqual((await invalid.locator('pre').textContent()).trim(), '', 'broken file has validator feedback');
  await invalid.getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Move mod-2/pasted.json up', exact: true }).click();
  assert.deepEqual(
    await page.locator('[data-mod-source]').evaluateAll((rows) => rows.map((row) => row.dataset.modSource)),
    ['mod-2/pasted.json', 'mod-1/browser-mod.json', 'mod-3/pasted.json'],
  );
  const url = new URL('/test/fixtures/mods/browser-mod.json', page.url()).href;
  await paste(url);
  const duplicate = page.locator(`[data-mod-source="mod-4/${url}"]`);
  await duplicate.waitFor();
  assert.equal(await page.locator('#mods-start').isDisabled(), true, 'duplicate mod id blocks startup');
  assert.ok((await duplicate.locator('pre').textContent()).includes(fixture.id), 'duplicate feedback names the mod id');
  await page.locator('[data-mod-source="mod-1/browser-mod.json"]').getByRole('checkbox').uncheck();
  await page.waitForFunction(() => !document.querySelector('#mods-start')?.disabled);
  const selected = await page.locator('[data-mod-source]').evaluateAll((rows) =>
    rows.map((row) => ({
      source: row.dataset.modSource,
      enabled: row.querySelector('input').checked,
    })),
  );
  await page.reload();
  await page.locator('#mods-start').waitFor();
  assert.deepEqual(
    await page.locator('[data-mod-source]').evaluateAll((rows) =>
      rows.map((row) => ({
        source: row.dataset.modSource,
        enabled: row.querySelector('input').checked,
      })),
    ),
    selected,
    'reload retains the complete ordered selection and enabled states',
  );
  assert.equal(await page.locator('#mods-start').isDisabled(), false, 'disabled files cannot block startup');
  await page.locator('#mods-start').click();
  return fixture;
};

export const assertFixtureMods = async (page, fixture) => {
  const [item] = fixture.items;
  const [zombie] = fixture.zombies;
  const actual = await page.evaluate(
    ({ itemId, zombieId }) => {
      const { registry } = globalThis.firefoxUiTest;
      return { item: registry.items.get(itemId), speed: registry.zombies.get(zombieId)?.speed };
    },
    { itemId: item.id, zombieId: zombie.id },
  );
  assert.equal(actual.item.name, item.name, 'the URL definition reaches the running registry');
  assert.deepEqual(actual.speed, zombie.speed, 'the selected mod reaches the running world');
};
