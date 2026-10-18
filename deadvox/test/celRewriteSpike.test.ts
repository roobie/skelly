import { Environment, parse } from '@marcbachmann/cel-js';
import { describe, expect, it } from 'vitest';
import { compileModExpression } from '../src/spikes/expressions/celMods.ts';
import { mapChildren, rewriteArithmetic, serializeRewrite, treeShape } from '../src/spikes/expressions/celRewrite.ts';

function compile(source: string, result = 'double') {
  return compileModExpression(source, { schema: { level: 'double' }, result, functions: new Map(), states: new Set() });
}

describe('CEL public AST arithmetic rewrite', () => {
  it.each([
    '1 + 2.0',
    '3.0 - 1',
    '2 * 3.0',
    '7.0 / 2',
    '7 % 2.0',
    '-level',
    '[1.0, 2.0].all(x, -(x * 2) + 3 / 4 - 5 % 2 < 10)',
    '[1.0].exists(x, x / 2 > 0)',
    'true ? {"key": level + 1} : {"key": 0.0}',
  ])('leaves no arithmetic operators, including in admitted macro bodies: %s', (source) => {
    const rewritten = serializeRewrite(parse(source).ast);
    const { ast } = parse(rewritten.source);
    const operators: string[] = [];
    function visit(node: typeof ast): typeof ast {
      operators.push(node.op);
      return mapChildren(node, visit);
    }
    visit(ast);
    let result = 'double';
    if (source.includes('.all(') || source.includes('.exists(')) {
      result = 'bool';
    } else if (source.includes('{')) {
      result = 'map<string, double>';
    }
    visit(parse(compile(source, result).canonical).ast);
    expect(operators.length).toBeGreaterThan(0);
    expect(operators.some((op) => ['+', '-', '*', '/', '%', '-_'].includes(op))).toBe(false);
    expect(treeShape(ast)).toEqual(treeShape(rewriteArithmetic(parse(source).ast)));
  });

  it.each(['1.0 / 0.0', '0.0 / 0.0', '1 % 0', '1000000 * 2', '-(1000000 + 1)'])(
    'rejects invalid native intermediates: %s',
    (source) => {
      const program = compile(source);
      expect(() => program.run({ level: 1 })).toThrow();
    },
  );

  it('accepts new mixed operator signatures without replacing built-ins, and promotes checked integer arithmetic to double', () => {
    const env = new Environment();
    for (const op of ['+', '-', '*', '/', '%']) {
      for (const signature of [`int ${op} double`, `double ${op} int`]) {
        expect(() => env.registerOperator(signature, () => 0)).not.toThrow();
      }
    }
    expect(env.evaluate('7 / 2')).toBe(3n);
    expect(compile('7 / 2').run({})).toBe(3.5);
    expect(compile('2 * level + level * 2 + (level - 1) / 2').run({ level: 3 })).toBe(13);
    expect(() => compile('9223372036854775807 + 1')).toThrow();
  });

  it.each(['"a" + "b"', '[1.0] + [2.0]'])('rejects nonnumeric concatenation at load: %s', (source) => {
    expect(() => compile(source)).toThrow();
  });

  it.each([
    '1.0',
    '1',
    '0.123456789',
    '"escaped\\n\\"☃"',
    'true && !(false || true)',
    'true ? (false ? 1.0 : 2) : 3.0',
  ])('preserves tree structure and literal types: %s', (source) => {
    const original = parse(source).ast;
    expect(treeShape(parse(serializeRewrite(original).source).ast)).toEqual(treeShape(rewriteArithmetic(original)));
  });

  it.each(['1.123456789123', '0.0000000001', 'true == (false == true)'])(
    'rejects serializer fidelity loss instead of compiling changed semantics: %s',
    (source) => {
      expect(() => serializeRewrite(parse(source).ast)).toThrow('serializer changed');
    },
  );

  it('maps load errors after expanded calls back to the original identifier', () => {
    const source = '1 + level * 2 + missing';
    expect(() => compile(source)).toThrow(`offset ${source.indexOf('missing')}\n${source}`);
  });

  it('retains the author arithmetic anchor even when a macro recovers the callback error', () => {
    const source = '[0.0, 1.0].exists(x, (2 + level) / x > 0.0)';
    const program = compile(source, 'bool');
    const node = parse('(2 + level) / x').ast;
    expect(() => program.run({ level: 2 })).toThrow(`offset ${source.indexOf('(2 + level)') + node.start}\n${source}`);
  });
});
