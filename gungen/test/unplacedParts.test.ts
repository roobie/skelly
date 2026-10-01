import { describe, expect, it } from 'vitest';
import { resolve } from '../src/core/resolve.ts';
import { CORE_RULES } from '../src/core/rules.ts';
import type { Assembly } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixtures, type MutableAssembly, variant } from './helpers.ts';

const ALL_RULES = [...CORE_RULES, ...(gunDomain.rules ?? [])];

const touches = (ref: string, part: string): boolean => ref.startsWith(`${part}.`);

/** Every way a part can end up unplaced: cut off from the root, wired to a missing port, or no usable root. */
const brokenVariants = (assembly: Assembly): { name: string; assembly: Assembly }[] => {
  const out: { name: string; assembly: Assembly }[] = [];
  const edit = (name: string, fn: (a: MutableAssembly) => void): void => {
    const copy = structuredClone(assembly) as MutableAssembly;
    fn(copy);
    out.push({ name: `${assembly.name}: ${name}`, assembly: copy });
  };
  for (const part of Object.keys(assembly.parts)) {
    if (part === assembly.root) {
      continue;
    }
    edit(`${part} disconnected`, (a) => {
      a.connections = a.connections.filter((c) => !(touches(c.from, part) || touches(c.to, part)));
    });
  }
  assembly.connections.forEach((_, i) => {
    edit(`connection #${i} to a missing port`, (a) => {
      a.connections[i]!.to = `${a.connections[i]!.to.split('.')[0]}.no-such-port`;
    });
  });
  edit('missing root', (a) => {
    a.root = 'no-such-part';
  });
  return out;
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

  const cases = loadFixtures().flatMap(brokenVariants);

  it('has variants to sweep', () => {
    expect(cases.length).toBeGreaterThan(50);
  });

  for (const rule of ALL_RULES) {
    // Exhaustive solid-pair checks on every broken-fixture variant can exceed Vitest's 5s default.
    it(
      `${rule.id} does not throw on any unplaced-part variant`,
      () => {
        const failures: string[] = [];
        for (const { name, assembly } of cases) {
          try {
            rule.check(resolve(assembly, gunDomain));
          } catch (error) {
            failures.push(`${name}: ${(error as Error).message}`);
          }
        }
        expect(failures).toEqual([]);
      },
      rule.id === 'solid-overlap' || rule.id === 'connection-contact' ? 20_000 : 5000,
    );
  }

  it('leaves reporting the unplaced part to the structure and required-ports checks', () => {
    const report = validate(cutOffHandguard(), gunDomain);
    expect(report.issues.some((i) => i.rule === 'required-ports' && i.parts.includes('handguard'))).toBe(true);
    expect(report.issues.filter((i) => i.rule === 'free-float-clearance')).toEqual([]);
  });
});
