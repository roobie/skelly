import { expect, it } from 'vitest';
import { Character, SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { setDebugInventoryManagementSkill } from '../src/debug/debugInventoryManagementSkill.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';

const character = () => new Character(BUNDLED_CONTENT.registry);

it('sets inventory-management level only for a fresh debug game with a valid URL value', () => {
  const actor = character();
  setDebugInventoryManagementSkill(actor, '?inventoryManagement=5', true, true);
  expect(actor.skills.inventory_management).toBe(5);

  for (const [search, enabled, fresh] of [
    ['?inventoryManagement=3', false, true],
    ['?inventoryManagement=4', true, false],
    [`?inventoryManagement=${SKILL_LEVEL_LEGENDARY + 1}`, true, true],
    ['?inventoryManagement=-1', true, true],
    ['?inventoryManagement=2.5', true, true],
  ] as const) {
    setDebugInventoryManagementSkill(actor, search, enabled, fresh);
    expect(actor.skills.inventory_management).toBe(5);
  }

  setDebugInventoryManagementSkill(actor, `?inventoryManagement=${SKILL_LEVEL_MAX}`, true, true);
  expect(actor.skills.inventory_management).toBe(SKILL_LEVEL_MAX);
  setDebugInventoryManagementSkill(actor, `?inventoryManagement=${SKILL_LEVEL_LEGENDARY}`, true, true);
  expect(actor.skills.inventory_management).toBe(SKILL_LEVEL_LEGENDARY);
  setDebugInventoryManagementSkill(actor, `?inventoryManagement=${SKILL_LEVEL_MIN}`, true, true);
  expect(actor.skills.inventory_management).toBe(SKILL_LEVEL_MIN);
});
