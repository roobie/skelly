import { describe, expect, it } from 'vitest';
import { validate } from '../src/core/validate.ts';
import {
  type ActionFrame,
  AR_FRAME_RANKS,
  type CartridgeFrameMeasures,
  type FrameMeasure,
  selectFrame,
  validateActionFrames,
} from '../src/gun/actionFrame.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { variant } from './helpers.ts';

const estimate = (value: number): FrameMeasure => ({
  value,
  evidence: { kind: 'estimate', method: 'synthetic test fixture' },
});

const frame = (
  id: string,
  rank: number,
  maximumOverallLengthMm: number,
  maximumHeadDiameterMm: number,
): ActionFrame => ({
  id,
  rank,
  fit: {
    maximumOverallLengthMm: estimate(maximumOverallLengthMm),
    maximumHeadDiameterMm: estimate(maximumHeadDiameterMm),
  },
  dimensions: {
    carrierLengthMm: estimate(1),
    carrierTravelMm: estimate(1),
    receiverLengthMm: estimate(1),
    receiverHeightMm: estimate(1),
    ejectionPortLengthMm: estimate(1),
    ejectionPortHeightMm: estimate(1),
    magwellOpeningLengthMm: estimate(1),
    magwellOpeningWidthMm: estimate(1),
    barrelExtensionLengthMm: estimate(1),
    barrelExtensionDiameterMm: estimate(1),
  },
});

const cartridge = (
  id: string,
  maximumOverallLengthMm: number | null,
  maximumHeadDiameterMm: number | null,
): CartridgeFrameMeasures => ({ id, maximumOverallLengthMm, maximumHeadDiameterMm });

describe('AR action-frame selection', () => {
  it('validates frame data evidence and unique ranks', () => {
    const first = frame('first', 0, 10, 5);
    const invalid = {
      ...frame('second', 0, 11, 6),
      fit: {
        ...frame('second', 0, 11, 6).fit,
        maximumOverallLengthMm: { value: 11, evidence: { kind: 'estimate' as const, method: '' } },
      },
    };

    const issues = validateActionFrames([first, invalid]);

    expect(issues.map((issue) => issue.rule)).toEqual(['frame-data', 'frame-data']);
    expect(issues.some((issue) => issue.message.includes('rank must be a unique integer'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('needs a source citation or an estimate method'))).toBe(true);
  });

  it('accepts a cartridge exactly on both frame limits', () => {
    const onlyFrame = frame('only', 0, 10, 5);

    const result = selectFrame([onlyFrame], cartridge('boundary', 10, 5));

    expect(result).toEqual({ ok: true, frame: onlyFrame });
  });

  it('selects the next rank when the cartridge exceeds the smaller frame', () => {
    const small = frame('small', AR_FRAME_RANKS.small, 8, 4);
    const large = frame('large', AR_FRAME_RANKS.large, 10, 6);

    expect(selectFrame([large, small], cartridge('next', 9, 5))).toEqual({ ok: true, frame: large });
  });

  it('reports the largest frame and cartridge measures when no frame fits', () => {
    const small = frame('small', AR_FRAME_RANKS.small, 8, 4);
    const magnum = frame('magnum', AR_FRAME_RANKS.magnum, 10, 6);

    const result = selectFrame([small, magnum], cartridge('oversize', 11, 7));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected a no-fit issue');
    }
    expect(result.issue.rule).toBe('frame-fit');
    expect(result.issue.message).toContain('largest frame "magnum"');
    expect(result.issue.message).toContain('maximum overall length 11 mm');
    expect(result.issue.message).toContain('maximum case head diameter 7 mm');
  });

  it('uses explicit rank when two fitting envelopes are incomparable', () => {
    const shorterWider = frame('shorter-wider', 0, 10, 4);
    const longerNarrower = frame('longer-narrower', 1, 8, 6);

    expect(selectFrame([longerNarrower, shorterWider], cartridge('fits-both', 8, 4))).toEqual({
      ok: true,
      frame: shorterWider,
    });
  });

  it('reports a cartridge that is too long for its frame', () => {
    const small = frame('small', AR_FRAME_RANKS.small, 8, 6);
    const result = selectFrame([small], cartridge('too-long', 9, 5));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected a no-fit issue');
    }
    expect(result.issue.message).toContain('maximum overall length 9 mm');
    expect(result.issue.message).toContain('largest frame "small"');
  });

  it('rejects hand-edited receiver dimensions as unknown design parameters', () => {
    const edited = variant('archetype-ar', (assembly) => {
      assembly.parts.receiver!.params = { ...assembly.parts.receiver!.params, receiverLengthMm: '999' };
    });

    const issue = validate(edited, gunDomain).issues.find((candidate) => candidate.rule === 'structure');

    expect(issue?.message).toContain('has no parameter "receiverLengthMm"');
  });

  it('does not select a frame when a required cartridge measure is unsourced', () => {
    const onlyFrame = frame('only', 0, 10, 5);
    const result = selectFrame([onlyFrame], cartridge('incomplete', null, 4));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected a no-fit issue');
    }
    expect(result.issue.message).toContain('maximum overall length unknown');
  });
});
