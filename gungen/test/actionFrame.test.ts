import { validate } from '@skelly/engine/assembly/validate.ts';
import { describe, expect, it } from 'vitest';
import {
  type ActionFrame,
  type CartridgeFrameMeasures,
  type FrameMeasure,
  selectFrame,
  validateActionFrames,
  validateFrameCartridgeClearances,
} from '../src/gun/actionFrame.ts';
import frameContent from '../src/gun/arFrames.json' with { type: 'json' };
import {
  AR_ACTION_FRAMES,
  AR_FRAMES_BY_CALIBRE,
  loadArFrames,
  SMALL_AR_CARTRIDGE,
  SMALL_AR_FRAME,
} from '../src/gun/arFrames.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadDesignAssembly, variant } from './helpers.ts';

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
): CartridgeFrameMeasures => ({ id, maximumOverallLengthMm, maximumHeadDiameterMm, caseLengthMm: null });

const sourceCartridge = (id: string, caseLengthMm: number): CartridgeFrameMeasures => ({
  ...SMALL_AR_CARTRIDGE,
  id,
  caseLengthMm,
});

describe('AR action-frame selection', () => {
  it('keeps every cartridge-bound frame measure beyond its clearance for each cartridge that selects it or a smaller frame', () => {
    expect(
      AR_FRAMES_BY_CALIBRE.flatMap(({ cartridge: selected, frame: selectedFrame }) =>
        AR_ACTION_FRAMES.filter((candidate) => candidate.rank >= selectedFrame.rank).flatMap((candidate) =>
          validateFrameCartridgeClearances(candidate, selected),
        ),
      ),
    ).toEqual([]);
    const carrier = SMALL_AR_FRAME.dimensions.carrierLengthMm;
    const basis = carrier.cartridgeClearance;
    const { caseLengthMm } = SMALL_AR_CARTRIDGE;
    if (!basis || caseLengthMm === null) {
      throw new Error('small AR carrier length needs sourced case-length clearance data');
    }
    const tooShort = {
      ...SMALL_AR_FRAME,
      dimensions: {
        ...SMALL_AR_FRAME.dimensions,
        carrierLengthMm: {
          ...carrier,
          value: caseLengthMm * (basis.multiplier ?? 1) + basis.clearanceMm - 0.1,
        },
      },
    };
    expect(
      validateFrameCartridgeClearances(tooShort, sourceCartridge('short-case', caseLengthMm)).some(
        (issue) => issue.rule === 'frame-clearance' && issue.message.includes('carrierLengthMm'),
      ),
    ).toBe(true);
  });

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
    const small = frame('small', 0, 8, 4);
    const large = frame('large', 1, 10, 6);

    expect(selectFrame([large, small], cartridge('next', 9, 5))).toEqual({ ok: true, frame: large });
  });

  it('reports the largest frame and cartridge measures when no frame fits', () => {
    const small = frame('small', 0, 8, 4);
    const magnum = frame('magnum', 2, 10, 6);

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
    const shorterWider = frame('shorter-wider', 0, 8, 6);
    const longerNarrower = frame('longer-narrower', 1, 10, 4);

    expect(selectFrame([longerNarrower, shorterWider], cartridge('fits-both', 8, 4))).toEqual({
      ok: true,
      frame: shorterWider,
    });
  });

  it('reports a cartridge that is too long for its frame', () => {
    const small = frame('small', 0, 8, 6);
    const result = selectFrame([small], cartridge('too-long', 9, 5));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected a no-fit issue');
    }
    expect(result.issue.message).toContain('maximum overall length 9 mm');
    expect(result.issue.message).toContain('largest frame "small"');
  });

  it('reports a cartridge whose case head is too wide for its frame', () => {
    const onlyFrame = frame('only', 0, 10, 5);
    const result = selectFrame([onlyFrame], cartridge('too-wide', 9, 6));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected a no-fit issue');
    }
    expect(result.issue.rule).toBe('frame-fit');
    expect(result.issue.message).toContain('largest frame "only"');
    expect(result.issue.message).toContain('maximum case head diameter 6 mm');
  });

  it('rejects hand-edited receiver dimensions as unknown design parameters', () => {
    const edited = variant('archetype-ar', (assembly) => {
      assembly.parts.receiver!.params = { ...assembly.parts.receiver!.params, receiverLengthMm: '999' };
    });

    const issue = validate(edited, gunDomain).issues.find((candidate) => candidate.rule === 'structure');

    expect(issue?.message).toContain('has no parameter "receiverLengthMm"');
  });

  it('refuses a malformed frame entry at load and names the problem', () => {
    const withFirstFrame = (edit: (entry: Record<string, unknown>) => void): unknown => {
      const content = structuredClone(frameContent) as { frames: Record<string, unknown>[] };
      edit(content.frames[0]!);
      return content;
    };

    expect(() => loadArFrames(withFirstFrame((entry) => delete entry.rank))).toThrow(/frames\.0\.rank/);
    expect(() => loadArFrames(withFirstFrame((entry) => (entry.cartridge = { id: 'unsourced' })))).toThrow(
      /cartridge is not a cartridge document/,
    );
    const sameRank = structuredClone(frameContent) as { frames: Record<string, unknown>[] };
    sameRank.frames.push({ ...sameRank.frames[0]!, id: 'same-rank' });
    expect(() => loadArFrames(sameRank)).toThrow(/rank must be a unique integer/);
  });

  it('rejects a part built for a different action frame than its receiver', () => {
    const assembly = loadDesignAssembly('archetype-ar');
    const otherFrame = AR_ACTION_FRAMES.find(({ id }) => id !== SMALL_AR_FRAME.id);
    if (!otherFrame) {
      throw new Error('this check needs a second AR frame');
    }
    assembly.parts.lower!.params = { ...assembly.parts.lower!.params, actionFrame: otherFrame.id };

    const issues = validate(assembly, gunDomain).issues.filter((issue) => issue.rule === 'action-frame-match');

    expect(issues.map((issue) => issue.parts)).toEqual([['receiver', 'lower']]);
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
