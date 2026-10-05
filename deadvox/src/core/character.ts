// Character progression owner. Slice 2.4 stores levels and starting knowledge;
// XP/learning/reading belong to 2.5, not the planner or the save codec.
import type { Registry } from './content.ts';
import type { HandSide } from './inventory.ts';
import { freezeSnapshot } from './snapshotData.ts';

export interface HandedCharacter {
  readonly handedness: HandSide;
}

/** Standalone fixtures share this view; production supplies its actual Character. */
export const DEFAULT_HANDED_CHARACTER: HandedCharacter = Object.freeze({ handedness: 'right' });
export const dominantSide = (character: HandedCharacter): HandSide => character.handedness;
export const offSide = (character: HandedCharacter): HandSide => (character.handedness === 'right' ? 'left' : 'right');

export interface CharacterState {
  handedness: HandSide;
  skills: Record<string, number>;
  knownRecipes: string[];
}

/** Explicit starting source, shared with CLI reachability in the next hand-off. */
export const STARTING_RECIPES = ['torch', 'candle', 'repair_kit', 'repair_crowbar', 'sawn_plank'] as const;
export const startingKnownRecipes = (registry: Registry): string[] =>
  STARTING_RECIPES.filter((id) => registry.recipes.has(id));

export class Character implements HandedCharacter {
  private readonly side: HandSide;
  get handedness(): HandSide {
    return this.side;
  }

  readonly skills: Record<string, number>;
  readonly knownRecipes: Set<string>;

  constructor(registry: Registry, options: { handedness?: HandSide | undefined } = {}) {
    const side = options.handedness ?? DEFAULT_HANDED_CHARACTER.handedness;
    if (side !== 'right' && side !== 'left') {
      throw new Error('Invalid character handedness');
    }
    this.side = side;
    this.skills = Object.fromEntries([...registry.skills.keys()].map((id) => [id, 0]));
    this.knownRecipes = new Set(startingKnownRecipes(registry));
  }

  snapshotState(): Readonly<CharacterState> {
    return freezeSnapshot({
      handedness: this.handedness,
      skills: { ...this.skills },
      knownRecipes: [...this.knownRecipes].sort(),
    });
  }

  static restoreState(registry: Registry, state: CharacterState): Character {
    if (state.handedness !== 'right' && state.handedness !== 'left') {
      throw new Error('Invalid saved character handedness');
    }
    const character = new Character(registry, { handedness: state.handedness });
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
