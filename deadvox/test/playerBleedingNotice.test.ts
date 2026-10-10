import { expect, it } from 'vitest';
import type { BleedingTier } from '../src/core/body.ts';
import { PlayerBleedingNotice } from '../src/game/playerBleedingNotice.ts';

const notices = (initial: BleedingTier | null, steps: readonly (BleedingTier | null)[]): BleedingTier[] => {
  const notice = new PlayerBleedingNotice(initial);
  const spoken: BleedingTier[] = [];
  for (const worst of steps) {
    notice.update(worst, (tier) => spoken.push(tier));
  }
  return spoken;
};

it('names each worsening once, including a later re-bleed after treatment', () => {
  expect(notices(null, ['moderate', 'moderate', 'heavy', 'heavy', null, 'moderate'])).toEqual([
    'moderate',
    'heavy',
    'moderate',
  ]);
});

it('passes a scratch without mention, and still names a wound that worsens from one', () => {
  expect(notices(null, ['scratch', 'scratch', 'arterial'])).toEqual(['arterial']);
});

it('does not report an already-bleeding loaded body as a new wound', () => {
  expect(notices('heavy', ['heavy', 'moderate'])).toEqual([]);
});
