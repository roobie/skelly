import { describe, expect, it } from 'vitest';
import { continueActionResumesJob } from '../src/game/continueAction.ts';

describe('continue action routing', () => {
  it('resumes a Wait job instead of starting compression', () => {
    expect(continueActionResumesJob('wait')).toBe(true);
    expect(continueActionResumesJob(undefined)).toBe(false);
  });
});
