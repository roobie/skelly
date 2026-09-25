import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Assembly } from '../src/core/schema.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

export const loadFixtures = (): Assembly[] =>
  readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as Assembly);

export const loadFixture = (name: string): Assembly =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Assembly;

/** A deep-cloned fixture with an edit applied. */
export const variant = (name: string, edit: (a: MutableAssembly) => void): Assembly => {
  const a = structuredClone(loadFixture(name)) as MutableAssembly;
  edit(a);
  return a;
};

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
export type MutableAssembly = Mutable<Assembly>;
