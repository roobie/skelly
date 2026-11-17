// Character progression owner: levels, source-agnostic practice and recipe knowledge.

import { innateAttributes, knownAttributes, savedAttributesMatch } from './attributes.ts';
import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';
import type { HandSide } from './inventory.ts';
import { type EffectActor, type EffectTrace, type Modifier, modified, type SkilledActor } from './modifiers.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from './skillLevels.ts';
import { freezeSnapshot } from './snapshotData.ts';

/** The character view inventory mechanisms read: which hand leads, and what effects resolve against. */
export interface HandedCharacter extends EffectActor {
  readonly handedness: HandSide;
}

/** Standalone fixtures share this view; production supplies its actual Character. */
export const DEFAULT_HANDED_CHARACTER: HandedCharacter = Object.freeze({ handedness: 'right' });
export const dominantSide = (character: HandedCharacter): HandSide => character.handedness;
export const offSide = (character: HandedCharacter): HandSide => (character.handedness === 'right' ? 'left' : 'right');

export interface CharacterState {
  handedness: HandSide;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  practice: Record<string, number>;
  knownRecipes: string[];
}

const LEGENDARY_LEVEL_PRACTICE = 1_000_000;

/** Legendary is mostly vanity: its effects match ordinary level 10. */
export const skillEffectLevel = (level: number): number => Math.min(level, SKILL_LEVEL_MAX);

/** Skill levels by mechanism role, for the resolver; a role no skill provides is level zero. */
export const skillsByRole = (
  registry: Registry,
  skills: Readonly<Record<string, number>> | undefined,
): SkilledActor => ({
  skillLevel: (role) => {
    const provider = claimed(registry.skills, role);
    return skillEffectLevel((provider && skills?.[provider.id]) ?? SKILL_LEVEL_MIN);
  },
});

/** Practice required for the next level grows with the level already reached. */
export const practiceForNextLevel = (registry: Registry, level: number): number => {
  if (level === SKILL_LEVEL_LEGENDARY) {
    return Number.POSITIVE_INFINITY;
  }
  if (level === SKILL_LEVEL_MAX) {
    return LEGENDARY_LEVEL_PRACTICE;
  }
  const progression = claimed(registry.skillProgression, 'progression');
  if (progression === undefined) {
    throw new Error('Missing skill progression content');
  }
  return progression.practicePerLevel * (level + 1);
};

const validSkillPractice = (registry: Registry, level: number, practice: number | undefined): practice is number =>
  practice !== undefined &&
  Number.isFinite(practice) &&
  practice >= 0 &&
  (level === SKILL_LEVEL_LEGENDARY ? practice === 0 : practice < practiceForNextLevel(registry, level));

export interface CharacterOptions {
  readonly handedness?: HandSide | undefined;
  /** What the character's worn and wielded items change, read whenever an effect resolves. */
  readonly modifierSource?: (() => readonly Modifier[]) | undefined;
}

export class Character implements HandedCharacter, SkilledActor {
  skillForCapability(capability: string): string | undefined {
    return claimed(this.registry.skills, capability)?.id;
  }

  skillLevel(role: string): number {
    return skillsByRole(this.registry, this.skills).skillLevel(role);
  }

  private readonly side: HandSide;
  private readonly registry: Registry;
  private readonly modifierSource: () => readonly Modifier[];
  get handedness(): HandSide {
    return this.side;
  }

  get modifiers(): readonly Modifier[] {
    return this.modifierSource();
  }

  /** Innate values, before any modifier, on the ratio scale. */
  readonly attributes: Record<string, number>;
  /** The latest resolution of each effect, for the debug readout. */
  readonly trace: EffectTrace = new Map();
  readonly skills: Record<string, number>;
  readonly practice: Record<string, number>;
  readonly knownRecipes: Set<string>;

  constructor(registry: Registry, options: CharacterOptions = {}) {
    const side = options.handedness ?? DEFAULT_HANDED_CHARACTER.handedness;
    if (side !== 'right' && side !== 'left') {
      throw new Error('Invalid character handedness');
    }
    this.side = side;
    this.registry = registry;
    this.modifierSource = options.modifierSource ?? (() => []);
    this.attributes = innateAttributes(registry);
    this.skills = Object.fromEntries([...registry.skills.keys()].map((id) => [id, SKILL_LEVEL_MIN]));
    this.practice = Object.fromEntries([...registry.skills.keys()].map((id) => [id, 0]));
    this.knownRecipes = new Set();
    for (const recipe of registry.recipes.values()) {
      const unlock = recipe.skillUnlock;
      if (unlock && (!claimed(registry.skills, unlock.skill) || unlock.level === SKILL_LEVEL_MIN)) {
        this.learnRecipes([recipe.id]);
      }
    }
  }

  initializeAttributes(values: Readonly<Record<string, number>>): void {
    if (!knownAttributes(this.registry, values)) {
      throw new Error('Invalid starting attributes');
    }
    Object.assign(this.attributes, values);
  }

  initializeProgression(skills: Readonly<Record<string, number>>, recipes: readonly string[]): void {
    for (const [id, level] of Object.entries(skills)) {
      if (
        !(this.registry.skills.has(id) && Number.isSafeInteger(level)) ||
        level < SKILL_LEVEL_MIN ||
        level > SKILL_LEVEL_LEGENDARY
      ) {
        throw new Error(`Invalid starting skill ${id}`);
      }
    }
    for (const id of recipes) {
      if (!this.registry.recipes.has(id)) {
        throw new Error(`Invalid starting recipe ${id}`);
      }
    }
    for (const [id, level] of Object.entries(skills)) {
      this.skills[id] = level;
      this.practice[id] = 0;
      this.learnSkillRecipes(id, level);
    }
    this.learnRecipes(recipes);
  }

  snapshotState(): Readonly<CharacterState> {
    return freezeSnapshot({
      handedness: this.handedness,
      attributes: { ...this.attributes },
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
    const gain = modified('practice.gain', amount, this, {
      attributes: claimed(this.registry.skillProgression, 'progression')?.attributes?.practice,
    });
    let remaining = this.practice[skill]! + gain;
    while (level < tier && remaining >= practiceForNextLevel(this.registry, level)) {
      remaining -= practiceForNextLevel(this.registry, level);
      level += 1;
    }
    if (level > this.skills[skill]!) {
      this.learnSkillRecipes(skill, level);
    }
    this.skills[skill] = level;
    this.practice[skill] = level >= tier ? 0 : remaining;
  }

  private learnSkillRecipes(skill: string, level: number): void {
    for (const recipe of this.registry.recipes.values()) {
      if (
        recipe.skillUnlock &&
        claimed(this.registry.skills, recipe.skillUnlock.skill)?.id === skill &&
        recipe.skillUnlock.level <= level
      ) {
        this.learnRecipes([recipe.id]);
      }
    }
  }

  learnRecipes(recipes: readonly string[]): void {
    for (const id of recipes) {
      if (!this.knownRecipes.has(id)) {
        this.knownRecipes.add(id);
      }
    }
  }

  static restoreState(
    registry: Registry,
    state: CharacterState,
    options: Omit<CharacterOptions, 'handedness'> = {},
  ): Character {
    if (state.handedness !== 'right' && state.handedness !== 'left') {
      throw new Error('Invalid saved character handedness');
    }
    const character = new Character(registry, { ...options, handedness: state.handedness });
    if (!savedAttributesMatch(registry, state.attributes)) {
      throw new Error('Saved attributes do not match the character attribute definitions');
    }
    Object.assign(character.attributes, state.attributes);
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
      if (!validSkillPractice(registry, level, practice)) {
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
