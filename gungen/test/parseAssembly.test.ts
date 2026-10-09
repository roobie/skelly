import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAssembly, parseAssemblyJson } from '../src/core/parseAssembly.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const fixtureFiles = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));

const minimal = { name: 'm', root: 'a', parts: { a: { family: 'x' } }, connections: [] };

const failure = (value: unknown) => {
  const result = parseAssembly(value);
  if (result.ok) {
    throw new Error('expected a parse failure');
  }
  return result.error;
};

describe('parseAssembly', () => {
  it('round-trips every fixture unchanged', () => {
    expect(fixtureFiles.length).toBeGreaterThan(0);
    for (const file of fixtureFiles) {
      const raw: unknown = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
      const result = parseAssembly(raw);
      expect(result.ok, file).toBe(true);
      if (result.ok) {
        expect(result.assembly, file).toEqual(raw);
        expect(JSON.parse(JSON.stringify(result.assembly)), file).toEqual(raw);
      }
    }
  });

  it('keeps prefab references and optional fields', () => {
    const result = parseAssembly({
      ...minimal,
      description: 'd',
      expect: ['keep-out'],
      parts: {
        a: {
          family: 'x',
          params: { p: 'v' },
          appearance: { finish: { metal: 'instance-finish' } },
          prefab: { id: 'stanag-30', version: 2 },
        },
      },
      connections: [{ from: 'a.p', to: 'b.q', slot: 1, roll: 90 }],
    });
    expect(result.ok && result.assembly.parts.a?.prefab).toEqual({ id: 'stanag-30', version: 2 });
    expect(result.ok && result.assembly.parts.a?.appearance).toEqual({ finish: { metal: 'instance-finish' } });
    expect(result.ok && result.assembly.connections[0]).toEqual({ from: 'a.p', to: 'b.q', slot: 1, roll: 90 });
  });

  it('does not let a __proto__ part id change the prototype', () => {
    const result = parseAssemblyJson('{"name":"m","root":"a","parts":{"__proto__":{"family":"x"}},"connections":[]}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.assembly.parts)).toEqual(['__proto__']);
      expect(Object.getPrototypeOf(result.assembly.parts)).toBe(Object.prototype);
    }
  });

  it('reports malformed JSON', () => {
    const result = parseAssemblyJson('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('invalid JSON');
    }
  });

  it.each([
    ['a non-object', 5, ''],
    ['a missing name', { ...minimal, name: undefined }, 'name'],
    ['a non-string root', { ...minimal, root: 3 }, 'root'],
    ['parts as an array', { ...minimal, parts: [] }, 'parts'],
    ['a part without family', { ...minimal, parts: { a: {} } }, 'parts.a.family'],
    ['a non-string param value', { ...minimal, parts: { a: { family: 'x', params: { p: 3 } } } }, 'parts.a.params.p'],
    [
      'a non-string instance finish value',
      { ...minimal, parts: { a: { family: 'x', appearance: { finish: { metal: 3 } } } } },
      'parts.a.appearance.finish.metal',
    ],
    [
      'a fractional prefab version',
      { ...minimal, parts: { a: { family: 'x', prefab: { id: 'p', version: 1.5 } } } },
      'parts.a.prefab.version',
    ],
    [
      'a zero prefab version',
      { ...minimal, parts: { a: { family: 'x', prefab: { id: 'p', version: 0 } } } },
      'parts.a.prefab.version',
    ],
    ['connections not an array', { ...minimal, connections: {} }, 'connections'],
    ['a connection without to', { ...minimal, connections: [{ from: 'a.b' }] }, 'connections[0].to'],
    ['a fractional slot', { ...minimal, connections: [{ from: 'a.b', to: 'c.d', slot: 0.5 }] }, 'connections[0].slot'],
    ['a string roll', { ...minimal, connections: [{ from: 'a.b', to: 'c.d', roll: '90' }] }, 'connections[0].roll'],
    ['a non-string expect entry', { ...minimal, expect: [1] }, 'expect[0]'],
  ])('rejects %s', (_label, value, path) => {
    const error = failure(value);
    expect(error.path).toBe(path);
    expect(error.message.length).toBeGreaterThan(0);
  });
});
