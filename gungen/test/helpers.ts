import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAssemblyOrThrow } from '../src/core/parseAssembly.ts';
import type { Assembly } from '../src/core/schema.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

export const loadFixtures = (): Assembly[] =>
  readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => parseAssemblyOrThrow(readFileSync(join(FIXTURES, f), 'utf8'), f));

export const loadFixture = (name: string): Assembly =>
  parseAssemblyOrThrow(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'), `${name}.json`);

/** A deep-cloned fixture with an edit applied. */
export const variant = (name: string, edit: (a: MutableAssembly) => void): Assembly => {
  const a = structuredClone(loadFixture(name)) as MutableAssembly;
  edit(a);
  return a;
};

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
export type MutableAssembly = Mutable<Assembly>;
