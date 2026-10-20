import { expect, it } from 'vitest';
import { PainCue } from '../src/game/painCue.ts';
import { BODY_TUNING_FIXTURE } from './simulationFixture.ts';

const [twinge, agony] = BODY_TUNING_FIXTURE.pain.tiers;
const FRAME = 1 / 60;

/** Pulses begun, deepest drain and settle over `seconds` of frames, with the tier given for each moment. */
const watch = (seconds: number, tierAt: (t: number) => typeof twinge) => {
  const cue = new PainCue();
  let pulses = 0;
  let deepest = 0;
  let state = { desaturation: 0, settle: 1 };
  for (let t = 0; t < seconds; t += FRAME) {
    const previous = state.desaturation;
    state = cue.step(FRAME, tierAt(t));
    pulses += previous === 0 && state.desaturation > 0 ? 1 : 0;
    deepest = Math.max(deepest, state.desaturation);
  }
  return { pulses, deepest, settle: state.settle, last: state.desaturation };
};

it('shows nothing without pain, and a worse tier pulses deeper, more often and settles slower', () => {
  expect(watch(30, () => undefined)).toEqual({ pulses: 0, deepest: 0, settle: 1, last: 0 });
  const mild = watch(30, () => twinge);
  const worst = watch(30, () => agony);
  expect(mild.pulses).toBeGreaterThan(0);
  expect(worst.pulses).toBeGreaterThan(mild.pulses);
  expect(worst.deepest).toBeGreaterThan(mild.deepest);
  expect(worst.settle).toBeGreaterThan(mild.settle);
  expect(mild.settle).toBeGreaterThan(1);
});

it('lets a pulse under way fade once pain eases, and starts no other', () => {
  const eased = watch(30, (t) => (t < 0.1 ? agony : undefined));
  expect(eased).toMatchObject({ pulses: 1, settle: 1, last: 0 });
});
