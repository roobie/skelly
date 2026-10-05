// Character progression owner: levels, source-agnostic practice and recipe knowledge.
import type { Registry } from './content.ts';
import { freezeSnapshot } from './snapshotData.ts';

export interface CharacterState {
  skills: Record<string, number>;
  practice: Record<string, number>;
  knownRecipes: string[];
}

/** Practice required for the next level grows with the level already reached. */
export const practiceForNextLevel = (level: number): number => 10 * (level + 1);

/** Explicit starting source, shared with CLI reachability in the next hand-off. */
export const STARTING_RECIPES = ['torch', 'candle', 'repair_kit', 'repair_crowbar', 'sawn_plank'] as const;
export const startingKnownRecipes = (registry: Registry): string[] =>
  STARTING_RECIPES.filter((id) => registry.recipes.has(id));

export class Character {
  readonly skills: Record<string, number>;
  readonly practice: Record<string, number>;
  readonly knownRecipes: Set<string>;

  constructor(registry: Registry) {
    this.skills = Object.fromEntries([...registry.skills.keys()].map((id) => [id, 0]));
    this.practice = Object.fromEntries([...registry.skills.keys()].map((id) => [id, 0]));
    this.knownRecipes = new Set(startingKnownRecipes(registry));
  }

  snapshotState(): Readonly<CharacterState> {
    return freezeSnapshot({
      skills: { ...this.skills },
      practice: { ...this.practice },
      knownRecipes: [...this.knownRecipes].sort(),
    });
  }

  /** Any activity may award practice; callers identify only a skill and an amount. */
  awardPractice(skill: string, amount: number): void {
    if (!(Object.hasOwn(this.skills, skill) && Number.isFinite(amount)) || amount < 0) {
      throw new Error(`Invalid practice award for ${skill}`);
    }
    let remaining = this.practice[skill]! + amount;
    let level = this.skills[skill]!;
    while (remaining >= practiceForNextLevel(level)) {
      remaining -= practiceForNextLevel(level);
      level += 1;
    }
    this.skills[skill] = level;
    this.practice[skill] = remaining;
  }

  learnRecipes(recipes: readonly string[]): void {
    for (const id of recipes) {
      if (!this.knownRecipes.has(id)) {
        this.knownRecipes.add(id);
      }
    }
  }

  static restoreState(registry: Registry, state: CharacterState): Character {
    const character = new Character(registry);
    const keys = Object.keys(state.skills);
    const practiceKeys = Object.keys(state.practice);
    if (
      keys.length !== registry.skills.size ||
      keys.some((id) => !registry.skills.has(id)) ||
      practiceKeys.length !== registry.skills.size ||
      practiceKeys.some((id) => !registry.skills.has(id))
    ) {
      throw new Error('Saved skills do not match the character skill definitions');
    }
    for (const [id, level] of Object.entries(state.skills)) {
      if (!Number.isSafeInteger(level) || level < 0) {
        throw new Error(`Invalid skill level for ${id}`);
      }
      character.skills[id] = level;
      const practice = state.practice[id];
      if (
        practice === undefined ||
        !Number.isFinite(practice) ||
        practice < 0 ||
        practice >= practiceForNextLevel(level)
      ) {
        throw new Error(`Invalid skill practice for ${id}`);
      }
      character.practice[id] = practice;
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
