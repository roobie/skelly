import { expect, it } from 'vitest';
import { Character, type CharacterState } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';

const { registry } = buildRegistry([]);

it.each(['right', 'left'] as const)('a %s character retains its creation handedness through restore', (handedness) => {
  const character = new Character(registry, { handedness });
  const saved = character.snapshotState();
  expect(saved).toMatchObject({ handedness });
  expect(Reflect.set(character, 'handedness', handedness === 'right' ? 'left' : 'right')).toBe(false);
  expect(Character.restoreState(registry, saved).snapshotState()).toEqual(saved);
});

it('a new character defaults right', () => {
  expect(new Character(registry).snapshotState()).toMatchObject({ handedness: 'right' });
});

it.each([undefined, 'ambidextrous'])('saved handedness %s is refused rather than defaulted', (handedness) => {
  const state = { skills: {}, knownRecipes: [], handedness } as unknown as CharacterState;
  expect(() => Character.restoreState(registry, state)).toThrow();
});
