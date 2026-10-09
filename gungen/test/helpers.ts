import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TriangleMesh } from '@skelly/engine/core/mesh.ts';
import { parseAssemblyOrThrow } from '@skelly/engine/core/parseAssembly.ts';
import type { Assembly } from '@skelly/engine/core/schema.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const DESIGNS = join(import.meta.dirname, '..', 'designs');

export const expectWatertightMesh = (mesh: TriangleMesh, label = 'mesh'): number => {
  const weld = (index: number): string =>
    [0, 1, 2].map((axis) => (Math.round(mesh.positions[index * 3 + axis]! * 100_000) / 100_000).toFixed(5)).join(',');
  const directed = new Map<string, number>();
  const faces = new Set<string>();
  let signedVolume = 0;
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const points = [0, 1, 2].map((corner) => {
      const index = mesh.indices[offset + corner]! * 3;
      return [mesh.positions[index]!, mesh.positions[index + 1]!, mesh.positions[index + 2]!] as const;
    });
    const [a, b, c] = points as [
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
    ];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area2 = Math.hypot(
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    );
    if (!(area2 > 1e-10)) {
      throw new Error(`${label}: degenerate triangle at index ${offset / 3}`);
    }
    const keys = [0, 1, 2].map((corner) => weld(mesh.indices[offset + corner]!));
    const faceKey = [...keys].sort().join('|');
    if (faces.has(faceKey)) {
      throw new Error(`${label}: duplicate face ${faceKey}`);
    }
    faces.add(faceKey);
    for (let edge = 0; edge < 3; edge++) {
      const from = keys[edge]!;
      const to = keys[(edge + 1) % 3]!;
      const key = `${from}>${to}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
    signedVolume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  if (mesh.triangleCount <= 0) {
    throw new Error(`${label}: empty mesh`);
  }
  for (const [edge, count] of directed) {
    const [from, to] = edge.split('>');
    if (count !== (directed.get(`${to}>${from}`) ?? 0)) {
      throw new Error(`${label}: unmatched directed edge ${edge}`);
    }
  }
  if (signedVolume <= 0) {
    throw new Error(`${label}: non-positive signed volume`);
  }
  return signedVolume;
};

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
    .filter((f) => f.endsWith('.json') && !f.startsWith('look-'))
    .sort()
    .flatMap((f) => {
      const result = loadGunDesign(readFileSync(join(DESIGNS, f), 'utf8'));
      if (!result.ok) {
        throw new Error(`designs/${f}: ${result.error.code}: ${result.error.message}`);
      }
      return result.declaredStatus === 'published' && result.design.status === 'published'
        ? [{ label: `design ${f}`, assembly: result.design.assembly }]
        : [];
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
