import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAssemblyOrThrow } from '../src/core/parseAssembly.ts';
import type { Assembly } from '../src/core/schema.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const DESIGNS = join(import.meta.dirname, '..', 'designs');

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

export interface CorpusEntry {
  label: string;
  assembly: Assembly;
}

/** Every published design under designs/, as loaded assemblies. */
export const loadDesigns = (): CorpusEntry[] =>
  readdirSync(DESIGNS)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const result = loadGunDesign(readFileSync(join(DESIGNS, f), 'utf8'));
      if (!result.ok) {
        throw new Error(`designs/${f}: ${result.error.code}: ${result.error.message}`);
      }
      return { label: `design ${f}`, assembly: result.design.assembly };
    });

/**
 * The regression corpus that property tests iterate instead of seeds: every fixture that
 * `applies` to the property (default: all but the `broken-*` fixtures, which exist to break a
 * rule) plus every published design.
 */
export const loadCorpus = (
  applies: (fixture: Assembly) => boolean = (a) => !a.name.startsWith('broken-'),
): CorpusEntry[] => [
  ...loadFixtures()
    .filter(applies)
    .map((assembly) => ({ label: `fixture ${assembly.name}`, assembly })),
  ...loadDesigns(),
];
