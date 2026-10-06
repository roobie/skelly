import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeFiles, mixedArithmeticFindings, temporalNameFindings } from '../tools/time-lint.mjs';

const fixture = (name: string) => `test/fixtures/time-lint/${name}`;

describe('time lint boundary and naming rules', () => {
  it('rejects a Real clock source in a simulation dependency', () => {
    const findings = analyzeFiles([fixture('real-source.ts')]);
    expect(findings.some((finding) => finding.includes('performance'))).toBe(true);
  });

  it('rejects temporal schema and content fields without a clock and unit', () => {
    const findings = temporalNameFindings('fixture.json', '{"duration": 3}', 'json');
    expect(findings).toHaveLength(1);
  });

  it('rejects arithmetic that combines branded clocks', () => {
    const source = readFileSync(fixture('mixed-clocks.ts'), 'utf8');
    expect(mixedArithmeticFindings(fixture('mixed-clocks.ts'), source)).toHaveLength(1);
  });
});
