import type { LookDefaults } from '../src/core/mood.ts';

// A default look of the test's own, with every switch on and the tone mapper non-trivial, so the
// URL tests exercise both directions of each switch without depending on the content's look.
export const LOOK_FIXTURE: LookDefaults = {
  tone: 'auto',
  exposure: 3,
  srgb: true,
  patterns: true,
  vao: true,
  post: true,
  bloom: true,
  film: true,
  grade: 1,
};
