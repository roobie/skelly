import { readFileSync } from 'node:fs';
import type { ContentSource } from '../../src/core/content.ts';
import { fixtureIds } from './capabilityIds.ts';

const baseJson = (name: string) =>
  JSON.parse(readFileSync(`src/content/base/${name}`, 'utf8')) as {
    skills?: { id: string; combat?: { firearms?: { longGunSteadinessSkill: string } } }[];
    ui?: { id: string; refusalSound: string }[];
    sounds?: { id: string }[];
  };

const baseSkill = (id: string) => {
  const skill = baseJson('recipes.json').skills?.find((candidate) => candidate.id === id);
  if (!skill) {
    throw new Error(`Base content lacks skill ${id}`);
  }
  return structuredClone(skill);
};

const fixtureUi = () => {
  const ui = baseJson('ui.json').ui!.filter(({ id }) => id === fixtureIds.ui);
  const sounds = baseJson('sounds.json').sounds!.filter(({ id }) => ui.some((tuning) => tuning.refusalSound === id));
  return { ui, sounds };
};

/** The core player inventory row, the inventory skill's handling tuning and the core UI text its refusals read, which every registry needs for the reach and handling rules; taken from base content so no test restates their values. */
export const playerInventorySource = (): ContentSource => ({
  source: 'player-inventory-fixture.json',
  data: { ...baseJson('inventory.json'), ...fixtureUi(), skills: [baseSkill(fixtureIds.inventoryManagement)] },
});

/** The firearms skill's tuning, which held-item rendering needs; taken from base content so no test restates its values. */
export const firearmsSkillSource = (): ContentSource => {
  const combat = baseSkill(fixtureIds.firearmsCombat);
  return {
    source: 'firearms-skill-fixture.json',
    data: { skills: [combat, baseSkill(combat.combat!.firearms!.longGunSteadinessSkill)] },
  };
};
