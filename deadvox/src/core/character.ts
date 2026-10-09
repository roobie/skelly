// Character progression owner: levels, source-agnostic practice and recipe knowledge.
import type { Registry } from './content.ts';
import type { HandSide } from './inventory.ts';
import { freezeSnapshot } from './snapshotData.ts';

export interface HandedCharacter {
  readonly handedness: HandSide;
  readonly skills?: Readonly<Record<string, number>>;
}

/** Standalone fixtures share this view; production supplies its actual Character. */
export const DEFAULT_HANDED_CHARACTER: HandedCharacter = Object.freeze({ handedness: 'right' });
export const dominantSide = (character: HandedCharacter): HandSide => character.handedness;
export const offSide = (character: HandedCharacter): HandSide => (character.handedness === 'right' ? 'left' : 'right');

export interface CharacterState {
  handedness: HandSide;
  skills: Record<string, number>;
  practice: Record<string, number>;
  knownRecipes: string[];
}

export const SKILL_LEVEL_MIN = 0;
export const SKILL_LEVEL_MAX = 10;
export const SKILL_LEVEL_LEGENDARY = SKILL_LEVEL_MAX + 1;
const LEGENDARY_LEVEL_PRACTICE = 1_000_000;

/** BR ruled legendary is mostly vanity; its effects match ordinary level 10. */
export const skillEffectLevel = (level: number): number => Math.min(level, SKILL_LEVEL_MAX);

/** Shared diminishing-return curve for effects that improve with skill. */
export const skillSaturation = (effectLevel: number, floor: number, halfLife: number): number =>
  floor + (1 - floor) * (halfLife / (halfLife + effectLevel));

/** Practice required for the next level grows with the level already reached. */
export const practiceForNextLevel = (level: number): number => {
  if (level === SKILL_LEVEL_LEGENDARY) {
    return Number.POSITIVE_INFINITY;
  }
  if (level === SKILL_LEVEL_MAX) {
    return LEGENDARY_LEVEL_PRACTICE;
  }
  return 10 * (level + 1);
};

const validSkillPractice = (level: number, practice: number | undefined): practice is number =>
  practice !== undefined &&
  Number.isFinite(practice) &&
  practice >= 0 &&
  (level === SKILL_LEVEL_LEGENDARY ? practice === 0 : practice < practiceForNextLevel(level));

/** Explicit starting source, shared with CLI reachability in the next hand-off. */
const STARTING_RECIPES = ['torch', 'candle', 'repair_kit', 'repair_crowbar', 'sawn_plank'] as const;
export const startingKnownRecipes = (registry: Registry): string[] =>
  STARTING_RECIPES.filter((id) => registry.recipes.has(id));

export class Character implements HandedCharacter {
  private readonly side: HandSide;
  get handedness(): HandSide {
    return this.side;
  }

  readonly skills: Record<string, number>;
  readonly practice: Record<string, number>;
  readonly knownRecipes: Set<string>;

  constructor(registry: Registry, options: { handedness?: HandSide | undefined } = {}) {
    const side = options.handedness ?? DEFAULT_HANDED_CHARACTER.handedness;
    if (side !== 'right' && side !== 'left') {
      throw new Error('Invalid character handedness');
    }
    this.side = side;
    this.skills = Object.fromEntries([...registry.skills.keys()].map((id) => [id, SKILL_LEVEL_MIN]));
    this.practice = Object.fromEntries([...registry.skills.keys()].map((id) => [id, 0]));
    this.knownRecipes = new Set(startingKnownRecipes(registry));
  }

  snapshotState(): Readonly<CharacterState> {
    return freezeSnapshot({
      handedness: this.handedness,
      skills: { ...this.skills },
      practice: { ...this.practice },
      knownRecipes: [...this.knownRecipes].sort(),
    });
  }

  /** A tiered activity supplies its own ceiling; an untiered source can train to ordinary level 10. */
  awardPractice(skill: string, amount: number, tier = SKILL_LEVEL_MAX): void {
    if (
      !(Object.hasOwn(this.skills, skill) && Number.isFinite(amount)) ||
      amount < 0 ||
      !Number.isSafeInteger(tier) ||
      tier < SKILL_LEVEL_MIN ||
      tier > SKILL_LEVEL_LEGENDARY
    ) {
      throw new Error(`Invalid practice award for ${skill}`);
    }
    let level = this.skills[skill]!;
    if (level >= tier || amount === 0) {
      return;
    }
    let remaining = this.practice[skill]! + amount;
    while (level < tier && remaining >= practiceForNextLevel(level)) {
      remaining -= practiceForNextLevel(level);
      level += 1;
    }
    this.skills[skill] = level;
    this.practice[skill] = level >= tier ? 0 : remaining;
  }

  learnRecipes(recipes: readonly string[]): void {
    for (const id of recipes) {
      if (!this.knownRecipes.has(id)) {
        this.knownRecipes.add(id);
      }
    }
  }

  static restoreState(registry: Registry, state: CharacterState): Character {
    if (state.handedness !== 'right' && state.handedness !== 'left') {
      throw new Error('Invalid saved character handedness');
    }
    const character = new Character(registry, { handedness: state.handedness });
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
      if (!Number.isSafeInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_LEGENDARY) {
        throw new Error(`Invalid skill level for ${id}`);
      }
      character.skills[id] = level;
      const practice = state.practice[id];
      if (!validSkillPractice(level, practice)) {
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
