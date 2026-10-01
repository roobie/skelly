import type { MoodState } from '../src/core/mood.ts';

/** The state half of `Mood`, which needs a WebGL renderer for the rest. */
export class FakeMood {
  post = true;
  bloom = true;
  film = true;
  grade = 1;
  crackCheck = false;

  setCrackCheck(on: boolean): void {
    this.crackCheck = on;
  }

  restore(state: MoodState): void {
    Object.assign(this, state);
  }

  setPost(on: boolean): void {
    this.post = on;
  }

  setBloom(on: boolean): void {
    this.bloom = on;
  }

  setFilm(on: boolean): void {
    this.film = on;
  }

  setGrade(strength: number): void {
    this.grade = strength;
  }
}
