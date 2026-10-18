import { readFileSync } from 'node:fs';
import type { ContentSource } from '../../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../../src/core/contentIds.ts';

const baseJson = (name: string) =>
  JSON.parse(readFileSync(`src/content/base/${name}`, 'utf8')) as { skills?: { id: string }[] };

const baseSkill = (id: string) => {
  const skill = baseJson('recipes.json').skills?.find((candidate) => candidate.id === id);
  if (!skill) {
    throw new Error(`Base content lacks skill ${id}`);
  }
  return structuredClone(skill);
};

/** The core player inventory row and the inventory skill's handling tuning, which every registry needs for the reach and handling rules; taken from base content so no test restates their values. */
export const playerInventorySource = (): ContentSource => ({
  source: 'player-inventory-fixture.json',
  data: { ...baseJson('inventory.json'), skills: [baseSkill(CORE_CONTENT_IDS.inventoryManagement)] },
});

/** The firearms skill's tuning, which held-item rendering needs; taken from base content so no test restates its values. */
export const firearmsSkillSource = (): ContentSource => ({
  source: 'firearms-skill-fixture.json',
  data: { skills: [baseSkill(CORE_CONTENT_IDS.firearmsCombat)] },
});
