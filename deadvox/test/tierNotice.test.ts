import { expect, it } from 'vitest';
import { TierNotice } from '../src/game/tierNotice.ts';
import { BODY_TUNING_FIXTURE, fixtureTier } from './simulationFixture.ts';

const { tiers } = BODY_TUNING_FIXTURE.bleeding;
const MINOR = fixtureTier('minor');
const SERIOUS = fixtureTier('serious');
const CRITICAL = fixtureTier('critical');

const notices = (initial: number | undefined, steps: readonly (number | undefined)[]): string[] => {
  const notice = new TierNotice(initial);
  const spoken: string[] = [];
  for (const worst of steps) {
    notice.update(worst, tiers, (text) => spoken.push(text));
  }
  return spoken;
};

it('names each worsening once, including a later re-bleed after treatment', () => {
  expect(notices(undefined, [SERIOUS, SERIOUS, CRITICAL, CRITICAL, undefined, SERIOUS])).toEqual([
    tiers[SERIOUS]!.notice,
    tiers[CRITICAL]!.notice,
    tiers[SERIOUS]!.notice,
  ]);
});

it('passes a tier without a notice unmentioned, and still names a wound that worsens from one', () => {
  expect(tiers[MINOR]!.notice).toBeUndefined();
  expect(notices(undefined, [MINOR, MINOR, CRITICAL])).toEqual([tiers[CRITICAL]!.notice]);
});

it('does not report an already-bleeding loaded body as a new wound', () => {
  expect(notices(CRITICAL, [CRITICAL, SERIOUS])).toEqual([]);
});
