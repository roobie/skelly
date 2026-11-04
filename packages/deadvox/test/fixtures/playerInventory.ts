import { readFileSync } from 'node:fs';
import type { ContentSource } from '../../src/core/content.ts';
import type { ContentFile } from '../../src/core/schema.ts';
import { fixtureIds } from './capabilityIds.ts';

const baseJson = (name: string) =>
  JSON.parse(readFileSync(`mods/skelly.deadvox.residual/${name}`, 'utf8')) as ContentFile;
const uiJson = (name: string) => JSON.parse(readFileSync(`../mods/skelly.ui/${name}`, 'utf8')) as ContentFile;
const inventoryJson = () => JSON.parse(readFileSync('../mods/skelly.inventory/inventory.json', 'utf8')) as ContentFile;

const progressionJson = () =>
  JSON.parse(readFileSync('../mods/skelly.progression/progression.json', 'utf8')) as ContentFile;

const skillIn = (file: ContentFile, id: string) => {
  const skill = file.skills?.find((candidate) => candidate.id === id);
  if (!skill) {
    throw new Error(`Base content lacks skill ${id}`);
  }
  return structuredClone(skill);
};

const fixtureUi = () => {
  const ui = uiJson('ui.json').ui!.filter(({ id }) => id === fixtureIds.ui);
  const sounds = uiJson('ui-sounds.json').sounds!.filter(({ id }) => ui.some((tuning) => tuning.refusalSound === id));
  return { ui, sounds };
};

/** Share authored tuning so fixtures do not pin product values. */
export const playerInventorySource = (): ContentSource => ({
  source: 'player-inventory-fixture.json',
  data: { ...inventoryJson(), ...fixtureUi(), skills: [skillIn(progressionJson(), fixtureIds.inventoryManagement)] },
});

/** Rendering fixtures need baseline policy even when their skill set changes. */
export const firearmsSkillSource = (): ContentSource => {
  const combat = skillIn(baseJson('recipes.json'), fixtureIds.firearmsCombat);
  return {
    source: 'firearms-skill-fixture.json',
    data: {
      ...baseJson('combat-policy.json'),
      ...baseJson('ranged-tuning.json'),
      skills: [
        combat,
        baseJson('recipes.json').skills!.find(
          (skill) => skill.capability === combat.combat!.firearms!.longGunSteadinessRole,
        )!,
      ],
    },
  };
};
