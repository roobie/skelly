import { describe, expect, it } from 'vitest';
import type { Assembly, Domain } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { variant } from './helpers.ts';

const rulesFailed = (a: Assembly, domain: Domain = gunDomain) =>
  [...new Set(validate(a, domain).issues.map((i) => i.rule))].sort();

describe('rules', () => {
  it('port-compat: rejects mismatched mounts', () => {
    const a = variant('valid-rifle', (x) => {
      x.connections = x.connections.map((c) =>
        c.to === 'stock.front' ? { from: 'receiver.stock', to: 'grip.top' } : c.to === 'grip.top' ? { from: 'receiver.grip', to: 'stock.front' } : c,
      );
    });
    const issues = validate(a, gunDomain).issues.filter((i) => i.rule === 'port-compat');
    expect(issues.map((i) => i.message)).toEqual([
      'receiver.grip is a grip mount but stock.front is a stock mount.',
      'receiver.stock is a stock mount but grip.top is a grip mount.',
    ]);
  });

  it('port-compat: rejects two parts on one rail slot', () => {
    const a = variant('valid-rifle', (x) => {
      x.parts.sight2 = { family: 'sight' };
      x.connections.push({ from: 'receiver.rail', slot: 3, to: 'sight2.base' });
    });
    const messages = validate(a, gunDomain).issues.filter((i) => i.rule === 'port-compat').map((i) => i.message);
    expect(messages).toEqual(['receiver.rail[3] is used by both connection #6 and #7.']);
  });

  it('axis-alignment: rejects a bore that is parallel but offset', () => {
    // A domain whose barrel bore sits 1u above its mounting port.
    const offsetBarrel = gunDomain.families.barrel!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        barrel: {
          ...offsetBarrel,
          build: (p) => {
            const def = offsetBarrel.build(p);
            return { ...def, axes: [{ kind: 'bore', origin: [0, 1, 0], dir: [1, 0, 0] }] };
          },
        },
      },
    };
    const issues = validate(variant('valid-rifle', () => {}), domain).issues;
    expect(issues.map((i) => i.message)).toEqual(['The bore axis of barrel is 1u off the main axis.']);
  });

  it('axis-alignment: rejects an assembly not rooted on the bore line', () => {
    const a = variant('valid-rifle', (x) => { x.root = 'grip'; });
    expect(rulesFailed(a)).toEqual(['axis-alignment']);
  });

  it('keep-out: the part attached at the allowed port may occupy the volume', () => {
    // valid-rifle's magazine sits in the receiver's magazine-path volume.
    expect(rulesFailed(variant('valid-rifle', () => {}))).toEqual([]);
  });

  it('keep-out: without the allowance, the magazine intrudes', () => {
    const receiver = gunDomain.families.receiver!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        receiver: {
          ...receiver,
          build: (p) => {
            const def = receiver.build(p);
            return { ...def, keepOuts: def.keepOuts.map(({ allowPort: _, ...k }) => k) };
          },
        },
      },
    };
    const issues = validate(variant('valid-rifle', () => {}), domain).issues;
    expect(issues.map((i) => i.message)).toEqual([
      'magazine intrudes 2u into the magazine-path volume of receiver.',
    ]);
  });

  it('solid-overlap: allows directly connected parts to nest a little', () => {
    // The grip's tilted top corner dips into the receiver by about 0.46u.
    const r = validate(variant('valid-rifle', () => {}), gunDomain);
    expect(r.issues).toEqual([]);
  });
});
