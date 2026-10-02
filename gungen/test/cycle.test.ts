import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAssemblyOrThrow } from '../src/core/parseAssembly.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { buildTimeline, HOLD_SECONDS, PULL_SECONDS, sweepMovingPart } from '../src/viewer/cycle.ts';

const AK_STROKE_METRES = 6.5 * 0.0115;

describe('cocking cycle timeline', () => {
  const timeline = buildTimeline(AK_STROKE_METRES);
  const returnStart = PULL_SECONDS + HOLD_SECONDS;

  it('starts and ends the loop at battery and holds at the full stroke between pull and return', () => {
    expect(timeline.at(0)).toBe(0);
    expect(timeline.at(PULL_SECONDS)).toBeCloseTo(1, 9);
    expect(timeline.at(PULL_SECONDS + HOLD_SECONDS / 2)).toBe(1);
    expect(timeline.at(returnStart + timeline.spring.duration)).toBe(0);
    expect(timeline.at(timeline.total)).toBe(0);
  });

  it('eases the hand pull to rest at both ends but hits the return stop at speed', () => {
    const dt = 0.001;
    const speed = (t: number) => Math.abs(timeline.at(t + dt) - timeline.at(t)) / dt;
    const endOfPull = PULL_SECONDS - dt;
    const endOfReturn = returnStart + timeline.spring.duration - 2 * dt;
    expect(speed(endOfPull)).toBeLessThan(0.05);
    expect(speed(endOfReturn)).toBeGreaterThan(5);
  });

  it('returns by spring an order of magnitude faster than the hand pulls', () => {
    expect(timeline.spring.duration * 10).toBeLessThan(PULL_SECONDS);
  });
});

describe('moving part sweep', () => {
  const load = (name: string) => {
    const assembly = parseAssemblyOrThrow(readFileSync(`fixtures/${name}.json`, 'utf8'), name);
    return validate(assembly, gunDomain).resolved;
  };

  it('finds the AK carrier clear over its whole declared stroke and blocked by the receiver rear just beyond it', () => {
    const sweep = sweepMovingPart(load('archetype-ak'), 'bolt-carrier', 9);
    expect(sweep.clear).toBeGreaterThanOrEqual(sweep.declared);
    expect(sweep.clashes[0]?.pair).toBe('carrier-body x receiver.receiver-ak-rear-adapter');
  });
});
