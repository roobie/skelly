import { describe, expect, it } from 'vitest';
import { compileRuleExpression } from '../src/core/ruleExpressions.ts';

const context = { abilityLevel: 5n, originX: 1e308 };
const SERIALIZER_ERROR = /serializ/i;
const evaluate = (source: string, type: 'int' | 'double' | 'bool' = 'bool') =>
  compileRuleExpression(source, type).evaluate(context);

describe('checked scalar rule expressions', () => {
  it('types authored level scaling and explicit numeric conversions', () => {
    expect(evaluate('min(8, 1 + abilityLevel / 2)', 'int')).toBe(3n);
    expect(evaluate('4.0 + double(abilityLevel) * 1.5', 'double')).toBe(11.5);
    expect(evaluate('int(floor(2.75))', 'int')).toBe(2n);
    expect(() => compileRuleExpression('abilityLevel + 1.0', 'double')).toThrow();
    expect(() => compileRuleExpression('abilityLevell + 1', 'int')).toThrow();
    expect(() => compileRuleExpression('abilityLevel', 'bool')).toThrow();
  });

  it('latches arithmetic and conversion failures even when CEL logic could recover', () => {
    for (const source of [
      '(1.0 / 0.0 > 0.0) || true',
      '(9223372036854775807 + 1 > 0) || true',
      '(originX * 2.0 > 0.0) || true',
      '(1 / 0 == 0) || true',
      '(int(originX) > 0) || true',
      '(double(9007199254740993) > 0.0) || true',
    ]) {
      const compiled = compileRuleExpression(source, 'bool');
      expect(() => compiled.evaluate(context), source).toThrow();
    }
    // An unvisited branch performs no work and must not poison the next evaluation.
    const compiled = compileRuleExpression('abilityLevel == 0 || 1 / abilityLevel > 0', 'bool');
    expect(compiled.evaluate({ abilityLevel: 0n })).toBe(true);
    expect(compiled.evaluate({ abilityLevel: 1n })).toBe(true);
    expect(() => evaluate('abilityLevel > 0.0')).toThrow();
    expect(() => compiled.evaluate({})).toThrow('missing rule context');
    expect(() => compiled.evaluate({ abilityLevel: 1 })).toThrow('invalid rule context');
    const reused = compileRuleExpression('(1 / (abilityLevel - 4) == 0) || true', 'bool');
    expect(() => reused.evaluate({ abilityLevel: 4n })).toThrow();
    expect(reused.evaluate({ abilityLevel: 5n })).toBe(true);
  });

  it('refuses serializer changes to literal precision or operator grouping', () => {
    expect(() => compileRuleExpression('0.123456789123', 'double')).toThrow(SERIALIZER_ERROR);
    expect(() => compileRuleExpression('abilityLevel - (2 - 1)', 'int')).toThrow(SERIALIZER_ERROR);
    expect(evaluate('abilityLevel - 2 - 1', 'int')).toBe(2n);
  });

  it('reserves structural work and excludes traversal, arbitrary calls and private helpers', () => {
    for (const source of ['[1, 2].map(x, x + 1)', 'timestamp("2020-01-01T00:00:00Z")', '__add(1, 2)', '"a" + "b"']) {
      expect(() => compileRuleExpression(source, 'int'), source).toThrow();
    }
    expect(() => compileRuleExpression(`${'1 + '.repeat(300)}1`, 'int')).toThrow();
    expect(() => compileRuleExpression(`${'('.repeat(100)}1${')'.repeat(100)}`, 'int')).toThrow();
    expect(() => compileRuleExpression(`${' '.repeat(9000)}1`, 'int')).toThrow();
    expect(() => evaluate('9223372036854775808', 'int')).toThrow();
  });
});
