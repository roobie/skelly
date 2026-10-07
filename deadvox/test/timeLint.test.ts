import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  compareRuntimeTemporalCounts,
  mixedArithmeticFindings,
  runtimeTemporalCounts,
  temporalNameFindings,
} from '../tools/time-lint.mjs';

const fixture = (name: string) => `test/fixtures/time-lint/${name}`;
const FIELD_NAME = /"([^"]+)"/;

describe('time lint boundary and naming rules', () => {
  it('rejects a Real clock source in a simulation dependency', () => {
    const findings = analyzeFiles([fixture('real-source.ts')]);
    expect(findings.some((finding) => finding.includes('performance'))).toBe(true);
    expect(findings.some((finding) => finding.includes('AudioContext.currentTime'))).toBe(true);
  });

  it('requires a clock immediately before the unit token and ignores ordinal seconds', () => {
    const findings = temporalNameFindings(
      'fixture.json',
      `{
        "duration": 3,
        "fooSeconds": 1,
        "fooPerHour": 2,
        "rpm": 3,
        "fooMs": 4,
        "fooRpm": 5,
        "fooMsReal": 6,
        "first": 7,
        "second": 8,
        "secondary": 9,
        "durationSimSeconds": 10,
        "roundsPerSimMinute": 11,
        "renderGameTimeOfDay": 12,
        "fooSimSecondsPerHour": 13,
        "gameTimeOfDayMs": 14,
        "hour": 15,
        "minute": 16,
        "gameHourOfDay": 17,
        "gameMinute": 18
      }`,
      'json',
    );
    expect(findings.map((finding) => finding.match(FIELD_NAME)?.[1])).toEqual([
      'duration',
      'fooSeconds',
      'fooPerHour',
      'rpm',
      'fooMs',
      'fooRpm',
      'fooMsReal',
      'fooSimSecondsPerHour',
      'gameTimeOfDayMs',
      'hour',
      'minute',
    ]);
  });

  it('rejects arithmetic that combines branded clocks', () => {
    const source = readFileSync(fixture('mixed-clocks.ts'), 'utf8');
    expect(mixedArithmeticFindings(fixture('mixed-clocks.ts'), source)).toHaveLength(1);
  });

  it('ratchets new ambiguous runtime names and requires fixed entries to leave the baseline', () => {
    const file = fixture('runtime-ambiguous.ts');
    const observed = runtimeTemporalCounts([file]);
    const baseline = [{ file, name: 'time', count: 1 }];
    expect(compareRuntimeTemporalCounts(observed, baseline)).toEqual([]);
    expect(compareRuntimeTemporalCounts([{ file, name: 'time', count: 2 }], baseline)).toEqual([
      { kind: 'new', file, name: 'time', count: 1 },
    ]);
    expect(compareRuntimeTemporalCounts([], baseline)).toEqual([{ kind: 'stale', file, name: 'time', count: 1 }]);
  });
});
