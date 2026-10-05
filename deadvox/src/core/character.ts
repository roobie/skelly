// Character progression owner. Slice 2.4 stores levels and starting knowledge;
// XP/learning/reading belong to 2.5, not the planner or the save codec.
import type { Registry } from './content.ts';
import { freezeSnapshot } from './snapshotData.ts';

export interface CharacterState {
  skills: Record<string, number>;
  knownRecipes: string[];
}

/** Explicit starting source, shared with CLI reachability in the next hand-off. */
export const STARTING_RECIPES = ['torch', 'candle', 'repair_kit', 'repair_crowbar'] as const;
export const startingKnownRecipes = (registry: Registry): string[] =>
  STARTING_RECIPES.filter((id) => registry.recipes.has(id));

export class Character {
  readonly skills: Record<string, number>;
  readonly knownRecipes: Set<string>;

  constructor(registry: Registry) {
    this.skills = Object.fromEntries([...registry.skills.keys()].map((id) => [id, 0]));
    this.knownRecipes = new Set(startingKnownRecipes(registry));
  }

  snapshotState(): Readonly<CharacterState> {
    return freezeSnapshot({ skills: { ...this.skills }, knownRecipes: [...this.knownRecipes].sort() });
  }

  static restoreState(registry: Registry, state: CharacterState): Character {
    const character = new Character(registry);
    const keys = Object.keys(state.skills);
    if (keys.length !== registry.skills.size || keys.some((id) => !registry.skills.has(id))) {
      throw new Error('Saved skills do not match the character skill definitions');
    }
    for (const [id, level] of Object.entries(state.skills)) {
      if (!Number.isSafeInteger(level) || level < 0) {
        throw new Error(`Invalid skill level for ${id}`);
      }
      character.skills[id] = level;
    }
    character.knownRecipes.clear();
    for (const id of state.knownRecipes) {
      if (!registry.recipes.has(id) || character.knownRecipes.has(id)) {
        throw new Error(`Invalid known recipe ${id}`);
      }
      character.knownRecipes.add(id);
    }
    return character;
  }
}

export interface CraftCharacter {
  readonly skills: Readonly<Record<string, number>>;
  readonly knownRecipes: ReadonlySet<string>;
}
