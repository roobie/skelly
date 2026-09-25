import { describe, expect, it } from 'vitest';
import type { Assembly, Domain } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture, variant } from './helpers.ts';

const rulesFailed = (a: Assembly, domain: Domain = gunDomain) =>
  [...new Set(validate(a, domain).issues.map((i) => i.rule))].sort();

describe('rules', () => {
  it('port-compat: rejects mismatched mounts', () => {
    const a = variant('archetype-rifle', (x) => {
      const swapped: Record<string, (typeof x.connections)[number]> = {
        'stock.front': { from: 'receiver.stock', to: 'grip.top' },
        'grip.top': { from: 'lower.grip', to: 'stock.front' },
      };
      x.connections = x.connections.map((c) => swapped[c.to] ?? c);
    });
    const issues = validate(a, gunDomain).issues.filter((i) => i.rule === 'port-compat');
    expect(issues.map((i) => i.message)).toEqual([
      'lower.grip is a grip mount but stock.front is a stock mount.',
      'receiver.stock is a stock mount but grip.top is a grip mount.',
    ]);
  });

  it('port-compat: rejects two parts on one rail slot', () => {
    const a = variant('archetype-rifle', (x) => {
      x.parts.sight2 = { family: 'sight' };
      x.connections.push({ from: 'receiver.rail', slot: 3, to: 'sight2.base' });
    });
    const messages = validate(a, gunDomain)
      .issues.filter((i) => i.rule === 'port-compat')
      .map((i) => i.message);
    expect(messages).toEqual(['receiver.rail[3] is used by both connection #7 and #8.']);
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
    const { issues } = validate(loadFixture('archetype-rifle'), domain);
    expect(issues.map((i) => i.message)).toEqual(['The bore axis of barrel is 1u off the main axis.']);
  });

  it('axis-alignment: rejects an assembly not rooted on the bore line', () => {
    const a = variant('archetype-rifle', (x) => {
      x.root = 'grip';
    });
    expect(rulesFailed(a)).toEqual(['axis-alignment']);
  });

  it('keep-out: the part attached at the allowed port may occupy the volume', () => {
    // archetype-rifle's magazine sits in the receiver's magazine-path volume.
    expect(rulesFailed(loadFixture('archetype-rifle'))).toEqual([]);
  });

  it('keep-out: without the allowance, the magazine intrudes', () => {
    const lower = gunDomain.families.lower!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        lower: {
          ...lower,
          build: (p) => {
            const def = lower.build(p);
            return { ...def, keepOuts: def.keepOuts.map(({ allowPort: _, ...k }) => k) };
          },
        },
      },
    };
    const { issues } = validate(loadFixture('archetype-rifle'), domain);
    expect(issues.map((i) => i.message)).toEqual(['magazine intrudes 2u into the magazine-path volume of lower.']);
  });

  it('solid-overlap: allows directly connected parts to nest a little', () => {
    // The grip's tilted top corner dips into the receiver by about 0.46u.
    const r = validate(loadFixture('archetype-rifle'), gunDomain);
    expect(r.issues).toEqual([]);
  });

  it('domain rules are pluggable: without them, a gripless rifle passes', () => {
    const gripless = loadFixture('broken-firing-grip');
    expect(rulesFailed(gripless)).toEqual(['firing-grip']);
    expect(rulesFailed(gripless, { ...gunDomain, rules: [] })).toEqual([]);
  });

  it('feed-match: box-fed receiver on a trigger-only lower', () => {
    const { issues } = validate(loadFixture('broken-feed-match'), gunDomain);
    expect(issues.map((i) => i.message)).toEqual(['receiver is box-fed, but lower (trigger) has no magazine well.']);
  });

  it('feed-match: tube-fed receiver on a lower with a magazine well', () => {
    const a = variant('archetype-pump-shotgun', (x) => {
      x.parts.lower = { family: 'lower', params: { layout: 'conventional' } };
      x.parts.magazine = { family: 'magazine' };
      x.connections.push({ from: 'lower.magazine', to: 'magazine.top' });
    });
    const messages = validate(a, gunDomain)
      .issues.filter((i) => i.rule === 'feed-match')
      .map((i) => i.message);
    expect(messages).toEqual([
      "receiver is tube-fed, but lower (conventional) has a magazine well it can't feed from.",
    ]);
  });

  it('feed-match: top-fed receivers take a magazine well too', () => {
    expect(rulesFailed(loadFixture('archetype-bolt-rifle'))).toEqual([]);
  });
});
