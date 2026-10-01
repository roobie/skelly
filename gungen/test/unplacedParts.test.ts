import { describe, expect, it } from 'vitest';
import { resolve } from '../src/core/resolve.ts';
import { CORE_RULES } from '../src/core/rules.ts';
import type { Assembly } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixtures, type MutableAssembly, variant } from './helpers.ts';
import { runSweeps, sweepGroup } from './sweeps.ts';

const ALL_RULES = [...CORE_RULES, ...(gunDomain.rules ?? [])];

const touches = (ref: string, part: string): boolean => ref.startsWith(`${part}.`);

interface BrokenVariant {
  /** Which way the fixture was broken; the default run samples the first variant of each kind. */
  kind: 'disconnected' | 'missing-port' | 'missing-root';
  name: string;
  assembly: Assembly;
}

/** Every way a part can end up unplaced: cut off from the root, wired to a missing port, or no usable root. */
const brokenVariants = (assembly: Assembly): BrokenVariant[] => {
  const out: BrokenVariant[] = [];
  const edit = (kind: BrokenVariant['kind'], name: string, fn: (a: MutableAssembly) => void): void => {
    const copy = structuredClone(assembly) as MutableAssembly;
    fn(copy);
    out.push({ kind, name: `${assembly.name}: ${name}`, assembly: copy });
  };
  for (const part of Object.keys(assembly.parts)) {
    if (part === assembly.root) {
      continue;
    }
    edit('disconnected', `${part} disconnected`, (a) => {
      a.connections = a.connections.filter((c) => !(touches(c.from, part) || touches(c.to, part)));
    });
  }
  assembly.connections.forEach((_, i) => {
    edit('missing-port', `connection #${i} to a missing port`, (a) => {
      a.connections[i]!.to = `${a.connections[i]!.to.split('.')[0]}.no-such-port`;
    });
  });
  edit('missing-root', 'missing root', (a) => {
    a.root = 'no-such-part';
  });
  return out;
};

/** The first variant of each kind: enough to hit every way of breaking a fixture, a fraction of the cost. */
const sampleVariants = (variants: BrokenVariant[]): BrokenVariant[] => {
  const seen = new Set<BrokenVariant['kind']>();
  return variants.filter(({ kind }) => {
    if (seen.has(kind)) {
      return false;
    }
    seen.add(kind);
    return true;
  });
};

interface ResolvedVariant {
  name: string;
  resolved: ReturnType<typeof resolve> | undefined;
  /** Set when resolve() itself threw; reported as a failure by every rule. */
  error: Error | undefined;
}

/** Resolves each variant once, so the rules reuse it instead of re-resolving per rule. */
const resolveAll = (variants: BrokenVariant[]): ResolvedVariant[] =>
  variants.map(({ name, assembly }) => {
    try {
      return { name, resolved: resolve(assembly, gunDomain), error: undefined };
    } catch (error) {
      return { name, resolved: undefined, error: error as Error };
    }
  });

/**
 * Per-rule timeout, proportional to the number of variants. solid-overlap, the slowest rule, took
 * about 15 ms per variant on the sample and 40 ms on the full set (23 s for 587) on a host at load 6-8;
 * 100 ms leaves headroom for a loaded host without a flat, oversized limit.
 */
const MS_PER_VARIANT = 100;

const defineRuleChecks = (resolvedVariants: ResolvedVariant[]): void => {
  for (const rule of ALL_RULES) {
    it(
      `${rule.id} does not throw on any unplaced-part variant`,
      () => {
        const failures: string[] = [];
        for (const { name, resolved, error } of resolvedVariants) {
          if (error || !resolved) {
            failures.push(`${name}: ${error?.message}`);
            continue;
          }
          try {
            rule.check(resolved);
          } catch (checkError) {
            failures.push(`${name}: ${(checkError as Error).message}`);
          }
        }
        expect(failures).toEqual([]);
      },
      resolvedVariants.length * MS_PER_VARIANT,
    );
  }
};

const cutOffHandguard = () =>
  variant('archetype-ar-free-float', (x) => {
    x.connections = x.connections.filter((c) => !(touches(c.from, 'handguard') || touches(c.to, 'handguard')));
  });

describe('rules on assemblies with unplaced parts', () => {
  it('validate() does not throw when the free-float handguard is cut off', () => {
    const a = cutOffHandguard();
    expect(resolve(a, gunDomain).placed.has('handguard')).toBe(false);
    expect(() => validate(a, gunDomain)).not.toThrow();
  });

  it('validate() does not throw when a pistol part is wired to a missing port', () => {
    const a = variant('archetype-pistol', (x) => {
      x.connections[0]!.to = `${x.connections[0]!.to.split('.')[0]}.no-such-port`;
    });
    expect(() => validate(a, gunDomain)).not.toThrow();
  });

  const perFixture = loadFixtures().map(brokenVariants);
  const allVariants = perFixture.flat();
  const sampled = perFixture.flatMap(sampleVariants);

  it('has variants to sweep', () => {
    expect(sampled.length).toBeGreaterThan(50);
    expect(allVariants.length).toBeGreaterThan(sampled.length);
  });

  describe('on the first variant of each kind per fixture', () => {
    defineRuleChecks(resolveAll(sampled));
  });

  sweepGroup('on every variant of every fixture', () => {
    // A skipped group still runs its body, so resolve nothing in the default run.
    defineRuleChecks(resolveAll(runSweeps ? allVariants : []));
  });

  it('leaves reporting the unplaced part to the structure and required-ports checks', () => {
    const report = validate(cutOffHandguard(), gunDomain);
    expect(report.issues.some((i) => i.rule === 'required-ports' && i.parts.includes('handguard'))).toBe(true);
    expect(report.issues.filter((i) => i.rule === 'free-float-clearance')).toEqual([]);
  });
});
