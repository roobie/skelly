import type { ContentSource } from '@skelly/engine/content';
import { FIXTURE_BLOW_SOUND, fixtureBreach } from '../economyFixtures.ts';

// Fixture-owned role content for the skill-role cases. Ids are fixture ids, except `wax`, which the recipe case reads.

/** The recovery role's provider: `crafting` capability, so disassembly and recipe gates resolve to it. */
export const fixtureCraftingSkill = {
  id: 'fixture_crafting_skill',
  capability: 'crafting',
  name: 'Fixture crafting',
  curve: { saturationFloor: 0.42, saturationHalfLifeLevels: 4 },
  training: { craftingTierOffset: 1 },
};

/** The forcing role's provider: `mechanics` capability, the skill a door's forcing method names. */
export const fixtureMechanicsSkill = {
  id: 'fixture_mechanics_skill',
  capability: 'mechanics',
  name: 'Fixture mechanics',
  curve: { saturationFloor: 0.42, saturationHalfLifeLevels: 4 },
  training: { craftingTierOffset: 1 },
};

/** Skill providers with their practice progression. */
export const fixtureSkillsSource = (
  skills: readonly object[] = [fixtureCraftingSkill, fixtureMechanicsSkill],
): ContentSource => ({
  source: 'fixture-skills.json',
  data: {
    skills,
    skillProgression: [{ id: 'fixture_progression', capability: 'progression', practicePerLevel: 10 }],
  },
});

const FIXTURE_PRY_QUALITY = 'fixture_pry';
const FIXTURE_DOOR_MATERIAL = 'fixture_door_material';

/** Items and a door for the skill-role cases; they name no skill, so they load with or without providers. */
export const fixtureRoleItemsSource = (): ContentSource => ({
  source: 'fixture-role-items.json',
  data: {
    recipeCategories: [{ id: 'fixture_category', label: 'Fixture', order: 0 }],
    // A material that admits the door's forcing method; the shared fixture material admits none.
    furnitureMaterials: [
      {
        id: FIXTURE_DOOR_MATERIAL,
        blowSound: FIXTURE_BLOW_SOUND,
        drops: { default: FIXTURE_BLOW_SOUND },
        methods: ['pry'],
      },
    ],
    items: [
      { id: 'fixture_work', workInProgress: true, name: 'Fixture work', category: 'material', weight: 0, size: [1, 1] },
      { id: 'wax', workInProgress: false, name: 'Fixture wax', category: 'material', weight: 1, size: [1, 1] },
      {
        id: 'fixture_long_gun',
        workInProgress: false,
        name: 'Fixture long gun',
        category: 'tool',
        weight: 1,
        size: [1, 1],
        twoHanded: true,
        firearm: {
          shotSound: FIXTURE_BLOW_SOUND,
          recoilKickRadians: 0.01,
          dispersionRadians: 0.01,
          pelletSpreadScale: 1,
          rackSound: FIXTURE_BLOW_SOUND,
          handling: {},
        },
      },
      {
        id: 'fixture_pry_tool',
        workInProgress: false,
        name: 'Fixture pry bar',
        category: 'tool',
        weight: 1,
        size: [1, 1],
        tool: { qualities: { [FIXTURE_PRY_QUALITY]: 1 } },
      },
      {
        id: 'fixture_part',
        workInProgress: false,
        name: 'Fixture part',
        category: 'material',
        weight: 1,
        size: [1, 1],
      },
      {
        id: 'fixture_take_apart',
        workInProgress: false,
        name: 'Fixture take apart',
        category: 'material',
        weight: 1,
        size: [1, 1],
        disassembly: {
          skill: 'crafting',
          timeGameMinutes: 1,
          yields: [{ item: 'fixture_part', count: 1, fractions: [0.5, 1], rounding: 'floor' as const }],
        },
      },
    ],
    furniture: [
      {
        id: 'fixture_door',
        name: 'Fixture door',
        size: [1, 2, 1],
        color: '#808080',
        breach: fixtureBreach(),
        material: FIXTURE_DOOR_MATERIAL,
        door: {
          handlingSimSeconds: 0.2,
          methods: {
            pry: {
              quality: FIXTURE_PRY_QUALITY,
              level: 1,
              strikeSound: FIXTURE_BLOW_SOUND,
              skill: 'mechanics',
              timeSimSeconds: 10,
              fastestTimeSimSeconds: 4,
              strikeIntervalSimSeconds: 1,
            },
          },
        },
      },
    ],
  },
});
